import "server-only";
import { and, eq, inArray, lte } from "drizzle-orm";
import { db, type Db } from "@/db";
import { alertas, cajas, sucursales, usuarios } from "@/db/schema";
import type { Tx } from "@/lib/inventario/stock";

/** Una caja abierta más de este tiempo se considera olvidada. */
export const HORAS_CAJA_OLVIDADA = 24;

const cuando = (d: Date) =>
  d.toLocaleString("es-BO", { timeZone: "America/La_Paz", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/**
 * Alerta "Caja sin cerrar" en la campanita: una caja que lleva más de 24 horas abierta (el cajero se olvidó de
 * cerrarla o ya no trabaja aquí). Se crea sola y se resuelve sola al cerrarse la caja (por el cajero o desde Auditoría).
 */
export async function conciliarAlertasCajas(ejecutor: Db | Tx = db, ahora = new Date()) {
  const limite = new Date(ahora.getTime() - HORAS_CAJA_OLVIDADA * 3_600_000);
  const olvidadas = await ejecutor
    .select({ id: cajas.id, apertura: cajas.apertura, sucursalId: cajas.sucursalId, cajero: usuarios.nombre, sucursal: sucursales.nombre })
    .from(cajas)
    .innerJoin(usuarios, eq(usuarios.id, cajas.cajeroId))
    .innerJoin(sucursales, eq(sucursales.id, cajas.sucursalId))
    .where(and(eq(cajas.estado, "abierta"), lte(cajas.apertura, limite)));
  const existentes = await ejecutor
    .select({ id: alertas.id, cajaId: alertas.cajaId })
    .from(alertas)
    .where(and(eq(alertas.tipo, "caja_abierta"), eq(alertas.resuelta, false)));

  const conAlerta = new Set(existentes.map((a) => a.cajaId));
  for (const c of olvidadas.filter((o) => !conAlerta.has(o.id))) {
    await ejecutor.insert(alertas).values({
      tipo: "caja_abierta",
      cajaId: c.id,
      sucursalId: c.sucursalId,
      mensaje: `La caja de ${c.cajero} (${c.sucursal}) sigue abierta desde el ${cuando(c.apertura)}: ciérrala en Auditoría de caja`,
    });
  }
  const vigentes = new Set(olvidadas.map((o) => o.id));
  const resolver = existentes.filter((a) => !a.cajaId || !vigentes.has(a.cajaId)).map((a) => a.id);
  if (resolver.length) await ejecutor.update(alertas).set({ resuelta: true }).where(inArray(alertas.id, resolver));
}
