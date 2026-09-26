import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { alertas, sucursales } from "@/db/schema";
import { destinoAlerta, moduloDeAlerta, TIPOS_AUTOMATICOS, type TipoAlerta } from "./reglas";

export type AlertaCampanita = {
  id: number;
  tipo: TipoAlerta;
  mensaje: string;
  sucursal: string | null;
  leida: boolean;
  fecha: string;
  destino: string;
  /** Se resuelve sola (stock, vencimientos); si no, el admin la marca como revisada. */
  automatica: boolean;
};

export async function listarAlertasPendientes(limite = 50): Promise<AlertaCampanita[]> {
  const filas = await db
    .select({
      id: alertas.id,
      tipo: alertas.tipo,
      mensaje: alertas.mensaje,
      sucursal: sucursales.nombre,
      leida: alertas.leida,
      fecha: alertas.fecha,
      productoId: alertas.productoId,
      sucursalId: alertas.sucursalId,
      cajaId: alertas.cajaId,
      ventaId: alertas.ventaId,
    })
    .from(alertas)
    .leftJoin(sucursales, eq(sucursales.id, alertas.sucursalId))
    .where(eq(alertas.resuelta, false))
    // Sin leer primero, luego las más recientes.
    .orderBy(alertas.leida, desc(alertas.fecha))
    .limit(limite);

  return filas.map((f) => ({
    id: f.id,
    tipo: f.tipo,
    mensaje: f.mensaje,
    sucursal: f.sucursal,
    leida: f.leida,
    fecha: f.fecha.toISOString(),
    destino: destinoAlerta(f),
    automatica: TIPOS_AUTOMATICOS.includes(f.tipo),
  }));
}

/** Contador de la campanita y numeritos por módulo del menú. */
export async function resumenAlertas(): Promise<{ noLeidas: number; porModulo: Record<string, number> }> {
  const filas = await db
    .select({ tipo: alertas.tipo, total: sql<number>`count(*)::int`, noLeidas: sql<number>`count(*) filter (where not ${alertas.leida})::int` })
    .from(alertas)
    .where(and(eq(alertas.resuelta, false)))
    .groupBy(alertas.tipo);
  const porModulo: Record<string, number> = {};
  let noLeidas = 0;
  for (const f of filas) {
    noLeidas += f.noLeidas;
    const m = moduloDeAlerta(f.tipo);
    porModulo[m] = (porModulo[m] ?? 0) + f.total;
  }
  return { noLeidas, porModulo };
}

