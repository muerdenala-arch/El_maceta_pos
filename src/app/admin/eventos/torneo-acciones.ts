"use server";

import { randomBytes, randomInt } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { combates, eventos, participantesEvento, sucursales, torneos } from "@/db/schema";
import { conPermiso, esViolacionUnica, exito, fallo, falloValidacion, type Resultado } from "@/lib/acciones/resultado";
import { registrarAuditoria } from "@/lib/auditoria";
import { autorizar } from "@/lib/auth/sesion";
import { asaltosParaGanar, ErrorTorneo, reconstruir, torneoCompleto, type Suceso } from "@/lib/eventos/pulseada";
import { autoresDe, cargarTorneo, guardarLlaves, llavesDe, type EstadoTorneo } from "@/lib/eventos/torneo-datos";
import type { Tx } from "@/lib/inventario/stock";
import { idPositivo } from "@/lib/validaciones/comunes";
import {
  esquemaAusencia,
  esquemaBaja,
  esquemaCombate,
  esquemaCompetidor,
  esquemaCorreccionCombate,
  esquemaEditarCompetidor,
  esquemaTorneo,
  type DatosAusencia,
  type DatosBaja,
  type DatosCombate,
  type DatosCompetidor,
  type DatosCorreccionCombate,
  type DatosEditarCompetidor,
  type DatosTorneo,
} from "@/lib/validaciones/eventos";

const CEDULA_REPETIDA = { cedulaIdentidad: "Ya hay un competidor con esta cédula en este torneo" };

/** Errores de regla (ErrorTorneo) → resultado; el resto sigue siendo un error. */
async function conReglas<T>(fn: () => Promise<Resultado<T>>): Promise<Resultado<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ErrorTorneo) return fallo(e.message);
    throw e;
  }
}

async function torneoBloqueado(tx: Tx, eventoId: number): Promise<EstadoTorneo> {
  const t = await cargarTorneo(tx, eventoId, { bloquear: true });
  if (!t) throw new ErrorTorneo("El torneo no existe");
  return t;
}

/** Reconstruye con la historia dada y guarda; si un resultado ya no encaja, ErrorTorneo (no se guarda nada). */
async function rehacer(tx: Tx, t: EstadoTorneo, historia: Suceso[], autores: Map<string, { usuario: number; en: Date }>) {
  const llaves = reconstruir({ formato: t.torneo.formato, sorteo: t.torneo.sorteo!, sucesos: historia, mejorDe: t.torneo.mejorDe });
  await guardarLlaves(tx, t.evento.id, llaves, autores);
  await tx.update(eventos).set({ actualizadoEn: new Date() }).where(eq(eventos.id, t.evento.id));
  return llaves;
}

// ---------------------------------------------------------------- Torneo

export async function crearTorneo(entrada: DatosTorneo): Promise<Resultado<{ id: number }>> {
  return conPermiso(async () => {
    const sesion = await autorizar("admin");
    const v = esquemaTorneo.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);
    const { formato, mejorDe, puntosVictoria, ...datos } = v.data;
    if (datos.sucursalId) {
      const [s] = await db.select({ id: sucursales.id }).from(sucursales).where(and(eq(sucursales.id, datos.sucursalId), eq(sucursales.activo, true)));
      if (!s) return fallo("Revisa los datos marcados", { sucursalId: "Sucursal inválida o inactiva" });
    }
    const id = await db.transaction(async (tx) => {
      const [e] = await tx
        .insert(eventos)
        .values({ ...datos, tipoJuego: "torneo_pulseada", duracionDias: 1, tokenPublico: randomBytes(18).toString("base64url"), creadoPor: sesion.uid })
        .returning({ id: eventos.id });
      await tx.insert(torneos).values({ eventoId: e.id, formato, mejorDe, puntosVictoria });
      return e.id;
    });
    await registrarAuditoria("evento_creado", { usuarioId: sesion.uid, detalle: { eventoId: id, nombre: datos.nombre, formato, mejorDe } });
    refresh();
    return exito({ id });
  });
}

/**
 * Sorteo de llaves al azar e inicio del torneo (pasa a "en curso"). Se puede volver a sortear mientras no
 * se haya jugado ningún combate. Desde el sorteo ya no se inscriben competidores.
 */
