"use server";

import { randomBytes } from "node:crypto";
import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { alertas, cajas, clientes, configuracion, detalleVenta, gastos, productos, sucursales, usuarios, ventas } from "@/db/schema";
import { conPermiso, esViolacionUnica, exito, fallo, falloValidacion, type Resultado } from "@/lib/acciones/resultado";
import { registrarAuditoria } from "@/lib/auditoria";
import { autorizar } from "@/lib/auth/sesion";
import { cambio, diferenciaCierre, normalizarTelefono } from "@/lib/caja/calculos";
import { cajaAbiertaDe, totalesCaja } from "@/lib/caja/consultas";
import { obtenerComprobante, puedeVerVenta } from "@/lib/comprobante/consulta";
import type { DatosComprobante } from "@/lib/comprobante/datos";
import { aCentavos } from "@/lib/dinero";
import { formatoBs } from "@/lib/formato";
import { cambiarStock, ErrorStock } from "@/lib/inventario/stock";
import { promocionesAutomaticas, validarCuponEn } from "@/lib/promociones/consultas";
import { aplicarPromociones, type Promocion } from "@/lib/promociones/motor";
import {
  esquemaApertura,
  esquemaCierre,
  esquemaGasto,
  esquemaVenta,
  type DatosApertura,
  type DatosCierre,
  type DatosGasto,
  type DatosVenta,
} from "@/lib/validaciones/caja";

// ---------------------------------------------------------------- Apertura

export async function abrirCaja(entrada: DatosApertura): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizar("cajero");
    if (!sesion.sucursalId) return fallo("No tienes una sucursal asignada");
    const v = esquemaApertura.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);

    try {
      const [caja] = await db
        .insert(cajas)
        .values({ sucursalId: sesion.sucursalId, cajeroId: sesion.uid, montoInicial: v.data.montoInicial })
        .returning({ id: cajas.id });
      await registrarAuditoria("caja_abierta", { usuarioId: sesion.uid, detalle: { cajaId: caja.id, montoInicial: v.data.montoInicial } });
    } catch (e) {
      // Índice único parcial: una sola caja abierta por cajero (p. ej. dos pestañas a la vez).
      if (esViolacionUnica(e, "cajas_una_abierta_por_cajero_uq")) return exito();
      throw e;
    }
    refresh();
    return exito();
  });
}

// ---------------------------------------------------------------- Venta

export type VentaRealizada = {
  ventaId: number;
  numero: number;
  total: string;
  metodoPago: "efectivo" | "qr";
  montoRecibido: string | null;
  cambio: string | null;
  tokenPublico: string;
  /** Para imprimir, descargar o enviar el comprobante desde la pantalla "Venta realizada". */
  comprobante: DatosComprobante | null;
};

async function ventaExistente(uuid: string, cajeroId: number): Promise<VentaRealizada | null> {
  const [v] = await db
    .select({
      ventaId: ventas.id,
      numero: ventas.numeroComprobante,
      total: ventas.total,
      metodoPago: ventas.metodoPago,
      montoRecibido: ventas.montoRecibido,
      cambio: ventas.cambio,
      tokenPublico: ventas.tokenPublico,
    })
    .from(ventas)
    .where(and(eq(ventas.uuidDispositivo, uuid), eq(ventas.cajeroId, cajeroId)));
  return v ? { ...v, comprobante: await obtenerComprobante({ ventaId: v.ventaId }) } : null;
}

/**
 * Registra una venta en una sola transacción: precios de la BD, stock suficiente, número correlativo
 * por sucursal, cliente (opcional), detalle y descuento de inventario. Si algo falla, no se guarda nada.
 */
