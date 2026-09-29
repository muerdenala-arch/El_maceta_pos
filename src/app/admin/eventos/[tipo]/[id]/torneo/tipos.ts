import type { EventoDetalle, ParticipanteListado } from "@/lib/eventos/consultas";
import type { Combate, Formato } from "@/lib/eventos/pulseada";

/** Datos del torneo que la página (servidor) pasa a sus componentes. Cédula y teléfono: solo pantallas del admin. */
export type TorneoProps = {
  evento: EventoDetalle;
  torneo: { formato: Formato; mejorDe: number; puntosVictoria: number; sorteado: boolean };
  participantes: ParticipanteListado[];
  /** Llaves reconstruidas (estado actual). */
  llaves: Combate[];
  /** Id de la fila de cada combate por clave (para las acciones de la mesa). */
  ids: Record<string, number>;
  negocio: { nombre: string; logoUrl: string | null; nit: string | null; codigoPais: string };
};

/** Nombre del competidor por id (incluye a los dados de baja). */
export const nombresDe = (participantes: TorneoProps["participantes"]) => new Map(participantes.map((p) => [p.id, p.nombreCompleto]));
