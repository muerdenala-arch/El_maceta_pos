import "server-only";
import { and, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { clientes, detalleVenta, gastos, productos, sucursales, usuarios, ventas } from "@/db/schema";
import type { VentaResumida } from "@/components/comprobante/lista-ventas";
import { condicionBusqueda } from "@/lib/busqueda-sql";
import { inicioDiaBolivia, ZONA_HORARIA } from "@/lib/formato";
import type { FiltrosReporte } from "./filtros";

/** Condiciones de ventas según los filtros (incluye anuladas; cada consulta decide si las cuenta). */
function condiciones(f: FiltrosReporte): SQL {
  return and(
    gte(ventas.fecha, inicioDiaBolivia(f.desde)),
    lt(ventas.fecha, inicioDiaBolivia(f.hasta, true)),
    f.sucursalId ? eq(ventas.sucursalId, f.sucursalId) : undefined,
    f.cajeroId ? eq(ventas.cajeroId, f.cajeroId) : undefined,
    f.metodo ? eq(ventas.metodoPago, f.metodo) : undefined,
    f.productoId
      ? sql`exists (select 1 from ${detalleVenta} where ${detalleVenta.ventaId} = ${ventas.id} and ${detalleVenta.productoId} = ${f.productoId})`
      : undefined,
  )!;
}

/** Zona como literal (constante, no dato del usuario): con parámetro, SELECT y GROUP BY no coincidirían. */
const ZONA_LITERAL = sql.raw(`'${ZONA_HORARIA}'`);
const completada = eq(ventas.estado, "completada");
/** Importe neto de una línea y su costo (costo guardado en la venta; si falta, el actual del producto). */
const netoLinea = sql`(${detalleVenta.cantidad} * ${detalleVenta.precioUnitario} - ${detalleVenta.descuento})`;
const costoLinea = sql`(${detalleVenta.cantidad} * coalesce(${detalleVenta.costoUnitario}, ${productos.precioCosto}))`;
/** Con filtro de producto, las cifras por línea (costo, ganancia) se limitan a ese producto. */
const lineaDelProducto = (f: FiltrosReporte) => (f.productoId ? eq(detalleVenta.productoId, f.productoId) : undefined);

export type ResumenVentas = {
  cantidad: number;
  total: string;
  descuentos: string;
  efectivo: string;
  qr: string;
  qrPorConfirmar: number;
  anuladas: number;
  totalAnuladas: string;
  /** Costo y ganancia de las líneas (con filtro de producto: solo ese producto). */
  ventaLineas: string;
  costo: string;
  unidades: number;
  /** Unidades sueltas vendidas (venta fraccionada). */
  sueltas: number;
  gastos: string;
};

export async function resumenVentas(f: FiltrosReporte): Promise<ResumenVentas> {
  const [[v], [l], [g]] = await Promise.all([
    db
      .select({
        cantidad: sql<number>`count(*) filter (where ${completada})::int`,
        total: sql<string>`coalesce(sum(${ventas.total}) filter (where ${completada}), 0)::text`,
        descuentos: sql<string>`coalesce(sum(${ventas.descuento}) filter (where ${completada}), 0)::text`,
        efectivo: sql<string>`coalesce(sum(${ventas.total}) filter (where ${completada} and ${ventas.metodoPago} = 'efectivo'), 0)::text`,
        qr: sql<string>`coalesce(sum(${ventas.total}) filter (where ${completada} and ${ventas.metodoPago} = 'qr'), 0)::text`,
        qrPorConfirmar: sql<number>`count(*) filter (where ${completada} and ${ventas.estadoPago} = 'qr_por_confirmar')::int`,
        anuladas: sql<number>`count(*) filter (where ${ventas.estado} = 'anulada')::int`,
        totalAnuladas: sql<string>`coalesce(sum(${ventas.total}) filter (where ${ventas.estado} = 'anulada'), 0)::text`,
      })
      .from(ventas)
      .where(condiciones(f)),
    db
      .select({
        ventaLineas: sql<string>`coalesce(sum(${netoLinea}), 0)::text`,
        costo: sql<string>`coalesce(sum(${costoLinea}), 0)::text`,
        // Envases (o unidades de productos normales); las unidades sueltas se cuentan aparte.
        unidades: sql<number>`coalesce(sum(${detalleVenta.cantidad}) filter (where not ${detalleVenta.fraccion}), 0)::int`,
        sueltas: sql<number>`coalesce(sum(${detalleVenta.cantidad}) filter (where ${detalleVenta.fraccion}), 0)::int`,
      })
      .from(detalleVenta)
      .innerJoin(ventas, eq(ventas.id, detalleVenta.ventaId))
      .innerJoin(productos, eq(productos.id, detalleVenta.productoId))
      .where(and(condiciones(f), completada, lineaDelProducto(f))),
    // Los gastos no tienen método de pago ni producto: se filtran por fechas, sucursal y cajero.
    db
      .select({ total: sql<string>`coalesce(sum(${gastos.monto}), 0)::text` })
      .from(gastos)
      .where(
        and(
          eq(gastos.anulado, false),
          gte(gastos.fecha, inicioDiaBolivia(f.desde)),
          lt(gastos.fecha, inicioDiaBolivia(f.hasta, true)),
          f.sucursalId ? eq(gastos.sucursalId, f.sucursalId) : undefined,
          f.cajeroId ? eq(gastos.usuarioId, f.cajeroId) : undefined,
        ),
      ),
  ]);
  return { ...v, ...l, gastos: g.total };
}

export type VentasDia = { dia: string; cantidad: number; total: string; efectivo: string; qr: string };

/** Totales por día (solo días con ventas). */
export async function ventasPorDia(f: FiltrosReporte): Promise<VentasDia[]> {
  const dia = sql<string>`((${ventas.fecha} at time zone ${ZONA_LITERAL})::date)::text`;
  return db
    .select({
      dia,
      cantidad: sql<number>`count(*)::int`,
      total: sql<string>`sum(${ventas.total})::text`,
      efectivo: sql<string>`coalesce(sum(${ventas.total}) filter (where ${ventas.metodoPago} = 'efectivo'), 0)::text`,
      qr: sql<string>`coalesce(sum(${ventas.total}) filter (where ${ventas.metodoPago} = 'qr'), 0)::text`,
    })
    .from(ventas)
    .where(and(condiciones(f), completada))
    .groupBy(dia)
    .orderBy(dia);
}

export type VentasProducto = {
  id: number;
  nombre: string;
  marca: string | null;
  sabor: string | null;
  presentacion: string | null;
  /** Envases completos vendidos (o unidades, si el producto no es fraccionado). */
  unidades: number;
  /** Venta fraccionada: unidades sueltas vendidas, su unidad (capsula, sobre…) y lo que sumaron. */
  sueltas: number;
  unidadFraccion: string | null;
  netoSueltas: string;
  bruto: string;
  descuento: string;
  neto: string;
  costo: string;
  ganancia: string;
};

/** Productos vendidos, de más a menos vendido (por importe). */
export async function ventasPorProducto(f: FiltrosReporte, limite = 500): Promise<VentasProducto[]> {
  return db
    .select({
      id: productos.id,
      nombre: productos.nombre,
      marca: productos.marca,
      sabor: productos.sabor,
      presentacion: productos.presentacion,
      unidades: sql<number>`coalesce(sum(${detalleVenta.cantidad}) filter (where not ${detalleVenta.fraccion}), 0)::int`,
      sueltas: sql<number>`coalesce(sum(${detalleVenta.cantidad}) filter (where ${detalleVenta.fraccion}), 0)::int`,
      unidadFraccion: sql<string | null>`max(${detalleVenta.unidadFraccion})`,
      netoSueltas: sql<string>`coalesce(sum(${netoLinea}) filter (where ${detalleVenta.fraccion}), 0)::text`,
      bruto: sql<string>`sum(${detalleVenta.cantidad} * ${detalleVenta.precioUnitario})::text`,
      descuento: sql<string>`sum(${detalleVenta.descuento})::text`,
      neto: sql<string>`sum(${netoLinea})::text`,
      costo: sql<string>`sum(${costoLinea})::text`,
      ganancia: sql<string>`(sum(${netoLinea}) - sum(${costoLinea}))::text`,
    })
    .from(detalleVenta)
    .innerJoin(ventas, eq(ventas.id, detalleVenta.ventaId))
    .innerJoin(productos, eq(productos.id, detalleVenta.productoId))
    .where(and(condiciones(f), completada, lineaDelProducto(f)))
    .groupBy(productos.id)
    .orderBy(sql`sum(${netoLinea}) desc`, sql`sum(${detalleVenta.cantidad}) desc`)
    .limit(limite);
}

export type VentasCajero = { id: number; cajero: string; sucursal: string; cantidad: number; total: string; efectivo: string; qr: string; anuladas: number };

/** Totales por cajero y sucursal. */
export async function ventasPorCajero(f: FiltrosReporte): Promise<VentasCajero[]> {
  return db
    .select({
      id: usuarios.id,
      cajero: usuarios.nombre,
      sucursal: sucursales.nombre,
      cantidad: sql<number>`count(*) filter (where ${completada})::int`,
      total: sql<string>`coalesce(sum(${ventas.total}) filter (where ${completada}), 0)::text`,
      efectivo: sql<string>`coalesce(sum(${ventas.total}) filter (where ${completada} and ${ventas.metodoPago} = 'efectivo'), 0)::text`,
      qr: sql<string>`coalesce(sum(${ventas.total}) filter (where ${completada} and ${ventas.metodoPago} = 'qr'), 0)::text`,
      anuladas: sql<number>`count(*) filter (where ${ventas.estado} = 'anulada')::int`,
    })
    .from(ventas)
    .innerJoin(usuarios, eq(usuarios.id, ventas.cajeroId))
    .innerJoin(sucursales, eq(sucursales.id, ventas.sucursalId))
    .where(condiciones(f))
    .groupBy(usuarios.id, sucursales.id)
    .orderBy(sql`coalesce(sum(${ventas.total}) filter (where ${completada}), 0) desc`);
}

export type VentaListada = VentaResumida & {
  subtotal: string;
  descuento: string;
  estadoPago: "pagado" | "qr_por_confirmar";
  creadoOffline: boolean;
  motivoAnulacion: string | null;
};

/** Ventas del filtro, de la más reciente a la más antigua (incluye anuladas). */
export async function listarVentas(f: FiltrosReporte, { limite, desplazamiento = 0, busqueda }: { limite: number; desplazamiento?: number; busqueda?: string }) {
  const filas = await db
    .select({
      id: ventas.id,
      numero: ventas.numeroComprobante,
      fecha: ventas.fecha,
      subtotal: ventas.subtotal,
      descuento: ventas.descuento,
      total: ventas.total,
      metodoPago: ventas.metodoPago,
      estado: ventas.estado,
      estadoPago: ventas.estadoPago,
      creadoOffline: ventas.creadoOffline,
      motivoAnulacion: ventas.motivoAnulacion,
      cliente: clientes.nombre,
      cajero: usuarios.nombre,
      sucursal: sucursales.nombre,
    })
    .from(ventas)
    .innerJoin(usuarios, eq(usuarios.id, ventas.cajeroId))
    .innerJoin(sucursales, eq(sucursales.id, ventas.sucursalId))
    .leftJoin(clientes, eq(clientes.id, ventas.clienteId))
    .where(and(condiciones(f), condicionBusqueda(busqueda, [ventas.numeroComprobante, clientes.nombre, clientes.telefono, usuarios.nombre, sucursales.nombre])))
    .orderBy(desc(ventas.fecha), desc(ventas.id))
    .limit(limite)
    .offset(desplazamiento);
  return filas.map((v): VentaListada => ({ ...v, fecha: v.fecha.toISOString() }));
}

export type LineaExportada = {
  ventaId: number;
  numero: number;
  fecha: Date;
  sucursal: string;
  cajero: string;
  estado: "completada" | "anulada";
  producto: string;
  detalleProducto: string;
  cantidad: number;
  /** Unidad suelta vendida (capsula, sobre…) o null si fue el envase completo. */
  unidad: string | null;
  precioUnitario: string;
  descuento: string;
  neto: string;
  costo: string;
};

/** Líneas de las ventas del filtro (hoja "Detalle" del Excel). */
export async function lineasDeVentas(f: FiltrosReporte, limite: number): Promise<LineaExportada[]> {
  return db
    .select({
      ventaId: ventas.id,
      numero: ventas.numeroComprobante,
      fecha: ventas.fecha,
      sucursal: sucursales.nombre,
      cajero: usuarios.nombre,
      estado: ventas.estado,
      producto: productos.nombre,
      detalleProducto: sql<string>`concat_ws(' · ', ${productos.marca}, ${productos.sabor}, ${productos.presentacion})`,
      cantidad: detalleVenta.cantidad,
      unidad: detalleVenta.unidadFraccion,
      precioUnitario: detalleVenta.precioUnitario,
      descuento: detalleVenta.descuento,
      neto: sql<string>`${netoLinea}::text`,
      costo: sql<string>`${costoLinea}::text`,
    })
    .from(detalleVenta)
    .innerJoin(ventas, eq(ventas.id, detalleVenta.ventaId))
    .innerJoin(productos, eq(productos.id, detalleVenta.productoId))
    .innerJoin(usuarios, eq(usuarios.id, ventas.cajeroId))
    .innerJoin(sucursales, eq(sucursales.id, ventas.sucursalId))
    .where(condiciones(f))
    .orderBy(desc(ventas.fecha), desc(ventas.id), detalleVenta.id)
    .limit(limite);
}
