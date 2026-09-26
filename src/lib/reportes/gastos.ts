import "server-only";
import { and, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { cajas, gastos, sucursales, usuarios } from "@/db/schema";
import { inicioDiaBolivia, ZONA_HORARIA } from "@/lib/formato";
import type { FiltrosReporte } from "./filtros";

function condiciones(f: FiltrosReporte): SQL {
  return and(
    gte(gastos.fecha, inicioDiaBolivia(f.desde)),
    lt(gastos.fecha, inicioDiaBolivia(f.hasta, true)),
    f.sucursalId ? eq(gastos.sucursalId, f.sucursalId) : undefined,
    f.cajeroId ? eq(gastos.usuarioId, f.cajeroId) : undefined,
    f.categoria ? eq(gastos.categoria, f.categoria) : undefined,
  )!;
}

/** Zona como literal (constante, no dato del usuario): con parámetro, SELECT y GROUP BY no coincidirían. */
const ZONA_LITERAL = sql.raw(`'${ZONA_HORARIA}'`);
const vigente = eq(gastos.anulado, false);

export type GastoListado = {
  id: number;
  fecha: string;
  categoria: string;
  monto: string;
  descripcion: string | null;
  fotoUrl: string | null;
  anulado: boolean;
  motivoAnulacion: string | null;
  cajero: string;
  sucursal: string;
  cajaAbierta: boolean;
};

/** Gastos del filtro, del más reciente al más antiguo (incluye anulados). */
export async function listarGastos(f: FiltrosReporte, limite: number): Promise<GastoListado[]> {
  const filas = await db
    .select({
      id: gastos.id,
      fecha: gastos.fecha,
      categoria: gastos.categoria,
      monto: gastos.monto,
      descripcion: gastos.descripcion,
      fotoUrl: gastos.fotoUrl,
      anulado: gastos.anulado,
      motivoAnulacion: gastos.motivoAnulacion,
      cajero: usuarios.nombre,
      sucursal: sucursales.nombre,
      cajaAbierta: sql<boolean>`${cajas.estado} = 'abierta'`,
    })
    .from(gastos)
    .innerJoin(usuarios, eq(usuarios.id, gastos.usuarioId))
    .innerJoin(sucursales, eq(sucursales.id, gastos.sucursalId))
    .innerJoin(cajas, eq(cajas.id, gastos.cajaId))
    .where(condiciones(f))
    .orderBy(desc(gastos.fecha), desc(gastos.id))
    .limit(limite);
  return filas.map((g) => ({ ...g, fecha: g.fecha.toISOString() }));
}

export type ResumenGastos = {
  total: string;
  cantidad: number;
  anulados: number;
  porCategoria: { categoria: string; total: string; cantidad: number }[];
  porDia: { dia: string; total: string; cantidad: number }[];
};

/** Totales por día y por categoría (sección 4.3 del plan). Solo gastos no anulados. */
export async function resumenGastos(f: FiltrosReporte): Promise<ResumenGastos> {
  const dia = sql<string>`((${gastos.fecha} at time zone ${ZONA_LITERAL})::date)::text`;
  const [[t], porCategoria, porDia] = await Promise.all([
    db
      .select({
        total: sql<string>`coalesce(sum(${gastos.monto}) filter (where ${vigente}), 0)::text`,
        cantidad: sql<number>`count(*) filter (where ${vigente})::int`,
        anulados: sql<number>`count(*) filter (where ${gastos.anulado})::int`,
      })
      .from(gastos)
      .where(condiciones(f)),
    db
      .select({ categoria: gastos.categoria, total: sql<string>`sum(${gastos.monto})::text`, cantidad: sql<number>`count(*)::int` })
      .from(gastos)
      .where(and(condiciones(f), vigente))
      .groupBy(gastos.categoria)
      .orderBy(sql`sum(${gastos.monto}) desc`),
    db
      .select({ dia, total: sql<string>`sum(${gastos.monto})::text`, cantidad: sql<number>`count(*)::int` })
      .from(gastos)
      .where(and(condiciones(f), vigente))
      .groupBy(dia)
      .orderBy(dia),
  ]);
  return { ...t, porCategoria, porDia };
}
