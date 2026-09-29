"use server";

import { randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { eventos, participantesEvento, pesajes, sucursales } from "@/db/schema";
import { conPermiso, esViolacionUnica, exito, fallo, falloValidacion, type Resultado } from "@/lib/acciones/resultado";
import { registrarAuditoria } from "@/lib/auditoria";
import { autorizar } from "@/lib/auth/sesion";
import { conciliarAlertasEventos } from "@/lib/eventos/alertas";
import { aCentikg, cambioSospechoso } from "@/lib/eventos/calculos";
import { idPositivo } from "@/lib/validaciones/comunes";
import {
  esquemaBaja,
  esquemaCorreccionPesaje,
  esquemaEditarParticipante,
  esquemaParticipante,
  esquemaPesajes,
  esquemaReto,
  type DatosBaja,
  type DatosCorreccionPesaje,
  type DatosEditarParticipante,
  type DatosParticipante,
  type DatosPesajes,
  type DatosReto,
} from "@/lib/validaciones/eventos";

const CEDULA_REPETIDA = { cedulaIdentidad: "Ya hay un participante con esta cédula en este reto" };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Reto bloqueado para la transacción (FOR UPDATE): dos cambios simultáneos no se pisan.
 * Solo retos: los torneos tienen sus propias acciones (torneo-acciones.ts).
 */
async function eventoBloqueado(tx: Tx, id: number) {
  const [e] = await tx.select().from(eventos).where(eq(eventos.id, id)).for("update");
  if (e && e.tipoJuego !== "reto_transformacion") throw new ErrorEvento("Esta acción es solo para el Reto Transformación");
  return e ?? null;
}

class ErrorEvento extends Error {}

/** Convierte los errores de regla (ErrorEvento) en resultado; el resto sigue siendo un error. */
async function conReglas<T>(fn: () => Promise<Resultado<T>>): Promise<Resultado<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ErrorEvento) return fallo(e.message);
    throw e;
  }
}

// ---------------------------------------------------------------- Retos

export async function crearReto(entrada: DatosReto): Promise<Resultado<{ id: number }>> {
  return conPermiso(async () => {
    const sesion = await autorizar("admin");
    const v = esquemaReto.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);
    if (v.data.sucursalId) {
      const [s] = await db.select({ id: sucursales.id }).from(sucursales).where(and(eq(sucursales.id, v.data.sucursalId), eq(sucursales.activo, true)));
      if (!s) return fallo("Revisa los datos marcados", { sucursalId: "Sucursal inválida o inactiva" });
    }
    const [nuevo] = await db
      .insert(eventos)
      .values({ ...v.data, tipoJuego: "reto_transformacion", tokenPublico: randomBytes(18).toString("base64url"), creadoPor: sesion.uid })
      .returning({ id: eventos.id });
    await registrarAuditoria("evento_creado", { usuarioId: sesion.uid, detalle: { eventoId: nuevo.id, nombre: v.data.nombre, duracionDias: v.data.duracionDias } });
    refresh();
    return exito({ id: nuevo.id });
  });
}

/** Borrador → en curso. Requiere al menos un participante activo. */
export async function iniciarReto(entrada: { id: number }): Promise<Resultado> {
  return conPermiso(() =>
    conReglas(async () => {
      const sesion = await autorizar("admin");
      const id = idPositivo.parse(entrada.id);
      await db.transaction(async (tx) => {
        const e = await eventoBloqueado(tx, id);
        if (!e) throw new ErrorEvento("El reto no existe");
        if (e.estado !== "borrador") throw new ErrorEvento("El reto ya fue iniciado");
        const [{ n }] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(participantesEvento)
          .where(and(eq(participantesEvento.eventoId, id), eq(participantesEvento.activo, true)));
        if (n === 0) throw new ErrorEvento("Inscribe al menos un participante antes de iniciar el reto");
        await tx.update(eventos).set({ estado: "en_curso", iniciadoEn: new Date(), actualizadoEn: new Date() }).where(eq(eventos.id, id));
        await conciliarAlertasEventos(tx);
      });
      await registrarAuditoria("evento_iniciado", { usuarioId: sesion.uid, detalle: { eventoId: id } });
      refresh();
      return exito();
    }),
  );
}

/**
 * En curso → finalizado. Si hay participantes activos sin pesaje final, pide `forzar` (quedan como
 * "No completó"). Desde aquí los resultados quedan bloqueados: no se registran ni corrigen pesajes.
 */
