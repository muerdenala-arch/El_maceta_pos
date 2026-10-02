import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { alertas, cajas, clientes, configuracion, detalleVenta, gastos, productos, sucursales, ventas, ventasCombos } from "@/db/schema";
import { esViolacionUnica, exito, fallo, type Resultado } from "@/lib/acciones/resultado";
import type { Sesion } from "@/lib/auth/sesion";
import { cambio, normalizarTelefono } from "@/lib/caja/calculos";
import { cajaAbiertaDe } from "@/lib/caja/consultas";
import { obtenerComprobante } from "@/lib/comprobante/consulta";
import type { DatosComprobante } from "@/lib/comprobante/datos";
import type { ComboVendido } from "@/lib/combos/calculo";
import { cotizarCombos } from "@/lib/combos/consultas";
import { aCentavos, deCentavos, sumar } from "@/lib/dinero";
import { formatoBs, hoyEnBolivia } from "@/lib/formato";
import { esFraccionado, unidadesDeLinea } from "@/lib/inventario/fraccion";
import { cambiarStock, ErrorStock, type Tx } from "@/lib/inventario/stock";
import { promocionesAutomaticas, validarCuponEn } from "@/lib/promociones/consultas";
import { aplicarPromociones, type LineaConDescuento } from "@/lib/promociones/motor";
import type { DatosGastoOffline, DatosVentaOffline, esquemaVenta } from "@/lib/validaciones/caja";
import type { z } from "zod";

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