export async function sortearTorneo(entrada: { id: number }): Promise<Resultado> {
  return conPermiso(() =>
    conReglas(async () => {
      const sesion = await autorizar("admin");
      const id = idPositivo.parse(entrada.id);
      const n = await db.transaction(async (tx) => {
        const t = await torneoBloqueado(tx, id);
        if (t.evento.estado === "finalizado") throw new ErrorTorneo("El torneo ya terminó");
        if (t.historia.some((h) => h.suceso.tipo === "resultado")) throw new ErrorTorneo("Ya hay combates jugados: el sorteo no se puede repetir");
        const activos = await tx
          .select({ id: participantesEvento.id })
          .from(participantesEvento)
          .where(and(eq(participantesEvento.eventoId, id), eq(participantesEvento.activo, true)));
        if (activos.length < 2) throw new ErrorTorneo("Se necesitan al menos 2 competidores para sortear");
        // Fisher–Yates con azar criptográfico: nadie puede prever ni arreglar las llaves.
        const orden = activos.map((a) => a.id);
        for (let i = orden.length - 1; i > 0; i--) {
          const j = randomInt(i + 1);
          [orden[i], orden[j]] = [orden[j], orden[i]];
        }
        await tx.delete(combates).where(eq(combates.eventoId, id));
        await tx.update(torneos).set({ sorteo: orden, sorteadoEn: new Date() }).where(eq(torneos.eventoId, id));
        await tx.update(eventos).set({ estado: "en_curso", iniciadoEn: t.evento.iniciadoEn ?? new Date() }).where(eq(eventos.id, id));
        await rehacer(tx, { ...t, torneo: { ...t.torneo, sorteo: orden } }, t.historia.map((h) => h.suceso), new Map());
        return orden.length;
      });
      await registrarAuditoria("torneo_sorteado", { usuarioId: sesion.uid, detalle: { eventoId: id, competidores: n } });
      refresh();
      return exito();
    }),
  );
}

/** Finaliza el torneo: solo cuando todos los combates tienen resultado. Desde aquí nada se modifica. */
export async function finalizarTorneo(entrada: { id: number }): Promise<Resultado> {
  return conPermiso(() =>
    conReglas(async () => {
      const sesion = await autorizar("admin");
      const id = idPositivo.parse(entrada.id);
      await db.transaction(async (tx) => {
        const t = await torneoBloqueado(tx, id);
        if (t.evento.estado !== "en_curso") throw new ErrorTorneo(t.evento.estado === "finalizado" ? "El torneo ya está finalizado" : "Sortea las llaves primero");
        if (!torneoCompleto(llavesDe(t))) throw new ErrorTorneo("Todavía hay combates sin resultado");
        await tx.update(eventos).set({ estado: "finalizado", finalizadoEn: new Date(), actualizadoEn: new Date() }).where(eq(eventos.id, id));
      });
      await registrarAuditoria("evento_finalizado", { usuarioId: sesion.uid, detalle: { eventoId: id } });
      refresh();
      return exito();
    }),
  );
}

// ---------------------------------------------------------------- Competidores

export async function inscribirCompetidor(entrada: DatosCompetidor): Promise<Resultado<{ id: number }>> {
  return conPermiso(() =>
    conReglas(async () => {
      const sesion = await autorizar("admin");
      const v = esquemaCompetidor.safeParse(entrada);
      if (!v.success) return falloValidacion(v.error);
      try {
        const nuevo = await db.transaction(async (tx) => {
          const t = await torneoBloqueado(tx, v.data.eventoId);
          if (t.torneo.sorteo || t.evento.estado !== "borrador") throw new ErrorTorneo("Las llaves ya se sortearon: no se inscriben más competidores");
          const [p] = await tx.insert(participantesEvento).values(v.data).returning({ id: participantesEvento.id });
          return p;
        });
        await registrarAuditoria("participante_inscrito", {
          usuarioId: sesion.uid,
          detalle: { eventoId: v.data.eventoId, participanteId: nuevo.id, nombre: v.data.nombreCompleto },
        });
        refresh();
        return exito({ id: nuevo.id });
      } catch (e) {
        if (esViolacionUnica(e, "participantes_evento_cedula_uq")) return fallo("Revisa los datos marcados", CEDULA_REPETIDA);
        throw e;
      }
    }),
  );
}