export async function finalizarReto(entrada: { id: number; forzar: boolean }): Promise<Resultado<{ sinFinal: string[] }>> {
  return conPermiso(() =>
    conReglas(async () => {
      const sesion = await autorizar("admin");
      const id = idPositivo.parse(entrada.id);
      const sinFinal = await db.transaction(async (tx) => {
        const e = await eventoBloqueado(tx, id);
        if (!e) throw new ErrorEvento("El reto no existe");
        if (e.estado !== "en_curso") throw new ErrorEvento(e.estado === "finalizado" ? "El reto ya está finalizado" : "El reto todavía no empezó");
        const faltan = await tx
          .select({ nombre: participantesEvento.nombreCompleto })
          .from(participantesEvento)
          .where(
            and(
              eq(participantesEvento.eventoId, id),
              eq(participantesEvento.activo, true),
              sql`not exists (select 1 from ${pesajes} where ${pesajes.participanteId} = ${participantesEvento.id} and ${pesajes.esPesajeFinal})`,
            ),
          );
        if (faltan.length > 0 && !entrada.forzar) return faltan.map((f) => f.nombre);
        await tx.update(eventos).set({ estado: "finalizado", finalizadoEn: new Date(), actualizadoEn: new Date() }).where(eq(eventos.id, id));
        await conciliarAlertasEventos(tx);
        return null;
      });
      if (sinFinal) {
        return fallo(`${sinFinal.length} participante${sinFinal.length === 1 ? "" : "s"} sin pesaje final: ${sinFinal.join(", ")}`);
      }
      await registrarAuditoria("evento_finalizado", { usuarioId: sesion.uid, detalle: { eventoId: id, forzado: entrada.forzar } });
      refresh();
      return exito({ sinFinal: [] });
    }),
  );
}

// ---------------------------------------------------------------- Participantes

