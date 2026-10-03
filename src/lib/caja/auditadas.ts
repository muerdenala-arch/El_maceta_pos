import "server-only";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { cajas, sucursales, usuarios } from "@/db/schema";
import { ZONA_HORARIA } from "@/lib/formato";
import { totalesCaja } from "./consultas";

export type CajaAuditada = {
  id: number;
  cajero: string;
  sucursal: string;
  estado: "abierta" | "cerrada";
  apertura: string;
  cierre: string | null;
  montoInicial: string;
  ventasEfectivo: string;
  ventasQr: string;
  gastos: string;
  esperado: string;
  contado: string | null;
  diferencia: string | null;
};

/**
 * Aperturas y cierres de caja de un rango de días (de Bolivia): esperado vs. contado. Las abiertas llevan los
 * totales en vivo. La usan la auditoría del administrador y la supervisión del encargado (siempre con su sucursal).
 */
export async function listarCajasAuditadas(p: { desde: string; hasta: string; sucursalId: number | null; cajaResaltada?: number | null }): Promise<CajaAuditada[]> {
  const rango = and(
    gte(cajas.apertura, sql`(${p.desde}::date at time zone ${ZONA_HORARIA})`),
    lt(cajas.apertura, sql`((${p.hasta}::date + 1) at time zone ${ZONA_HORARIA})`),
  );
  const filas = await db
    .select({ caja: cajas, cajero: usuarios.nombre, sucursal: sucursales.nombre })
    .from(cajas)
    .innerJoin(usuarios, eq(usuarios.id, cajas.cajeroId))
    .innerJoin(sucursales, eq(sucursales.id, cajas.sucursalId))
    .where(
      and(
        // Las abiertas se muestran siempre (una caja olvidada hace días no debe quedar escondida), y desde una
        // alerta se muestra esa caja aunque esté fuera del rango de fechas.
        sql`(${rango} or ${cajas.estado} = 'abierta'${p.cajaResaltada ? sql` or ${cajas.id} = ${p.cajaResaltada}` : sql``})`,
        p.sucursalId ? eq(cajas.sucursalId, p.sucursalId) : undefined,
      ),
    )
    .orderBy(sql`${cajas.estado} = 'abierta' desc`, desc(cajas.apertura))
    .limit(200);

  return Promise.all(
    filas.map(async ({ caja: c, cajero, sucursal }) => {
      // Caja abierta: totales en vivo (lo que se cerraría ahora).
      const vivo = c.estado === "abierta" ? await totalesCaja(c.id, c.montoInicial) : null;
      return {
        id: c.id,
        cajero,
        sucursal,
        estado: c.estado,
        apertura: c.apertura.toISOString(),
        cierre: c.cierre?.toISOString() ?? null,
        montoInicial: c.montoInicial,
        ventasEfectivo: vivo?.ventasEfectivo ?? c.ventasEfectivo ?? "0",
        ventasQr: vivo?.ventasQr ?? c.ventasQr ?? "0",
        gastos: vivo?.gastos ?? c.gastos ?? "0",
        esperado: vivo?.esperado ?? c.esperado ?? "0",
        contado: c.efectivoContado,
        diferencia: c.diferencia,
      };
    }),
  );
}
