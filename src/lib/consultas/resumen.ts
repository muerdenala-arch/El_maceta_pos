import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ZONA_HORARIA } from "@/lib/formato";

export type ResumenPeriodos = {
  ventasDia: string;
  gastosDia: string;
  ventasSemana: string;
  gastosSemana: string;
  ventasMes: string;
  gastosMes: string;
  ventasAnio: string;
  gastosAnio: string;
  cantidadDia: number;
  descuentosDia: string;
};

export type VentasSucursal = { id: number; nombre: string; total: string; cantidad: number };

/** Inicio del año del día dado, en hora de Bolivia, como timestamptz (aprovecha el índice por fecha). */
const desdeAnio = (dia: string) => sql`(date_trunc('year', ${dia}::date) at time zone ${ZONA_HORARIA})`;
const diaLocal = (columna: unknown) => sql`(${columna} at time zone ${ZONA_HORARIA})::date`;

/**
 * Totales del día, semana (lunes a la fecha), mes y año hasta la fecha elegida.
 * Solo ventas completadas y gastos no anulados. `sucursalId` null = todas las sucursales.
 */
export async function obtenerResumen(dia: string, sucursalId: number | null): Promise<ResumenPeriodos> {
  const filtroVentas = sucursalId === null ? sql`` : sql`and v.sucursal_id = ${sucursalId}`;
  const filtroGastos = sucursalId === null ? sql`` : sql`and g.sucursal_id = ${sucursalId}`;
  const d = sql`${dia}::date`;

  const resultado = await db.execute(sql`
    with v as (
      select v.total, v.descuento, ${diaLocal(sql`v.fecha`)} as dia
      from ventas v
      where v.estado = 'completada' ${filtroVentas}
        and v.fecha >= ${desdeAnio(dia)} and ${diaLocal(sql`v.fecha`)} <= ${d}
    ), g as (
      select g.monto, ${diaLocal(sql`g.fecha`)} as dia
      from gastos g
      where not g.anulado ${filtroGastos}
        and g.fecha >= ${desdeAnio(dia)} and ${diaLocal(sql`g.fecha`)} <= ${d}
    )
    select
      (select coalesce(sum(total), 0) from v where dia = ${d})::text as "ventasDia",
      (select coalesce(sum(monto), 0) from g where dia = ${d})::text as "gastosDia",
      (select coalesce(sum(total), 0) from v where dia >= date_trunc('week', ${d})::date)::text as "ventasSemana",
      (select coalesce(sum(monto), 0) from g where dia >= date_trunc('week', ${d})::date)::text as "gastosSemana",
      (select coalesce(sum(total), 0) from v where dia >= date_trunc('month', ${d})::date)::text as "ventasMes",
      (select coalesce(sum(monto), 0) from g where dia >= date_trunc('month', ${d})::date)::text as "gastosMes",
      (select coalesce(sum(total), 0) from v)::text as "ventasAnio",
      (select coalesce(sum(monto), 0) from g)::text as "gastosAnio",
      (select count(*) from v where dia = ${d})::int as "cantidadDia",
      (select coalesce(sum(descuento), 0) from v where dia = ${d})::text as "descuentosDia"
  `);
  return resultado.rows[0] as ResumenPeriodos;
}

/** Ventas del día por sucursal (todas las sucursales activas, aunque no tengan ventas). */
export async function ventasPorSucursal(dia: string): Promise<VentasSucursal[]> {
  const resultado = await db.execute(sql`
    select s.id, s.nombre,
      coalesce(sum(v.total), 0)::text as total,
      count(v.id)::int as cantidad
    from sucursales s
    left join ventas v
      on v.sucursal_id = s.id and v.estado = 'completada'
      and v.fecha >= (${dia}::date at time zone ${ZONA_HORARIA})
      and v.fecha < ((${dia}::date + 1) at time zone ${ZONA_HORARIA})
    where s.tipo = 'sucursal' and s.activo
    group by s.id, s.nombre
    order by s.id
  `);
  return resultado.rows as VentasSucursal[];
}
