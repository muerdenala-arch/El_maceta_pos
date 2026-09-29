import "server-only";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { db, type Db } from "@/db";
import { combates, eventos, participantesEvento, torneos } from "@/db/schema";
import type { Tx } from "@/lib/inventario/stock";
import { reconstruir, type Combate, type Suceso } from "./pulseada";

type Ejecutor = Db | Tx;

export type EstadoTorneo = NonNullable<Awaited<ReturnType<typeof cargarTorneo>>>;

/**
 * Todo lo necesario para reconstruir las llaves: evento, datos del torneo y la historia en orden
 * (resultados cargados por el juez + retiros). `bloquear` toma la fila del evento FOR UPDATE.
 */
export async function cargarTorneo(ejecutor: Ejecutor, eventoId: number, { bloquear = false } = {}) {
  const consulta = ejecutor.select().from(eventos).where(eq(eventos.id, eventoId));
  const [evento] = bloquear ? await consulta.for("update") : await consulta;
  if (!evento || evento.tipoJuego !== "torneo_pulseada") return null;
  const [[torneo], resultados, retiros] = await Promise.all([
    ejecutor.select().from(torneos).where(eq(torneos.eventoId, eventoId)),
    ejecutor
      .select()
      .from(combates)
      .where(and(eq(combates.eventoId, eventoId), eq(combates.terminado, true), eq(combates.paseLibre, false), isNotNull(combates.registradoPor)))
      .orderBy(asc(combates.terminadoEn), asc(combates.id)),
    ejecutor
      .select({ id: participantesEvento.id, en: participantesEvento.dadoDeBajaEn })
      .from(participantesEvento)
      .where(and(eq(participantesEvento.eventoId, eventoId), isNotNull(participantesEvento.dadoDeBajaEn))),
  ]);
  if (!torneo) return null;

  // Historia en el orden en que ocurrió: resultados del juez y retiros.
  const historia: { en: number; suceso: Suceso; registradoPor: number | null; terminadoEn: Date | null }[] = [
    ...resultados.map((c) => ({
      en: c.terminadoEn!.getTime(),
      registradoPor: c.registradoPor,
      terminadoEn: c.terminadoEn,
      suceso: {
        tipo: "resultado" as const,
        clave: c.clave,
        a: c.competidorA!,
        b: c.competidorB!,
        asaltosA: c.asaltosA,
        asaltosB: c.asaltosB,
        faltasA: c.faltasA,
        faltasB: c.faltasB,
        walkover: c.walkover,
      },
    })),
    ...retiros.map((r) => ({ en: r.en!.getTime(), registradoPor: null, terminadoEn: null, suceso: { tipo: "retiro" as const, competidor: r.id } })),
  ].sort((x, y) => x.en - y.en);

  return { evento, torneo, historia };
}

/** Estado actual de las llaves (reconstruido). Sin sorteo todavía: lista vacía. */
export function llavesDe(t: EstadoTorneo): Combate[] {
  if (!t.torneo.sorteo) return [];
  return reconstruir({ formato: t.torneo.formato, sorteo: t.torneo.sorteo, sucesos: t.historia.map((h) => h.suceso), mejorDe: t.torneo.mejorDe });
}

/**
 * Guarda el estado reconstruido: una fila por combate (clave única por evento). Los resultados cargados
 * por el juez conservan quién y cuándo (`autores`); lo resuelto solo queda sin autor.
 */
export async function guardarLlaves(tx: Tx, eventoId: number, llaves: Combate[], autores: Map<string, { usuario: number; en: Date }>) {
  for (const c of llaves) {
    const autor = !c.paseLibre && c.terminado ? autores.get(c.clave) : undefined;
    const fila = {
      eventoId,
      clave: c.clave,
      fase: c.fase,
      ronda: c.ronda,
      orden: c.orden,
      competidorA: c.a,
      competidorB: c.b,
      aVacio: c.aVacio,
      bVacio: c.bVacio,
      asaltosA: c.asaltosA,
      asaltosB: c.asaltosB,
      faltasA: c.faltasA,
      faltasB: c.faltasB,
      ganadorId: c.ganador,
      terminado: c.terminado,
      paseLibre: c.paseLibre,
      walkover: c.walkover,
      registradoPor: autor?.usuario ?? null,
      terminadoEn: autor?.en ?? null,
    };
    await tx.insert(combates).values(fila).onConflictDoUpdate({ target: [combates.eventoId, combates.clave], set: fila });
  }
}

/** Autores de los resultados ya cargados (para no perderlos al volver a guardar). */
export const autoresDe = (t: EstadoTorneo) =>
  new Map(
    t.historia.flatMap((h) => (h.suceso.tipo === "resultado" && h.registradoPor ? [[h.suceso.clave, { usuario: h.registradoPor, en: h.terminadoEn! }] as const] : [])),
  );

/** Para páginas: estado + llaves reconstruidas. */
export async function estadoTorneo(eventoId: number) {
  const t = await cargarTorneo(db, eventoId);
  return t ? { ...t, llaves: llavesDe(t) } : null;
}
