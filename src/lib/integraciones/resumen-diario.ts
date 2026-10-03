import "server-only";
import { and, asc, eq, gte, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { alertas, cajas, sucursales, usuarios } from "@/db/schema";
import { obtenerMarca } from "@/lib/configuracion";
import { cajasAbiertas } from "@/lib/consultas/resumen";
import { aCentavos, deCentavos, restar } from "@/lib/dinero";
import { ZONA_HORARIA } from "@/lib/formato";
import type { FiltrosReporte } from "@/lib/reportes/filtros";
import { resumenGastos } from "@/lib/reportes/gastos";
import { resumenVentas, ventasPorProducto } from "@/lib/reportes/ventas";
import type { ResumenDiario } from "./resumen-texto";

const MAS_VENDIDOS = 5;
/** Siempre con dos decimales ("0" → "0.00"). */
const monto = (m: string | null) => deCentavos(aCentavos(m ?? "0"));

/** Los números del día (de Bolivia) en todas las sucursales: los mismos que muestra Reportes. */
export async function datosResumenDiario(fecha: string): Promise<ResumenDiario> {
  const filtros = (sucursalId: number | null): FiltrosReporte => ({ desde: fecha, hasta: fecha, sucursalId, cajeroId: null, metodo: null, productoId: null, categoria: null });
  const [marca, ventas, gastos, productos, locales, abiertas, conDiferencia, [pendientes]] = await Promise.all([
    obtenerMarca(),
    resumenVentas(filtros(null)),
    resumenGastos(filtros(null)),
    ventasPorProducto(filtros(null), MAS_VENDIDOS),
    db.select({ id: sucursales.id, nombre: sucursales.nombre }).from(sucursales).where(and(eq(sucursales.tipo, "sucursal"), eq(sucursales.activo, true))).orderBy(asc(sucursales.nombre)),
    cajasAbiertas(null),
    db
      .select({ cajero: usuarios.nombre, sucursal: sucursales.nombre, diferencia: cajas.diferencia })
      .from(cajas)
      .innerJoin(usuarios, eq(usuarios.id, cajas.cajeroId))
      .innerJoin(sucursales, eq(sucursales.id, cajas.sucursalId))
      .where(
        and(
          eq(cajas.estado, "cerrada"),
          ne(cajas.diferencia, "0"),
          gte(cajas.cierre, sql`(${fecha}::date at time zone ${ZONA_HORARIA})`),
          lt(cajas.cierre, sql`((${fecha}::date + 1) at time zone ${ZONA_HORARIA})`),
        ),
      ),
    db.select({ n: sql<number>`count(*)::int` }).from(alertas).where(eq(alertas.resuelta, false)),
  ]);

  const porSucursal =
    locales.length > 1
      ? await Promise.all(
          locales.map(async (s) => {
            const r = await resumenVentas(filtros(s.id));
            return { sucursal: s.nombre, cantidad: r.cantidad, total: monto(r.total) };
          }),
        )
      : [];

  return {
    fecha,
    negocio: marca.nombre,
    ventas: {
      cantidad: ventas.cantidad,
      total: monto(ventas.total),
      efectivo: monto(ventas.efectivo),
      qr: monto(ventas.qr),
      descuentos: monto(ventas.descuentos),
      anuladas: ventas.anuladas,
      totalAnuladas: monto(ventas.totalAnuladas),
      qrPorConfirmar: ventas.qrPorConfirmar,
    },
    ganancia: restar(ventas.ventaLineas, ventas.costo),
    gastos: { total: monto(gastos.total), cantidad: gastos.cantidad },
    porSucursal,
    masVendidos: productos.map((p) => ({ nombre: p.nombre, unidades: p.unidades, sueltas: p.sueltas, neto: monto(p.neto) })),
    cajasAbiertas: abiertas.map((c) => ({ cajero: c.cajero, sucursal: c.sucursal, esperado: monto(c.esperado) })),
    cajasConDiferencia: conDiferencia.map((c) => ({ cajero: c.cajero, sucursal: c.sucursal, diferencia: monto(c.diferencia) })),
    alertasPendientes: pendientes?.n ?? 0,
  };
}
