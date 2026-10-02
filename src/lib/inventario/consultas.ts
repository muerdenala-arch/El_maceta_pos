import "server-only";
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  alertas,
  detalleTransferencia,
  inventario,
  lotes,
  movimientosInventario,
  productos,
  sucursales,
  transferencias,
  usuarios,
} from "@/db/schema";
import { ZONA_HORARIA } from "@/lib/formato";
import { condicionBusqueda } from "@/lib/busqueda-sql";

export type Ubicacion = { id: number; nombre: string; tipo: "sucursal" | "bodega" };

/** Ubicaciones activas: la bodega primero. */
export async function listarUbicaciones(): Promise<Ubicacion[]> {
  return db
    .select({ id: sucursales.id, nombre: sucursales.nombre, tipo: sucursales.tipo })
    .from(sucursales)
    .where(eq(sucursales.activo, true))
    .orderBy(sql`${sucursales.tipo} = 'sucursal'`, asc(sucursales.id));
}

export type ProductoInventario = {
  id: number;
  nombre: string;
  marca: string | null;
  sabor: string | null;
  presentacion: string | null;
  codigoBarras: string | null;
  fotoUrl: string | null;
  stockMinimo: number;
  activo: boolean;
};

/** Productos activos y los inactivos que todavía tienen stock (sin precios: lo usa también el cajero). */
export async function listarProductosInventario(): Promise<ProductoInventario[]> {
  const conStock = db
    .select({ id: inventario.productoId })
    .from(inventario)
    .where(ne(inventario.cantidad, 0));
  return db
    .select({
      id: productos.id,
      nombre: productos.nombre,
      marca: productos.marca,
      sabor: productos.sabor,
      presentacion: productos.presentacion,
      codigoBarras: productos.codigoBarras,
      fotoUrl: productos.fotoUrl,
      stockMinimo: productos.stockMinimo,
      activo: productos.activo,
    })
    .from(productos)
    .where(or(eq(productos.activo, true), inArray(productos.id, conStock)))
    .orderBy(asc(productos.nombre));
}

/** Cantidades por producto y ubicación, como { "productoId:ubicacionId": cantidad }. */
export async function mapaStock(ubicacionIds?: number[]): Promise<Record<string, number>> {
  const filas = await db
    .select({ p: inventario.productoId, u: inventario.ubicacionId, c: inventario.cantidad })
    .from(inventario)
    .where(ubicacionIds ? inArray(inventario.ubicacionId, ubicacionIds) : undefined);
  return Object.fromEntries(filas.map((f) => [`${f.p}:${f.u}`, f.c]));
}

/** Unidades enviadas y aún no recibidas, como { "productoId:destinoId": cantidad }. */
export async function mapaEnCamino(destinoId?: number): Promise<Record<string, number>> {
  const filas = await db
    .select({
      p: detalleTransferencia.productoId,
      u: transferencias.destinoId,
      c: sql<number>`sum(${detalleTransferencia.cantidad})::int`,
    })
    .from(detalleTransferencia)
    .innerJoin(transferencias, eq(transferencias.id, detalleTransferencia.transferenciaId))
    .where(and(eq(transferencias.estado, "enviada"), destinoId ? eq(transferencias.destinoId, destinoId) : undefined))
    .groupBy(detalleTransferencia.productoId, transferencias.destinoId);
  return Object.fromEntries(filas.map((f) => [`${f.p}:${f.u}`, f.c]));
}

export type LoteVigente = {
  id: number;
  productoId: number;
  producto: string;
  presentacion: string | null;
  ubicacionId: number;
  ubicacion: string;
  cantidad: number;
  vencimiento: string;
};

/** Lotes con fecha de vencimiento y stock, del más próximo a vencer al más lejano. */
export async function listarLotesConVencimiento(ubicacionId?: number): Promise<LoteVigente[]> {
  const filas = await db
    .select({
      id: lotes.id,
      productoId: lotes.productoId,
      producto: productos.nombre,
      presentacion: productos.presentacion,
      ubicacionId: lotes.ubicacionId,
      ubicacion: sucursales.nombre,
      cantidad: lotes.cantidad,
      vencimiento: lotes.fechaVencimiento,
    })
    .from(lotes)
    .innerJoin(productos, eq(productos.id, lotes.productoId))
    .innerJoin(sucursales, eq(sucursales.id, lotes.ubicacionId))
    .where(and(gt(lotes.cantidad, 0), isNotNull(lotes.fechaVencimiento), ubicacionId ? eq(lotes.ubicacionId, ubicacionId) : undefined))
    .orderBy(asc(lotes.fechaVencimiento), asc(productos.nombre));
  return filas as LoteVigente[];
}

export type Transferencia = {
  id: number;
  estado: "enviada" | "recibida" | "cancelada";
  origen: string;
  destino: string;
  destinoId: number;
  nota: string | null;
  envia: string;
  recibe: string | null;
  enviadaEn: string;
  recibidaEn: string | null;
  lineas: { producto: string; presentacion: string | null; cantidad: number }[];
};