export async function registrarVenta(entrada: DatosVenta): Promise<Resultado<VentaRealizada>> {
  return conPermiso(async () => {
    const sesion = await autorizar("cajero");
    const v = esquemaVenta.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);
    const d = v.data;

    // Idempotencia: la misma venta reenviada devuelve la ya registrada.
    const repetida = await ventaExistente(d.uuid, sesion.uid);
    if (repetida) return exito(repetida);

    const caja = await cajaAbiertaDe(sesion.uid);
    if (!caja) return fallo("Tu caja está cerrada. Ábrela antes de vender.");

    try {
      const venta = await db.transaction(async (tx) => {
        // Bloquea la sucursal: dos ventas simultáneas no pueden tomar el mismo número.
        await tx.select({ id: sucursales.id }).from(sucursales).where(eq(sucursales.id, caja.sucursalId)).for("update");

        const ids = d.lineas.map((l) => l.productoId);
        const catalogo = await tx
          .select({ id: productos.id, precioVenta: productos.precioVenta, categoriaId: productos.categoriaId })
          .from(productos)
          .where(and(inArray(productos.id, ids), eq(productos.activo, true)));
        if (catalogo.length !== ids.length) throw new ErrorStock("Algún producto del carrito ya no está disponible. Actualiza la pantalla.");
        const porId = new Map(catalogo.map((p) => [p.id, p]));
        const lineasCarrito = d.lineas.map((l) => ({
          ...l,
          precioUnitario: porId.get(l.productoId)!.precioVenta,
          categoriaId: porId.get(l.productoId)!.categoriaId,
        }));

        // Promociones vigentes de la BD (nunca las del dispositivo) + el cupón, si lo hay.
        const candidatas = await promocionesAutomaticas(caja.sucursalId, tx);
        if (d.cuponCodigo) {
          const cupon = await validarCuponEn(d.cuponCodigo, caja.sucursalId, tx);
          if (!cupon.ok) throw new ErrorStock(cupon.error);
          candidatas.push(cupon.promocion);
        }
        const promo = aplicarPromociones(lineasCarrito, candidatas);
        // El cupón solo se gasta si realmente dio el descuento (si otra promoción era mejor, no se usa).
        const cuponUsado = promo.aplicadas.find((a) => a.cuponId)?.cuponId ?? null;
        if (cuponUsado && d.cuponCodigo) {
          const consumo = await validarCuponEn(d.cuponCodigo, caja.sucursalId, tx, { consumir: true });
          if (!consumo.ok) throw new ErrorStock(consumo.error);
        }
        const lineas = promo.lineas;
        const totales = { subtotal: promo.subtotal, descuento: promo.descuento, total: promo.total };
        let vuelto: string | null = null;
        if (d.metodoPago === "efectivo") {
          vuelto = cambio(totales.total, d.montoRecibido!);
          if (vuelto === null) throw new ErrorStock(`El monto recibido no alcanza: el total es ${formatoBs(totales.total)}`);
        }

        let clienteId: number | null = null;
        if (d.clienteNombre || d.clienteTelefono) {
          const [conf] = await tx.select({ codigoPais: configuracion.codigoPais }).from(configuracion).where(eq(configuracion.id, 1));
          const telefono = d.clienteTelefono ? normalizarTelefono(d.clienteTelefono, conf?.codigoPais) : null;
          const [existente] = telefono
            ? await tx.select({ id: clientes.id }).from(clientes).where(eq(clientes.telefono, telefono))
            : [];
          if (existente) {
            clienteId = existente.id;
            if (d.clienteNombre) await tx.update(clientes).set({ nombre: d.clienteNombre }).where(eq(clientes.id, existente.id));
          } else {
            [{ id: clienteId }] = await tx
              .insert(clientes)
              .values({ nombre: d.clienteNombre, telefono })
              .returning({ id: clientes.id });
          }
        }

        const [{ siguiente }] = await tx
          .select({ siguiente: sql<number>`coalesce(max(${ventas.numeroComprobante}), 0)::int + 1` })
          .from(ventas)
          .where(eq(ventas.sucursalId, caja.sucursalId));

        const [nueva] = await tx
          .insert(ventas)
          .values({
            uuidDispositivo: d.uuid,
            numeroComprobante: siguiente,
            sucursalId: caja.sucursalId,
            cajaId: caja.id,
            cajeroId: sesion.uid,
            clienteId,
            subtotal: totales.subtotal,
            descuento: totales.descuento,
            total: totales.total,
            cuponId: cuponUsado,
            metodoPago: d.metodoPago,
            montoRecibido: d.metodoPago === "efectivo" ? d.montoRecibido : null,
            cambio: vuelto,
            // Enlace público del comprobante: aleatorio y no adivinable (nunca el número correlativo).
            tokenPublico: randomBytes(18).toString("base64url"),
          })
          .returning();

        await tx.insert(detalleVenta).values(
          lineas.map((l) => ({
            ventaId: nueva.id,
            productoId: l.productoId,
            cantidad: l.cantidad,
            precioUnitario: l.precioUnitario,
            descuento: l.descuento,
            promocionId: l.promocionId,
          })),
        );
        for (const l of lineas) {
          await cambiarStock(tx, {
            productoId: l.productoId,
            ubicacionId: caja.sucursalId,
            delta: -l.cantidad,
            tipo: "venta",
            usuarioId: sesion.uid,
            referencia: `Venta #${siguiente}`,
          });
        }

        return {
          ventaId: nueva.id,
          numero: nueva.numeroComprobante,
          total: nueva.total,
          metodoPago: nueva.metodoPago,
          montoRecibido: nueva.montoRecibido,
          cambio: nueva.cambio,
          tokenPublico: nueva.tokenPublico,
        };
      });
      return exito({ ...venta, comprobante: await obtenerComprobante({ ventaId: venta.ventaId }) });
    } catch (e) {
      if (e instanceof ErrorStock) return fallo(e.message);
      // Doble envío simultáneo de la misma venta: gana uno y el otro devuelve el mismo resultado.
      if (esViolacionUnica(e, "ventas_uuid_dispositivo_uq")) {
        const ya = await ventaExistente(d.uuid, sesion.uid);
        if (ya) return exito(ya);
      }
      throw e;
    }
  });
}

