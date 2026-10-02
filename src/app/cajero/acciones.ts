"use server";

import { and, eq, ilike, or, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { alertas, cajas, clientes, gastos, sucursales, usuarios } from "@/db/schema";
import { conPermiso, esViolacionUnica, exito, fallo, falloValidacion, type Resultado } from "@/lib/acciones/resultado";
import { registrarAuditoria } from "@/lib/auditoria";
import { autorizar } from "@/lib/auth/sesion";
import { diferenciaCierre } from "@/lib/caja/calculos";
import { cajaAbiertaDe, totalesCaja } from "@/lib/caja/consultas";
import { registrarVentaEnLinea, type VentaRealizada } from "@/lib/caja/registro";
import { obtenerComprobante, puedeVerVenta } from "@/lib/comprobante/consulta";
import type { DatosComprobante } from "@/lib/comprobante/datos";
import { aCentavos } from "@/lib/dinero";
import { formatoBs } from "@/lib/formato";
import { buscarCupon } from "@/lib/promociones/consultas";
import type { CuponVenta } from "@/lib/promociones/venta";
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
import { ROLES_CAJA } from "@/lib/auth/constantes";

// ---------------------------------------------------------------- Apertura

export async function abrirCaja(entrada: DatosApertura): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizar(...ROLES_CAJA);
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

export type { VentaRealizada } from "@/lib/caja/registro";

/**
 * Registra una venta en una sola transacción: precios y promociones de la BD, stock suficiente,
 * número correlativo por sucursal, cliente (opcional) y descuento de inventario (ver lib/caja/registro.ts).
 */
export async function registrarVenta(entrada: DatosVenta): Promise<Resultado<VentaRealizada>> {
  return conPermiso(async () => {
    const sesion = await autorizar(...ROLES_CAJA);
    const v = esquemaVenta.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);
    return registrarVentaEnLinea(sesion, v.data);
  });
}

/** Comprobante para reimprimir/reenviar: el cajero solo sus ventas del día; el admin, cualquiera. */
export async function verComprobante(ventaId: number): Promise<Resultado<DatosComprobante>> {
  return conPermiso(async () => {
    const sesion = await autorizar(...ROLES_CAJA, "admin");
    const id = Number(ventaId);
    if (!Number.isInteger(id) || id <= 0 || !(await puedeVerVenta(sesion, id))) return fallo("No puedes ver este comprobante");
    const datos = await obtenerComprobante({ ventaId: id });
    return datos ? exito(datos) : fallo("La venta no existe");
  });
}

/**
 * Busca un cupón para mostrar su descuento antes de cobrar (no lo gasta: eso ocurre al registrar la venta).
 * Si no se puede usar, dice por qué: no existe, vencido, agotado, desactivado, de otra sucursal…
 */
export async function consultarCupon(codigo: string): Promise<Resultado<CuponVenta>> {
  return conPermiso(async () => {
    const sesion = await autorizar(...ROLES_CAJA);
    if (!sesion.sucursalId) return fallo("No tienes una sucursal asignada");
    const limpio = String(codigo ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,40}$/.test(limpio)) return fallo("Código inválido");
    const r = await buscarCupon(limpio, sesion.sucursalId);
    return r.ok ? exito(r.cupon) : fallo(r.error);
  });
}

export type ClienteEncontrado = { id: number; nombre: string | null; telefono: string | null };

/** Búsqueda de clientes ya registrados por nombre o teléfono (mínimo 2 caracteres). */
export async function buscarClientes(consulta: string): Promise<ClienteEncontrado[]> {
  await autorizar(...ROLES_CAJA, "admin");
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
    const sesion = await autorizar(...ROLES_CAJA);
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
    const sesion = await autorizar(...ROLES_CAJA);
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