export async function ventaExistente(uuid: string, cajeroId: number): Promise<VentaRealizada | null> {
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

type LineaFinal = Pick<LineaConDescuento, "productoId" | "cantidad" | "precioUnitario" | "descuento" | "promocionId"> & {
  fraccion?: boolean;
  /** Posición en `combos` del combo al que pertenece (null = producto suelto). */
  combo?: number | null;
};
type Catalogo = Awaited<ReturnType<typeof catalogoDe>>;

type NuevaVenta = {
  uuid: string;
  sucursalId: number;
  cajaId: number;
  cajeroId: number;
  lineas: LineaFinal[];
  /** Productos de las líneas (para pasar de envases o unidades sueltas a unidades de stock). */
  catalogo: Catalogo;
  /** Combos vendidos; sus productos van en `lineas` con `combo` = su posición aquí. */
  combos?: ComboVendido[];
  subtotal: string;
  descuento: string;
  total: string;
  metodoPago: "efectivo" | "qr";
  montoRecibido: string | null;
  cambio: string | null;
  cuponId: number | null;
  clienteNombre: string | null;
  clienteTelefono: string | null;
  /** Solo ventas sincronizadas: fecha del dispositivo, pago QR sin verificar y stock que puede quedar negativo. */
  offline?: { fecha: Date };
};

/** Inserta cliente, venta, detalle y movimientos de stock dentro de la transacción. */
async function insertarVenta(tx: Tx, n: NuevaVenta) {
  // Bloquea la sucursal: dos ventas simultáneas no pueden tomar el mismo número.
  await tx.select({ id: sucursales.id }).from(sucursales).where(eq(sucursales.id, n.sucursalId)).for("update");

  let clienteId: number | null = null;
  if (n.clienteNombre || n.clienteTelefono) {
    const [conf] = await tx.select({ codigoPais: configuracion.codigoPais }).from(configuracion).where(eq(configuracion.id, 1));
    const telefono = n.clienteTelefono ? normalizarTelefono(n.clienteTelefono, conf?.codigoPais) : null;
    const [existente] = telefono ? await tx.select({ id: clientes.id }).from(clientes).where(eq(clientes.telefono, telefono)) : [];
    if (existente) {
      clienteId = existente.id;
      if (n.clienteNombre) await tx.update(clientes).set({ nombre: n.clienteNombre }).where(eq(clientes.id, existente.id));
    } else {
      [{ id: clienteId }] = await tx.insert(clientes).values({ nombre: n.clienteNombre, telefono }).returning({ id: clientes.id });
    }
  }

  const [{ siguiente }] = await tx
    .select({ siguiente: sql<number>`coalesce(max(${ventas.numeroComprobante}), 0)::int + 1` })
    .from(ventas)
    .where(eq(ventas.sucursalId, n.sucursalId));

  const qrSinVerificar = n.offline && n.metodoPago === "qr";
  const [nueva] = await tx
    .insert(ventas)
    .values({
      uuidDispositivo: n.uuid,
      numeroComprobante: siguiente,
      sucursalId: n.sucursalId,
      cajaId: n.cajaId,
      cajeroId: n.cajeroId,
      clienteId,
      subtotal: n.subtotal,
      descuento: n.descuento,
      total: n.total,
      cuponId: n.cuponId,
      metodoPago: n.metodoPago,
      montoRecibido: n.montoRecibido,
      cambio: n.cambio,
      // Sin internet no se puede verificar un pago QR: queda "por confirmar" (sección 8 del plan).
      estadoPago: qrSinVerificar ? "qr_por_confirmar" : "pagado",
      // Enlace público del comprobante: aleatorio y no adivinable (nunca el número correlativo).
      tokenPublico: randomBytes(18).toString("base64url"),
      creadoOffline: !!n.offline,
      ...(n.offline && { fecha: n.offline.fecha }),
    })
    .returning();

  const idsCombo = n.combos?.length
    ? (await tx.insert(ventasCombos).values(n.combos.map((c) => ({ ventaId: nueva.id, ...c }))).returning({ id: ventasCombos.id })).map((c) => c.id)
    : [];

  await tx.insert(detalleVenta).values(
    n.lineas.map((l) => ({
      ventaId: nueva.id,
      ventaComboId: l.combo === null || l.combo === undefined ? null : idsCombo[l.combo],
      productoId: l.productoId,
      cantidad: l.cantidad,
      precioUnitario: l.precioUnitario,
      descuento: l.descuento,
      promocionId: l.promocionId,
      fraccion: !!l.fraccion,
      unidadFraccion: l.fraccion ? (n.catalogo.get(l.productoId)?.unidadFraccion ?? "capsula") : null,
      // Costo de lo vendido: el del envase, o su parte proporcional si se vendió por unidad suelta.
      costoUnitario: l.fraccion
        ? sql`(select round(${productos.precioCosto} / greatest(coalesce(${productos.unidadesPorEnvase}, 1), 1), 2) from ${productos} where ${productos.id} = ${l.productoId})`
        : sql`(select ${productos.precioCosto} from ${productos} where ${productos.id} = ${l.productoId})`,
    })),
  );

  for (const l of n.lineas) {
    const { cantidadFinal } = await cambiarStock(tx, {
      productoId: l.productoId,
      ubicacionId: n.sucursalId,
      // Un envase completo de un producto fraccionado descuenta todas sus unidades sueltas.
      delta: -unidadesDeLinea(l, n.catalogo.get(l.productoId)!),
      tipo: "venta",
      usuarioId: n.cajeroId,
      referencia: `Venta #${siguiente}${n.offline ? " (sin conexión)" : ""}`,
      // Offline: dos sucursales pueden haber vendido lo mismo. Se registra igual y se avisa al admin.
      permitirNegativo: !!n.offline,
    });
    if (cantidadFinal < 0) {
      const [p] = await tx.select({ nombre: productos.nombre }).from(productos).where(eq(productos.id, l.productoId));
      await tx.insert(alertas).values({
        tipo: "stock_negativo",
        productoId: l.productoId,
        sucursalId: n.sucursalId,
        ventaId: nueva.id,
        mensaje: `${p?.nombre ?? "Producto"} quedó con stock ${cantidadFinal} tras sincronizar una venta sin conexión. Ajusta el inventario.`,
      });
    }
  }

  if (qrSinVerificar) {
    await tx.insert(alertas).values({
      tipo: "qr_por_confirmar",
      ventaId: nueva.id,
      sucursalId: n.sucursalId,
      mensaje: `Venta #${siguiente} por QR hecha sin conexión: confirma que el pago de ${formatoBs(n.total)} llegó.`,
    });
  }
  return nueva;
}

const aResultado = (nueva: typeof ventas.$inferSelect): Omit<VentaRealizada, "comprobante"> => ({
  ventaId: nueva.id,
  numero: nueva.numeroComprobante,
  total: nueva.total,
  metodoPago: nueva.metodoPago,
  montoRecibido: nueva.montoRecibido,
  cambio: nueva.cambio,
  tokenPublico: nueva.tokenPublico,
});

async function catalogoDe(tx: Tx, ids: number[]) {
  const catalogo = await tx
    .select({
      id: productos.id,
      precioVenta: productos.precioVenta,
      categoriaId: productos.categoriaId,
      activo: productos.activo,
      fraccionado: productos.fraccionado,
      unidadFraccion: productos.unidadFraccion,
      unidadesPorEnvase: productos.unidadesPorEnvase,
      precioUnidad: productos.precioUnidad,
    })
    .from(productos)
    .where(inArray(productos.id, ids));
  return new Map(catalogo.map((p) => [p.id, p]));
}

/** Precio de la BD para la línea: el de la unidad suelta o el del envase completo. */
const precioDe = (p: { precioVenta: string; precioUnidad: string | null }, fraccion?: boolean) => (fraccion ? (p.precioUnidad ?? p.precioVenta) : p.precioVenta);

/**
 * Venta en línea: precios y promociones de la BD, cupón validado y consumido, stock suficiente.
 * Si algo falla, no se guarda nada.
 */
export async function registrarVentaEnLinea(sesion: Sesion, d: z.output<typeof esquemaVenta>): Promise<Resultado<VentaRealizada>> {
  // Idempotencia: la misma venta reenviada devuelve la ya registrada.
  const repetida = await ventaExistente(d.uuid, sesion.uid);
  if (repetida) return exito(repetida);

  const caja = await cajaAbiertaDe(sesion.uid);
  if (!caja) return fallo("Tu caja está cerrada. Ábrela antes de vender.");

  try {
    const venta = await db.transaction(async (tx) => {
      // Combos: cotizados con los precios de la BD; sus productos entran como líneas con el descuento repartido.
      const combos = await cotizarCombos(tx, d.combos, hoyEnBolivia());
      const porId = await catalogoDe(tx, [...d.lineas, ...combos.lineas].map((l) => l.productoId));
      if (d.lineas.some((l) => !porId.get(l.productoId)?.activo)) {
        throw new ErrorStock("Algún producto del carrito ya no está disponible. Actualiza la pantalla.");
      }
      if (d.lineas.some((l) => l.fraccion && !esFraccionado(porId.get(l.productoId)!))) {
        throw new ErrorStock("Algún producto del carrito ya no se vende por unidades sueltas. Actualiza la pantalla.");
      }
      const lineasCarrito = d.lineas.map((l) => ({
        ...l,
        precioUnitario: precioDe(porId.get(l.productoId)!, l.fraccion),
        categoriaId: porId.get(l.productoId)!.categoriaId,
      }));

      // Promociones vigentes de la BD (nunca las del dispositivo) + el cupón, si lo hay.
      const candidatas = await promocionesAutomaticas(caja.sucursalId, tx);
      if (d.cuponCodigo) {
        const cupon = await validarCuponEn(d.cuponCodigo, caja.sucursalId, tx);
        if (!cupon.ok) throw new ErrorStock(cupon.error);
        candidatas.push(cupon.promocion);
      }
      // Las promociones y el cupón solo tocan los productos sueltos: el combo ya trae su descuento.
      const sueltos = aplicarPromociones(lineasCarrito, candidatas);
      const promo = {
        ...sueltos,
        subtotal: sumar(sueltos.subtotal, combos.subtotal),
        descuento: sumar(sueltos.descuento, combos.descuento),
        total: sumar(sueltos.total, combos.total),
      };
      // El cupón solo se gasta si realmente dio el descuento (si otra promoción era mejor, no se usa).
      const cuponUsado = promo.aplicadas.find((a) => a.cuponId)?.cuponId ?? null;
      if (cuponUsado && d.cuponCodigo) {
        const consumo = await validarCuponEn(d.cuponCodigo, caja.sucursalId, tx, { consumir: true });
        if (!consumo.ok) throw new ErrorStock(consumo.error);
      }

      let vuelto: string | null = null;
      if (d.metodoPago === "efectivo") {
        vuelto = cambio(promo.total, d.montoRecibido!);
        if (vuelto === null) throw new ErrorStock(`El monto recibido no alcanza: el total es ${formatoBs(promo.total)}`);
      }

      const nueva = await insertarVenta(tx, {
        uuid: d.uuid,
        sucursalId: caja.sucursalId,
        cajaId: caja.id,
        cajeroId: sesion.uid,
        lineas: [...promo.lineas, ...combos.lineas],
        catalogo: porId,
        combos: combos.combos,
        subtotal: promo.subtotal,
        descuento: promo.descuento,
        total: promo.total,
        metodoPago: d.metodoPago,
        montoRecibido: d.metodoPago === "efectivo" ? d.montoRecibido : null,
        cambio: vuelto,
        cuponId: cuponUsado,
        clienteNombre: d.clienteNombre,
        clienteTelefono: d.clienteTelefono,
      });
      return aResultado(nueva);
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
}

export type ResultadoSync =
  | { ok: true; numero: number; tokenPublico: string; ventaId: number }
  | { ok: false; error: string; /** No se resuelve reintentando: necesita que alguien lo revise. */ permanente: boolean };

/**
 * Venta hecha sin conexión que llega al sincronizar. Lo que se cobró en el dispositivo es un hecho:
 * se registra con sus precios y descuentos, pero se compara con la BD y se avisa al admin si no coincide.
 * Stock negativo permitido (con alerta). Idempotente por UUID.
 */
export async function registrarVentaOffline(sesion: Sesion, d: DatosVentaOffline): Promise<ResultadoSync> {
  const ya = await ventaExistente(d.uuid, sesion.uid);
  if (ya) return { ok: true, numero: ya.numero, tokenPublico: ya.tokenPublico, ventaId: ya.ventaId };

  const [caja] = await db.select().from(cajas).where(and(eq(cajas.id, d.cajaId), eq(cajas.cajeroId, sesion.uid)));
  if (!caja) return { ok: false, error: "La caja de esta venta no existe o no es tuya", permanente: true };
  if (caja.estado !== "abierta") {
    return { ok: false, error: "La caja de esta venta ya fue cerrada: avisa al administrador", permanente: true };
  }

  // Coherencia interna de lo cobrado (en centavos exactos).
  let subtotal = 0n;
  let descuento = 0n;
  for (const l of d.lineas) {
    const sub = aCentavos(l.precioUnitario) * BigInt(l.cantidad);
    if (aCentavos(l.descuento) > sub) return { ok: false, error: "Descuento mayor que el importe de una línea", permanente: true };
    subtotal += sub;
    descuento += aCentavos(l.descuento);
  }
  const total = deCentavos(subtotal - descuento);
  let vuelto: string | null = null;
  if (d.metodoPago === "efectivo") {
    vuelto = d.montoRecibido ? cambio(total, d.montoRecibido) : null;
    if (vuelto === null) return { ok: false, error: "El monto recibido no alcanza el total", permanente: true };
  }

  // La fecha del dispositivo, acotada: no antes de abrir la caja ni en el futuro.
  const ahora = Date.now();
  const fecha = new Date(Math.min(Math.max(d.fecha, caja.apertura.getTime()), ahora));

  try {
    const nueva = await db.transaction(async (tx) => {
      const porId = await catalogoDe(tx, d.lineas.map((l) => l.productoId));
      if (d.lineas.some((l) => !porId.has(l.productoId))) throw new ErrorStock("Algún producto de la venta ya no existe");

      // Lo que la BD habría cobrado en ese momento, para detectar diferencias.
      let combosEsperados = "0.00";
      try {
        combosEsperados = (await cotizarCombos(tx, d.combos.map((c) => ({ comboId: c.comboId, cantidad: c.cantidad })), hoyEnBolivia(fecha))).total;
      } catch (e) {
        if (!(e instanceof ErrorStock)) throw e; // combo ya no vigente: la venta se registra y saltará la alerta de revisión
      }
      const esperado = aplicarPromociones(
        d.lineas.filter((l) => l.combo === null).map((l) => ({
          productoId: l.productoId,
          cantidad: l.cantidad,
          fraccion: l.fraccion,
          precioUnitario: precioDe(porId.get(l.productoId)!, l.fraccion),
          categoriaId: porId.get(l.productoId)!.categoriaId,
        })),
        await promocionesAutomaticas(caja.sucursalId, tx, fecha),
      );

      const venta = await insertarVenta(tx, {
        uuid: d.uuid,
        sucursalId: caja.sucursalId,
        cajaId: caja.id,
        cajeroId: sesion.uid,
        lineas: d.lineas,
        catalogo: porId,
        combos: d.combos,
        subtotal: deCentavos(subtotal),
        descuento: deCentavos(descuento),
        total,
        metodoPago: d.metodoPago,
        montoRecibido: d.metodoPago === "efectivo" ? d.montoRecibido : null,
        cambio: vuelto,
        cuponId: null,
        clienteNombre: d.clienteNombre,
        clienteTelefono: d.clienteTelefono,
        offline: { fecha },
      });

      const totalEsperado = sumar(esperado.total, combosEsperados);
      if (aCentavos(totalEsperado) !== aCentavos(total)) {
        await tx.insert(alertas).values({
          tipo: "revision_offline",
          ventaId: venta.id,
          sucursalId: caja.sucursalId,
          mensaje: `Venta #${venta.numeroComprobante} sin conexión cobrada en ${formatoBs(total)}; con los precios y promociones actuales serían ${formatoBs(totalEsperado)}.`,
        });
      }
      return venta;
    });
    return { ok: true, numero: nueva.numeroComprobante, tokenPublico: nueva.tokenPublico, ventaId: nueva.id };
  } catch (e) {
    if (e instanceof ErrorStock) return { ok: false, error: e.message, permanente: true };
    if (esViolacionUnica(e, "ventas_uuid_dispositivo_uq")) {
      const repetida = await ventaExistente(d.uuid, sesion.uid);
      if (repetida) return { ok: true, numero: repetida.numero, tokenPublico: repetida.tokenPublico, ventaId: repetida.ventaId };
    }
    throw e;
  }
}

/** Gasto registrado sin conexión: se agrega a su caja si sigue abierta. Idempotente por UUID. */
export async function registrarGastoOffline(sesion: Sesion, d: DatosGastoOffline): Promise<ResultadoSync | { ok: true }> {
  const [caja] = await db.select().from(cajas).where(and(eq(cajas.id, d.cajaId), eq(cajas.cajeroId, sesion.uid)));
  if (!caja) return { ok: false, error: "La caja de este gasto no existe o no es tuya", permanente: true };
  const [yaExiste] = await db.select({ id: gastos.id }).from(gastos).where(eq(gastos.uuidDispositivo, d.uuid));
  if (yaExiste) return { ok: true };
  if (caja.estado !== "abierta") return { ok: false, error: "La caja de este gasto ya fue cerrada: avisa al administrador", permanente: true };

  try {
    await db.insert(gastos).values({
      uuidDispositivo: d.uuid,
      cajaId: caja.id,
      sucursalId: caja.sucursalId,
      usuarioId: sesion.uid,
      categoria: d.categoria,
      monto: d.monto,
      descripcion: d.descripcion,
      fecha: new Date(Math.min(Math.max(d.fecha, caja.apertura.getTime()), Date.now())),
    });
  } catch (e) {
    if (!esViolacionUnica(e, "gastos_uuid_dispositivo_uq")) throw e;
  }
  return { ok: true };
}
