import { and, desc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { clientes, ventas } from "@/db/schema";
import { requerirSesion } from "@/lib/auth/sesion";
import { hoyEnBolivia, ZONA_HORARIA } from "@/lib/formato";
import { ListaVentasDia } from "./lista-ventas-dia";

export const metadata: Metadata = { title: "Ventas de hoy" };

/** El cajero ve y reimprime los comprobantes de sus ventas del día (sección 5 del plan). */
export default async function PaginaVentasDelDia() {
  const sesion = await requerirSesion("cajero");
  const filas = await db
    .select({
      id: ventas.id,
      numero: ventas.numeroComprobante,
      fecha: ventas.fecha,
      total: ventas.total,
      metodoPago: ventas.metodoPago,
      estado: ventas.estado,
      cliente: clientes.nombre,
    })
    .from(ventas)
    .leftJoin(clientes, eq(clientes.id, ventas.clienteId))
    .where(
      and(eq(ventas.cajeroId, sesion.uid), sql`(${ventas.fecha} at time zone ${ZONA_HORARIA})::date = ${hoyEnBolivia()}::date`),
    )
    .orderBy(desc(ventas.fecha));

  return <ListaVentasDia ventas={filas.map((v) => ({ ...v, fecha: v.fecha.toISOString() }))} />;
}