export async function listarTransferencias(opciones: { limite?: number; destinoId?: number } = {}): Promise<Transferencia[]> {
  const origen = alias(sucursales, "origen");
  const destino = alias(sucursales, "destino");
  const recibe = alias(usuarios, "recibe");

  const cabeceras = await db
    .select({
      id: transferencias.id,
      estado: transferencias.estado,
      origen: origen.nombre,
      destino: destino.nombre,
      destinoId: transferencias.destinoId,
      nota: transferencias.nota,
      envia: usuarios.nombre,
      recibe: recibe.nombre,
      enviadaEn: transferencias.enviadaEn,
      recibidaEn: transferencias.recibidaEn,
    })
    .from(transferencias)
    .innerJoin(origen, eq(origen.id, transferencias.origenId))
    .innerJoin(destino, eq(destino.id, transferencias.destinoId))
    .innerJoin(usuarios, eq(usuarios.id, transferencias.usuarioEnviaId))
    .leftJoin(recibe, eq(recibe.id, transferencias.usuarioRecibeId))
    .where(opciones.destinoId ? eq(transferencias.destinoId, opciones.destinoId) : undefined)
    // En camino primero, luego las más recientes.
    .orderBy(sql`${transferencias.estado} = 'enviada' desc`, desc(transferencias.id))
    .limit(opciones.limite ?? 50);
  if (cabeceras.length === 0) return [];

  const lineas = await db
    .select({
      transferenciaId: detalleTransferencia.transferenciaId,
      producto: productos.nombre,
      presentacion: productos.presentacion,
      cantidad: detalleTransferencia.cantidad,
    })
    .from(detalleTransferencia)
    .innerJoin(productos, eq(productos.id, detalleTransferencia.productoId))
    .where(inArray(detalleTransferencia.transferenciaId, cabeceras.map((c) => c.id)))
    .orderBy(asc(productos.nombre));

  return cabeceras.map((c) => ({
    ...c,
    enviadaEn: c.enviadaEn.toISOString(),
    recibidaEn: c.recibidaEn?.toISOString() ?? null,
    lineas: lineas
      .filter((l) => l.transferenciaId === c.id)
      .map((l) => ({ producto: l.producto, presentacion: l.presentacion, cantidad: l.cantidad })),
  }));
}

export type FiltrosMovimientos = {
  ubicacionId?: number;
  tipo?: string;
  producto?: string;
  desde?: string;
  hasta?: string;
  pagina?: number;
};
export const MOVIMIENTOS_POR_PAGINA = 50;

export async function listarMovimientos(f: FiltrosMovimientos) {
  const condiciones: SQL[] = [];
  if (f.ubicacionId) condiciones.push(eq(movimientosInventario.ubicacionId, f.ubicacionId));
  if (f.tipo) condiciones.push(sql`${movimientosInventario.tipo}::text = ${f.tipo}`);
  const busqueda = condicionBusqueda(f.producto, [productos.nombre, productos.marca, productos.presentacion, productos.codigoBarras, usuarios.nombre, movimientosInventario.motivo, movimientosInventario.referencia]);
  if (busqueda) condiciones.push(busqueda);
  if (f.desde) condiciones.push(gte(movimientosInventario.fecha, sql`(${f.desde}::date at time zone ${ZONA_HORARIA})`));
  if (f.hasta) condiciones.push(lte(movimientosInventario.fecha, sql`((${f.hasta}::date + 1) at time zone ${ZONA_HORARIA})`));
  const pagina = Math.max(1, f.pagina ?? 1);

  const filas = await db
    .select({
      id: movimientosInventario.id,
      fecha: movimientosInventario.fecha,
      tipo: movimientosInventario.tipo,
      productoId: movimientosInventario.productoId,
      producto: productos.nombre,
      presentacion: productos.presentacion,
      ubicacion: sucursales.nombre,
      cantidad: movimientosInventario.cantidad,
      usuario: usuarios.nombre,
      motivo: movimientosInventario.motivo,
      referencia: movimientosInventario.referencia,
    })
    .from(movimientosInventario)
    .innerJoin(productos, eq(productos.id, movimientosInventario.productoId))
    .innerJoin(sucursales, eq(sucursales.id, movimientosInventario.ubicacionId))
    .innerJoin(usuarios, eq(usuarios.id, movimientosInventario.usuarioId))
    .where(condiciones.length ? and(...condiciones) : undefined)
    .orderBy(desc(movimientosInventario.fecha), desc(movimientosInventario.id))
    .limit(MOVIMIENTOS_POR_PAGINA + 1)
    .offset((pagina - 1) * MOVIMIENTOS_POR_PAGINA);

  return {
    movimientos: filas.slice(0, MOVIMIENTOS_POR_PAGINA).map((m) => ({ ...m, fecha: m.fecha.toISOString() })),
    hayMas: filas.length > MOVIMIENTOS_POR_PAGINA,
    pagina,
  };
}

export type SolicitudReposicion = {
  id: number;
  productoId: number;
  producto: string;
  sucursalId: number;
  sucursal: string;
  mensaje: string;
  fecha: string;
};

export async function listarSolicitudesPendientes(): Promise<SolicitudReposicion[]> {
  const filas = await db
    .select({
      id: alertas.id,
      productoId: alertas.productoId,
      producto: productos.nombre,
      sucursalId: alertas.sucursalId,
      sucursal: sucursales.nombre,
      mensaje: alertas.mensaje,
      fecha: alertas.fecha,
    })
    .from(alertas)
    .innerJoin(productos, eq(productos.id, alertas.productoId))
    .innerJoin(sucursales, eq(sucursales.id, alertas.sucursalId))
    .where(and(eq(alertas.tipo, "solicitud_reposicion"), eq(alertas.resuelta, false)))
    .orderBy(asc(alertas.fecha));
  return filas.map((f) => ({ ...f, productoId: f.productoId!, sucursalId: f.sucursalId!, fecha: f.fecha.toISOString() }));
}
