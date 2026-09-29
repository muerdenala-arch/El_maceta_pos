import "server-only";
import { and, eq, inArray, lte } from "drizzle-orm";
import { db, type Db } from "@/db";
import { alertas, eventos } from "@/db/schema";
import { hoyEnBolivia } from "@/lib/formato";
import type { Tx } from "@/lib/inventario/stock";

const diaMes = (f: string) => f.split("-").reverse().slice(0, 2).join("/");

/**
 * Alerta "Reto terminado" en la campanita: un reto en curso que ya llegó a su último día pide registrar los
 * pesajes finales y finalizarlo. Se crea sola y se resuelve sola al finalizar el reto (igual que las de stock).
 */
export async function conciliarAlertasEventos(ejecutor: Db | Tx = db) {
  const vencidos = await ejecutor
    .select({ id: eventos.id, nombre: eventos.nombre, fechaFin: eventos.fechaFin, sucursalId: eventos.sucursalId })
    .from(eventos)
    .where(and(eq(eventos.estado, "en_curso"), lte(eventos.fechaFin, hoyEnBolivia())));
  const existentes = await ejecutor
    .select({ id: alertas.id, eventoId: alertas.eventoId })
    .from(alertas)
    .where(and(eq(alertas.tipo, "evento_por_finalizar"), eq(alertas.resuelta, false)));

  const conAlerta = new Set(existentes.map((a) => a.eventoId));
  for (const e of vencidos.filter((v) => !conAlerta.has(v.id))) {
    await ejecutor.insert(alertas).values({
      tipo: "evento_por_finalizar",
      eventoId: e.id,
      sucursalId: e.sucursalId,
      mensaje: `El reto «${e.nombre}» terminó el ${diaMes(e.fechaFin!)}: registra los pesajes finales y finalízalo`,
    });
  }
  const vigentes = new Set(vencidos.map((v) => v.id));
  const resolver = existentes.filter((a) => !a.eventoId || !vigentes.has(a.eventoId)).map((a) => a.id);
  if (resolver.length) await ejecutor.update(alertas).set({ resuelta: true }).where(inArray(alertas.id, resolver));
}
