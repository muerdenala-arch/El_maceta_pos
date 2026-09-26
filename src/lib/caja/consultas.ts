import "server-only";
import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, type Db } from "@/db";
import { cajas, categorias, gastos, inventario, productos, qrPagos, sucursales, ventas } from "@/db/schema";
import type { Sesion } from "@/lib/auth/sesion";
import type { Tx } from "@/lib/inventario/stock";
import { resumenCierre, type ResumenCierre } from "./calculos";

export type Caja = typeof cajas.$inferSelect;

export async function cajaAbiertaDe(cajeroId: number): Promise<Caja | null> {
  const [c] = await db
    .select()
    .from(cajas)
    .where(and(eq(cajas.cajeroId, cajeroId), eq(cajas.estado, "abierta")));
  return c ?? null;
}

/** Para pantallas del cajero que necesitan caja abierta (venta, gastos, cierre). */
export async function requerirCajaAbierta(sesion: Sesion): Promise<Caja> {
  const caja = await cajaAbiertaDe(sesion.uid);
  if (!caja) redirect("/cajero/apertura");
  return caja;
}

/**
 * Totales vivos de una caja: ventas en efectivo y QR (completadas) y gastos no anulados.
 * Dentro de una transacción pasar `tx` (con PGlite, usar `db` dentro de una transacción la bloquea).
 */
export async function totalesCaja(
  cajaId: number,
  montoInicial: string,
  ejecutor: Db | Tx = db,
): Promise<ResumenCierre & { cantidadVentas: number }> {
  const [v] = await ejecutor
    .select({
      efectivo: sql<string>`coalesce(sum(${ventas.total}) filter (where ${ventas.metodoPago} = 'efectivo'), 0)::text`,
      qr: sql<string>`coalesce(sum(${ventas.total}) filter (where ${ventas.metodoPago} = 'qr'), 0)::text`,
      cantidad: sql<number>`count(*)::int`,
    })
    .from(ventas)
    .where(and(eq(ventas.cajaId, cajaId), eq(ventas.estado, "completada")));
  const [g] = await ejecutor
    .select({ total: sql<string>`coalesce(sum(${gastos.monto}), 0)::text` })
    .from(gastos)
    .where(and(eq(gastos.cajaId, cajaId), eq(gastos.anulado, false)));
  return { ...resumenCierre(montoInicial, v.efectivo, v.qr, g.total), cantidadVentas: v.cantidad };
}

export type ProductoPos = {
  id: number;
  nombre: string;
  marca: string | null;
  sabor: string | null;
  presentacion: string | null;
  categoria: string | null;
  categoriaId: number | null;
  codigoBarras: string | null;
  fotoUrl: string | null;
  precioVenta: string;
  stock: number;
};

/** Productos activos con precio de venta y stock de la sucursal (sin costo: lo ve el cajero). */
export async function productosPos(sucursalId: number): Promise<ProductoPos[]> {
  return db
    .select({
      id: productos.id,
      nombre: productos.nombre,
      marca: productos.marca,
      sabor: productos.sabor,
      presentacion: productos.presentacion,
      categoria: categorias.nombre,
      categoriaId: productos.categoriaId,
      codigoBarras: productos.codigoBarras,
      fotoUrl: productos.fotoUrl,
      precioVenta: productos.precioVenta,
      stock: sql<number>`coalesce(${inventario.cantidad}, 0)::int`,
    })
    .from(productos)
    .leftJoin(categorias, eq(categorias.id, productos.categoriaId))
    .leftJoin(inventario, and(eq(inventario.productoId, productos.id), eq(inventario.ubicacionId, sucursalId)))
    .where(eq(productos.activo, true))
    .orderBy(sql`coalesce(${inventario.cantidad}, 0) > 0 desc`, asc(productos.nombre));
}

export type QrCobro = { id: number; nombre: string; imagenUrl: string };

/** QR activos para la sucursal: los asignados a ella y los generales (sin sucursal). */
export async function qrsDeSucursal(sucursalId: number): Promise<QrCobro[]> {
  return db
    .select({ id: qrPagos.id, nombre: qrPagos.nombre, imagenUrl: qrPagos.imagenUrl })
    .from(qrPagos)
    .where(and(eq(qrPagos.activo, true), or(eq(qrPagos.sucursalId, sucursalId), isNull(qrPagos.sucursalId))))
    .orderBy(sql`${qrPagos.sucursalId} is null`, asc(qrPagos.id));
}

export async function nombreSucursal(id: number) {
  const [s] = await db.select({ nombre: sucursales.nombre }).from(sucursales).where(eq(sucursales.id, id));
  return s?.nombre ?? "";
}

/** Ventas de una caja (las del turno del cajero), de la más reciente a la más antigua. */
export async function ventasDeCaja(cajaId: number) {
  const filas = await db
    .select({
      id: ventas.id,
      numero: ventas.numeroComprobante,
      total: ventas.total,
      metodoPago: ventas.metodoPago,
      estado: ventas.estado,
      fecha: ventas.fecha,
    })
    .from(ventas)
    .where(eq(ventas.cajaId, cajaId))
    .orderBy(desc(ventas.fecha));
  return filas.map((f) => ({ ...f, fecha: f.fecha.toISOString() }));
}

export async function gastosDeCaja(cajaId: number) {
  const filas = await db
    .select({
      id: gastos.id,
      categoria: gastos.categoria,
      monto: gastos.monto,
      descripcion: gastos.descripcion,
      fotoUrl: gastos.fotoUrl,
      anulado: gastos.anulado,
      fecha: gastos.fecha,
    })
    .from(gastos)
    .where(eq(gastos.cajaId, cajaId))
    .orderBy(desc(gastos.fecha));
  return filas.map((f) => ({ ...f, fecha: f.fecha.toISOString() }));
}