export async function inscribirParticipante(entrada: DatosParticipante): Promise<Resultado<{ id: number }>> {
  return conPermiso(() =>
    conReglas(async () => {
      const sesion = await autorizar("admin");
      const v = esquemaParticipante.safeParse(entrada);
      if (!v.success) return falloValidacion(v.error);
      try {
        const nuevo = await db.transaction(async (tx) => {
          const e = await eventoBloqueado(tx, v.data.eventoId);
          if (!e) throw new ErrorEvento("El reto no existe");
          if (e.estado === "finalizado") throw new ErrorEvento("El reto ya terminó: no se pueden inscribir participantes");
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

export async function editarParticipante(entrada: DatosEditarParticipante): Promise<Resultado> {
  return conPermiso(() =>
    conReglas(async () => {
      const sesion = await autorizar("admin");
      const v = esquemaEditarParticipante.safeParse(entrada);
      if (!v.success) return falloValidacion(v.error);
      const { id, ...datos } = v.data;
      try {
        const antes = await db.transaction(async (tx) => {
          const [p] = await tx.select().from(participantesEvento).where(eq(participantesEvento.id, id));
          if (!p) throw new ErrorEvento("El participante no existe");
          const e = await eventoBloqueado(tx, p.eventoId);
          if (e?.estado === "finalizado") throw new ErrorEvento("El reto está finalizado: sus datos ya no se modifican");
          await tx.update(participantesEvento).set(datos).where(eq(participantesEvento.id, id));
          return p;
        });
        const cambios = Object.fromEntries(
          (Object.keys(datos) as (keyof typeof datos)[])
            .filter((k) => String(antes[k]) !== String(datos[k]))
            .map((k) => [k, { antes: antes[k], despues: datos[k] }]),
        );
        await registrarAuditoria("participante_editado", {
          usuarioId: sesion.uid,
          detalle: { eventoId: antes.eventoId, participanteId: id, nombre: datos.nombreCompleto, cambios },
        });
        refresh();
        return exito();
      } catch (e) {
        if (esViolacionUnica(e, "participantes_evento_cedula_uq")) return fallo("Revisa los datos marcados", CEDULA_REPETIDA);
        throw e;
      }
    }),
  );
}

/** Baja con motivo: no se borra (queda en el historial y fuera de la tabla de posiciones). */
export async function darDeBajaParticipante(entrada: DatosBaja): Promise<Resultado> {
  return conPermiso(() =>
    conReglas(async () => {
      const sesion = await autorizar("admin");
      const v = esquemaBaja.safeParse(entrada);
      if (!v.success) return falloValidacion(v.error);
      const p = await db.transaction(async (tx) => {
        const [p] = await tx.select().from(participantesEvento).where(eq(participantesEvento.id, v.data.id));
        if (!p) throw new ErrorEvento("El participante no existe");
        if (!p.activo) throw new ErrorEvento("El participante ya estaba dado de baja");
        const e = await eventoBloqueado(tx, p.eventoId);
        if (e?.estado === "finalizado") throw new ErrorEvento("El reto está finalizado: ya no se dan bajas");
        await tx.update(participantesEvento).set({ activo: false, motivoBaja: v.data.motivo }).where(eq(participantesEvento.id, p.id));
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

// ---------------------------------------------------------------- Pesajes

/**
 * Jornada de pesaje: todos los pesos en una sola transacción. Solo con el reto en curso.
 * Un pesaje por participante y día; un solo pesaje final por participante. Cambios de más de 10 %
 * respecto al pesaje anterior requieren `confirmarCambios` (la pantalla lo pregunta antes).
 */
export async function guardarPesajes(entrada: DatosPesajes): Promise<Resultado<{ guardados: number }>> {
  return conPermiso(() =>
    conReglas(async () => {
      const sesion = await autorizar("admin");
      const v = esquemaPesajes.safeParse(entrada);
      if (!v.success) return falloValidacion(v.error);
      const d = v.data;
      await db.transaction(async (tx) => {
        const e = await eventoBloqueado(tx, d.eventoId);
        if (!e) throw new ErrorEvento("El reto no existe");
        if (e.estado !== "en_curso") {
          throw new ErrorEvento(e.estado === "finalizado" ? "El reto está finalizado: los pesajes ya no se modifican" : "Inicia el reto antes de registrar pesajes");
        }
        const ids = d.lineas.map((l) => l.participanteId);
        const participantes = await tx
          .select()
          .from(participantesEvento)
          .where(and(inArray(participantesEvento.id, ids), eq(participantesEvento.eventoId, d.eventoId), eq(participantesEvento.activo, true)));
        if (participantes.length !== ids.length) throw new ErrorEvento("Algún participante no está activo en este reto. Actualiza la pantalla.");

        const previos = await tx.select().from(pesajes).where(inArray(pesajes.participanteId, ids)).orderBy(pesajes.fecha, pesajes.id);
        const porId = new Map(participantes.map((p) => [p.id, p]));
        const sospechosos: string[] = [];
        for (const l of d.lineas) {
          const p = porId.get(l.participanteId)!;
          const suyos = previos.filter((x) => x.participanteId === l.participanteId);
          if (suyos.some((x) => x.fecha === d.fecha)) throw new ErrorEvento(`${p.nombreCompleto} ya tiene un pesaje el ${d.fecha.split("-").reverse().join("/")}: corrígelo desde su historial`);
          if (d.esPesajeFinal && suyos.some((x) => x.esPesajeFinal)) throw new ErrorEvento(`${p.nombreCompleto} ya tiene pesaje final: corrígelo desde su historial`);
          const anterior = aCentikg(suyos.at(-1)?.peso ?? p.pesoInicial);
          if (cambioSospechoso(anterior, aCentikg(l.peso))) sospechosos.push(p.nombreCompleto);
        }
        if (sospechosos.length && !d.confirmarCambios) {
          throw new ErrorEvento(`Cambios de más de 10 % sin confirmar: ${sospechosos.join(", ")}`);
        }
        await tx.insert(pesajes).values(
          d.lineas.map((l) => ({ participanteId: l.participanteId, fecha: d.fecha, peso: l.peso, esPesajeFinal: d.esPesajeFinal, registradoPor: sesion.uid })),
        );
        await tx.update(eventos).set({ actualizadoEn: new Date() }).where(eq(eventos.id, d.eventoId));
      });
      await registrarAuditoria("pesajes_registrados", {
        usuarioId: sesion.uid,
        detalle: { eventoId: d.eventoId, fecha: d.fecha, final: d.esPesajeFinal, cantidad: d.lineas.length, confirmoCambios: d.confirmarCambios },
      });
      refresh();
      return exito({ guardados: d.lineas.length });
    }),
  );
}

/** Corrige un pesaje (error de digitación): queda en auditoría quién lo corrigió y el valor anterior. */
export async function corregirPesaje(entrada: DatosCorreccionPesaje): Promise<Resultado> {
  return conPermiso(() =>
    conReglas(async () => {
      const sesion = await autorizar("admin");
      const v = esquemaCorreccionPesaje.safeParse(entrada);
      if (!v.success) return falloValidacion(v.error);
      const r = await db.transaction(async (tx) => {
        const [x] = await tx
          .select({ pesaje: pesajes, eventoId: participantesEvento.eventoId, nombre: participantesEvento.nombreCompleto })
          .from(pesajes)
          .innerJoin(participantesEvento, eq(participantesEvento.id, pesajes.participanteId))
          .where(eq(pesajes.id, v.data.id));
        if (!x) throw new ErrorEvento("El pesaje no existe");
        const e = await eventoBloqueado(tx, x.eventoId);
        if (e?.estado === "finalizado") throw new ErrorEvento("El reto está finalizado: los pesajes ya no se modifican");
        await tx
          .update(pesajes)
          .set({ peso: v.data.peso, nota: `Corregido (antes ${x.pesaje.peso} kg): ${v.data.motivo}` })
          .where(eq(pesajes.id, v.data.id));
        return x;
      });
      await registrarAuditoria("pesaje_corregido", {
        usuarioId: sesion.uid,
        detalle: {
          eventoId: r.eventoId,
          pesajeId: v.data.id,
          participante: r.nombre,
          fecha: r.pesaje.fecha,
          antes: r.pesaje.peso,
          despues: v.data.peso,
          motivo: v.data.motivo,
        },
      });
      refresh();
      return exito();
    }),
  );
}