/** Comprobante para reimprimir/reenviar: el cajero solo sus ventas del día; el admin, cualquiera. */
export async function verComprobante(ventaId: number): Promise<Resultado<DatosComprobante>> {
  return conPermiso(async () => {
    const sesion = await autorizar("cajero", "admin");
    const id = Number(ventaId);
    if (!Number.isInteger(id) || id <= 0 || !(await puedeVerVenta(sesion, id))) return fallo("No puedes ver este comprobante");
    const datos = await obtenerComprobante({ ventaId: id });
    return datos ? exito(datos) : fallo("La venta no existe");
  });
}

/** Valida un cupón para mostrar el descuento antes de cobrar (no lo consume: eso ocurre al registrar la venta). */
export async function consultarCupon(codigo: string): Promise<Resultado<Promocion>> {
  return conPermiso(async () => {
    const sesion = await autorizar("cajero");
    if (!sesion.sucursalId) return fallo("No tienes una sucursal asignada");
    const limpio = String(codigo ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,40}$/.test(limpio)) return fallo("Código inválido");
    const r = await validarCuponEn(limpio, sesion.sucursalId);
    return r.ok ? exito(r.promocion) : fallo(r.error);
  });
}

export type ClienteEncontrado = { id: number; nombre: string | null; telefono: string | null };

/** Búsqueda de clientes ya registrados por nombre o teléfono (mínimo 2 caracteres). */
export async function buscarClientes(consulta: string): Promise<ClienteEncontrado[]> {
  await autorizar("cajero", "admin");
  const q = String(consulta ?? "").trim().slice(0, 60);
  if (q.length < 2) return [];
  const digitos = q.replace(/\D/g, "");
  return db
    .select({ id: clientes.id, nombre: clientes.nombre, telefono: clientes.telefono })
    .from(clientes)
    .where(
      or(
        ilike(clientes.nombre, `%${q.replace(/[%_\\]/g, "\\$&")}%`),
        digitos.length >= 3 ? sql`${clientes.telefono} like ${`%${digitos}%`}` : undefined,
      ),
    )
    .limit(8);
}

// ---------------------------------------------------------------- Gastos

export async function registrarGasto(entrada: DatosGasto): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizar("cajero");
    const v = esquemaGasto.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);
    const caja = await cajaAbiertaDe(sesion.uid);
    if (!caja) return fallo("Tu caja está cerrada. Los gastos se registran con la caja abierta.");

    try {
      await db.insert(gastos).values({
        uuidDispositivo: v.data.uuid,
        cajaId: caja.id,
        sucursalId: caja.sucursalId,
        usuarioId: sesion.uid,
        categoria: v.data.categoria,
        monto: v.data.monto,
        descripcion: v.data.descripcion,
        fotoUrl: v.data.fotoUrl,
      });
    } catch (e) {
      if (!esViolacionUnica(e, "gastos_uuid_dispositivo_uq")) throw e; // reenvío: ya estaba registrado
    }
    refresh();
    return exito();
  });
}

// ---------------------------------------------------------------- Cierre

export type CierreRealizado = {
  esperado: string;
  contado: string;
  diferencia: string;
};

/** Cierra la caja con el efectivo contado. Una vez cerrada no se modifica; si no cuadra, alerta al admin. */
export async function cerrarCaja(entrada: DatosCierre): Promise<Resultado<CierreRealizado>> {
  return conPermiso(async () => {
    const sesion = await autorizar("cajero");
    const v = esquemaCierre.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);
    const contado = v.data.efectivoContado;

    const resultado = await db.transaction(async (tx) => {
      const [caja] = await tx
        .select()
        .from(cajas)
        .where(and(eq(cajas.cajeroId, sesion.uid), eq(cajas.estado, "abierta")))
        .for("update");
      if (!caja) return null;

      const t = await totalesCaja(caja.id, caja.montoInicial, tx);
      const diferencia = diferenciaCierre(t.esperado, contado);
      await tx
        .update(cajas)
        .set({
          estado: "cerrada",
          cierre: new Date(),
          ventasEfectivo: t.ventasEfectivo,
          ventasQr: t.ventasQr,
          gastos: t.gastos,
          esperado: t.esperado,
          efectivoContado: contado,
          diferencia,
        })
        .where(eq(cajas.id, caja.id));

      if (aCentavos(diferencia) !== 0n) {
        const [u] = await tx.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, sesion.uid));
        const [s] = await tx.select({ nombre: sucursales.nombre }).from(sucursales).where(eq(sucursales.id, caja.sucursalId));
        const tipo = aCentavos(diferencia) < 0n ? "faltante" : "sobrante";
        await tx.insert(alertas).values({
          tipo: "caja_diferencia",
          cajaId: caja.id,
          sucursalId: caja.sucursalId,
          mensaje: `Caja de ${u?.nombre} (${s?.nombre}) cerrada con ${tipo} de ${formatoBs(diferencia.replace("-", ""))}`,
        });
      }
      return { cajaId: caja.id, esperado: t.esperado, contado, diferencia };
    });

    if (!resultado) return fallo("No tienes una caja abierta");
    await registrarAuditoria("caja_cerrada", { usuarioId: sesion.uid, detalle: resultado });
    return exito({ esperado: resultado.esperado, contado: resultado.contado, diferencia: resultado.diferencia });
  });
}