export async function editarCompetidor(entrada: DatosEditarCompetidor): Promise<Resultado> {
  return conPermiso(() =>
    conReglas(async () => {
      const sesion = await autorizar("admin");
      const v = esquemaEditarCompetidor.safeParse(entrada);
      if (!v.success) return falloValidacion(v.error);
      const { id, ...datos } = v.data;
      try {
        const antes = await db.transaction(async (tx) => {
          const [p] = await tx.select().from(participantesEvento).where(eq(participantesEvento.id, id));
          if (!p) throw new ErrorTorneo("El competidor no existe");
          const t = await torneoBloqueado(tx, p.eventoId);
          if (t.evento.estado === "finalizado") throw new ErrorTorneo("El torneo está finalizado: sus datos ya no se modifican");
          await tx.update(participantesEvento).set(datos).where(eq(participantesEvento.id, id));
          return p;
        });
        const cambios = Object.fromEntries(
          (Object.keys(datos) as (keyof typeof datos)[]).filter((k) => String(antes[k]) !== String(datos[k])).map((k) => [k, { antes: antes[k], despues: datos[k] }]),
        );
        await registrarAuditoria("participante_editado", { usuarioId: sesion.uid, detalle: { eventoId: antes.eventoId, participanteId: id, nombre: datos.nombreCompleto, cambios } });
        refresh();
        return exito();
      } catch (e) {
        if (esViolacionUnica(e, "participantes_evento_cedula_uq")) return fallo("Revisa los datos marcados", CEDULA_REPETIDA);
        throw e;
      }
    }),
  );
}

/** Baja con motivo (no se borra). Con las llaves ya sorteadas, pierde por W.O. todo lo que le quede por jugar. */
export async function darDeBajaCompetidor(entrada: DatosBaja): Promise<Resultado> {
  return conPermiso(() =>
    conReglas(async () => {
      const sesion = await autorizar("admin");
      const v = esquemaBaja.safeParse(entrada);
      if (!v.success) return falloValidacion(v.error);
      const p = await db.transaction(async (tx) => {
        const [p] = await tx.select().from(participantesEvento).where(eq(participantesEvento.id, v.data.id));
        if (!p) throw new ErrorTorneo("El competidor no existe");
        if (!p.activo) throw new ErrorTorneo("El competidor ya estaba dado de baja");
        const t = await torneoBloqueado(tx, p.eventoId);
        if (t.evento.estado === "finalizado") throw new ErrorTorneo("El torneo está finalizado: ya no se dan bajas");
        const ahora = new Date();
        await tx
          .update(participantesEvento)
          .set({ activo: false, motivoBaja: v.data.motivo, dadoDeBajaEn: t.torneo.sorteo ? ahora : null })
          .where(eq(participantesEvento.id, p.id));
        if (t.torneo.sorteo) {
          await rehacer(tx, t, [...t.historia.map((h) => h.suceso), { tipo: "retiro", competidor: p.id }], autoresDe(t));
        }
        return p;
      });
      await registrarAuditoria("participante_baja", {
        usuarioId: sesion.uid,
        detalle: { eventoId: p.eventoId, participanteId: p.id, nombre: p.nombreCompleto, motivo: v.data.motivo },
      });
      refresh();
      return exito();
    }),
  );
}

// ---------------------------------------------------------------- Combates

async function combateDelTorneo(tx: Tx, combateId: number) {
  const [fila] = await tx.select().from(combates).where(eq(combates.id, combateId));
  if (!fila) throw new ErrorTorneo("El combate no existe");
  const t = await torneoBloqueado(tx, fila.eventoId);
  if (t.evento.estado !== "en_curso") throw new ErrorTorneo(t.evento.estado === "finalizado" ? "El torneo está finalizado: los resultados ya no se modifican" : "Sortea las llaves primero");
  return { fila, t };
}

