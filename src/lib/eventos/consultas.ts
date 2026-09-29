import "server-only";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { eventos, participantesEvento, pesajes, sucursales } from "@/db/schema";
import type { TipoJuego } from "./tipos";

export type EventoListado = {
  id: number;
  nombre: string;
  estado: "borrador" | "en_curso" | "finalizado";
  fechaInicio: string;
  fechaFin: string;
  duracionDias: number;
  criterioGanador: "porcentaje" | "kilos";
  sucursal: string | null;
  participantes: number;
};

/** Cantidad de eventos por tipo (tarjetas del catálogo). */
export async function conteoPorTipo(): Promise<Record<string, { total: number; enCurso: number }>> {
  const filas = await db
    .select({
      tipo: eventos.tipoJuego,
      total: count(),
      enCurso: sql<number>`count(*) filter (where ${eventos.estado} = 'en_curso')::int`,
    })
    .from(eventos)
    .groupBy(eventos.tipoJuego);
  return Object.fromEntries(filas.map((f) => [f.tipo, { total: f.total, enCurso: f.enCurso }]));
}

export async function listarEventos(tipo: TipoJuego): Promise<EventoListado[]> {
  const activos = db
    .select({ eventoId: participantesEvento.eventoId, n: count().as("n") })
    .from(participantesEvento)
    .where(eq(participantesEvento.activo, true))
    .groupBy(participantesEvento.eventoId)
    .as("activos");
  const filas = await db
    .select({
      id: eventos.id,
      nombre: eventos.nombre,
      estado: eventos.estado,
      fechaInicio: eventos.fechaInicio,
      fechaFin: eventos.fechaFin,
      duracionDias: eventos.duracionDias,
      criterioGanador: eventos.criterioGanador,
      sucursal: sucursales.nombre,
      participantes: sql<number>`coalesce(${activos.n}, 0)::int`,
    })
    .from(eventos)
    .leftJoin(sucursales, eq(sucursales.id, eventos.sucursalId))
    .leftJoin(activos, eq(activos.eventoId, eventos.id))
    .where(eq(eventos.tipoJuego, tipo))
    .orderBy(sql`${eventos.estado} = 'finalizado'`, desc(eventos.fechaInicio), desc(eventos.id));
  return filas.map((f) => ({ ...f, fechaFin: f.fechaFin! }));
}

export type EventoDetalle = NonNullable<Awaited<ReturnType<typeof obtenerEvento>>>;

export async function obtenerEvento(id: number, tipo: TipoJuego) {
  const [e] = await db
    .select({
      id: eventos.id,
      tipoJuego: eventos.tipoJuego,
      nombre: eventos.nombre,
      descripcion: eventos.descripcion,
      fechaInicio: eventos.fechaInicio,
      fechaFin: eventos.fechaFin,
      duracionDias: eventos.duracionDias,
      criterioGanador: eventos.criterioGanador,
      estado: eventos.estado,
      sucursalId: eventos.sucursalId,
      sucursal: sucursales.nombre,
      premios: eventos.premios,
      tokenPublico: eventos.tokenPublico,
      finalizadoEn: eventos.finalizadoEn,
    })
    .from(eventos)
    .leftJoin(sucursales, eq(sucursales.id, eventos.sucursalId))
    .where(and(eq(eventos.id, id), eq(eventos.tipoJuego, tipo)));
  return e ? { ...e, fechaFin: e.fechaFin!, finalizadoEn: e.finalizadoEn?.toISOString() ?? null } : null;
}

export type ParticipanteListado = Awaited<ReturnType<typeof participantesDe>>[number];

/** Participantes del evento (incluye bajas). Con cédula y teléfono: solo para pantallas del admin. */
export async function participantesDe(eventoId: number) {
  const filas = await db
    .select({
      id: participantesEvento.id,
      nombreCompleto: participantesEvento.nombreCompleto,
      cedulaIdentidad: participantesEvento.cedulaIdentidad,
      telefono: participantesEvento.telefono,
      pesoInicial: participantesEvento.pesoInicial,
      fechaInscripcion: participantesEvento.fechaInscripcion,
      activo: participantesEvento.activo,
      motivoBaja: participantesEvento.motivoBaja,
    })
    .from(participantesEvento)
    .where(eq(participantesEvento.eventoId, eventoId))
    .orderBy(desc(participantesEvento.activo), asc(participantesEvento.nombreCompleto));
  return filas.map((f) => ({ ...f, fechaInscripcion: f.fechaInscripcion.toISOString() }));
}

export type PesajeListado = Awaited<ReturnType<typeof pesajesDe>>[number];

export async function pesajesDe(eventoId: number) {
  return db
    .select({
      id: pesajes.id,
      participanteId: pesajes.participanteId,
      fecha: pesajes.fecha,
      peso: pesajes.peso,
      esPesajeFinal: pesajes.esPesajeFinal,
      nota: pesajes.nota,
    })
    .from(pesajes)
    .innerJoin(participantesEvento, eq(participantesEvento.id, pesajes.participanteId))
    .where(eq(participantesEvento.eventoId, eventoId))
    .orderBy(asc(pesajes.fecha), asc(pesajes.id));
}

/** Resultados para la vista pública (enlace de WhatsApp): solo nombre y datos del reto, nunca cédula ni teléfono. */
export async function eventoPublico(token: string) {
  if (!/^[\w-]{16,64}$/.test(token)) return null;
  const [e] = await db
    .select({
      id: eventos.id,
      tipoJuego: eventos.tipoJuego,
      nombre: eventos.nombre,
      fechaInicio: eventos.fechaInicio,
      fechaFin: eventos.fechaFin,
      criterioGanador: eventos.criterioGanador,
      estado: eventos.estado,
      premios: eventos.premios,
    })
    .from(eventos)
    .where(eq(eventos.tokenPublico, token));
  if (!e) return null;
  const [participantes, lista] = await Promise.all([
    db
      .select({ id: participantesEvento.id, nombre: participantesEvento.nombreCompleto, pesoInicial: participantesEvento.pesoInicial })
      .from(participantesEvento)
      .where(and(eq(participantesEvento.eventoId, e.id), eq(participantesEvento.activo, true))),
    pesajesDe(e.id),
  ]);
  return { evento: { ...e, fechaFin: e.fechaFin! }, participantes, pesajes: lista };
}
