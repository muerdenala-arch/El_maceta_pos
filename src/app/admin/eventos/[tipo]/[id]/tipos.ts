import type { EventoDetalle, ParticipanteListado, PesajeListado } from "@/lib/eventos/consultas";

/** Datos del reto que la página (servidor) pasa a sus componentes. Cédula y teléfono: solo pantallas del admin. */
export type DetalleRetoProps = {
  evento: EventoDetalle;
  participantes: ParticipanteListado[];
  pesajes: PesajeListado[];
  hoy: string;
  negocio: { nombre: string; logoUrl: string | null; nit: string | null; codigoPais: string };
};