/** Registra el resultado de un combate al mejor de N (lo carga el juez desde la "mesa"). */
export async function registrarCombate(entrada: DatosCombate): Promise<Resultado> {
  return conPermiso(() =>
    conReglas(async () => {
      const sesion = await autorizar("admin");
      const v = esquemaCombate.safeParse(entrada);
      if (!v.success) return falloValidacion(v.error);
      const d = v.data;
      const r = await db.transaction(async (tx) => {
        const { fila, t } = await combateDelTorneo(tx, d.id);
        const actual = llavesDe(t).find((c) => c.clave === fila.clave)!;
        if (actual.terminado) throw new ErrorTorneo("Ese combate ya tiene resultado (corrígelo si hace falta)");
        if (actual.a === null || actual.b === null) throw new ErrorTorneo("Todavía no se sabe quiénes pelean este combate");
        const suceso: Suceso = { tipo: "resultado", clave: fila.clave, a: actual.a, b: actual.b, ...d, walkover: false };
        const autores = autoresDe(t).set(fila.clave, { usuario: sesion.uid, en: new Date() });
        await rehacer(tx, t, [...t.historia.map((h) => h.suceso), suceso], autores);
        return { eventoId: t.evento.id, clave: fila.clave };
      });
      await registrarAuditoria("combate_registrado", { usuarioId: sesion.uid, detalle: { ...r, asaltos: `${d.asaltosA}-${d.asaltosB}`, faltas: `${d.faltasA}-${d.faltasB}` } });
      refresh();
      return exito();
    }),
  );
}

/** "No se presentó": el presente gana por W.O. (asaltos a su favor, sin combate). */
export async function registrarAusencia(entrada: DatosAusencia): Promise<Resultado> {
  return conPermiso(() =>
    conReglas(async () => {
      const sesion = await autorizar("admin");
      const v = esquemaAusencia.safeParse(entrada);
      if (!v.success) return falloValidacion(v.error);
      const r = await db.transaction(async (tx) => {
        const { fila, t } = await combateDelTorneo(tx, v.data.id);
        const actual = llavesDe(t).find((c) => c.clave === fila.clave)!;
        if (actual.terminado || actual.a === null || actual.b === null) throw new ErrorTorneo("Ese combate no está listo para jugarse");
        const ganar = asaltosParaGanar(t.torneo.mejorDe);
        const faltaA = v.data.ausente === "a";
        const suceso: Suceso = { tipo: "resultado", clave: fila.clave, a: actual.a, b: actual.b, asaltosA: faltaA ? 0 : ganar, asaltosB: faltaA ? ganar : 0, faltasA: 0, faltasB: 0, walkover: true };
        await rehacer(tx, t, [...t.historia.map((h) => h.suceso), suceso], autoresDe(t).set(fila.clave, { usuario: sesion.uid, en: new Date() }));
        return { eventoId: t.evento.id, clave: fila.clave, ausente: faltaA ? actual.a : actual.b };
      });
      await registrarAuditoria("combate_registrado", { usuarioId: sesion.uid, detalle: { ...r, walkover: true } });
      refresh();
      return exito();
    }),
  );
}

/**
 * Corrige un resultado ya cargado. Se rehace todo el torneo con el resultado nuevo: si un combate posterior
 * ya se jugó con otros competidores, se rechaza (hay que corregir primero ese). Queda en auditoría.
 */
export async function corregirCombate(entrada: DatosCorreccionCombate): Promise<Resultado> {
  return conPermiso(() =>
    conReglas(async () => {
      const sesion = await autorizar("admin");
      const v = esquemaCorreccionCombate.safeParse(entrada);
      if (!v.success) return falloValidacion(v.error);
      const { motivo, ...d } = v.data;
      const r = await db.transaction(async (tx) => {
        const { fila, t } = await combateDelTorneo(tx, d.id);
        const i = t.historia.findIndex((h) => h.suceso.tipo === "resultado" && h.suceso.clave === fila.clave);
        if (i < 0) throw new ErrorTorneo("Ese combate no tiene un resultado cargado para corregir");
        const antes = t.historia[i].suceso as Extract<Suceso, { tipo: "resultado" }>;
        const historia = t.historia.map((h) => h.suceso);
        historia[i] = { ...antes, ...d, walkover: false };
        await rehacer(tx, t, historia, autoresDe(t));
        return { eventoId: t.evento.id, clave: fila.clave, antes: `${antes.asaltosA}-${antes.asaltosB}`, despues: `${d.asaltosA}-${d.asaltosB}` };
      });
      await registrarAuditoria("combate_corregido", { usuarioId: sesion.uid, detalle: { ...r, motivo } });
      refresh();
      return exito();
    }),
  );
}
