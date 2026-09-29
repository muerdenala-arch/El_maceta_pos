import { z } from "zod";
import { idPositivo, textoOpcional, textoRequerido } from "./comunes";

/** "2026-10-01" (fecha real). */
const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
  .refine((f) => {
    const d = new Date(`${f}T12:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(f);
  }, "Fecha inválida");

/** Peso en kg con hasta 2 decimales, entre 30 y 300 ("85,5" → "85.50"). */
export const pesoKg = z
  .string()
  .trim()
  .transform((s) => s.replace(",", "."))
  .pipe(z.string().regex(/^\d{2,3}(\.\d{1,2})?$/, "Peso inválido (ej. 85,5)"))
  .refine((s) => Number(s) >= 30 && Number(s) <= 300, "El peso debe estar entre 30 y 300 kg")
  .transform((s) => Number(s).toFixed(2));

/**
 * Cédula de identidad boliviana: número (4 a 10 dígitos), complemento opcional ("-1A") y extensión
 * opcional del departamento ("LP"). Se guarda normalizada: "1234567-1A LP".
 */
export const cedulaIdentidad = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase().replace(/\s*-\s*/g, "-").replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .regex(/^(E-)?\d{4,10}(-[0-9A-Z]{1,2})?( (LP|CB|SC|OR|PT|TJ|CH|BE|PD))?$/, "Cédula inválida (ej. 1234567 o 1234567-1A LP)"),
  );

/** Celular boliviano de 8 dígitos (6… o 7…); acepta +591, espacios y guiones. Se guarda "71234567". */
export const celular = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s()-]/g, "").replace(/^\+?591(?=\d{8}$)/, ""))
  .pipe(z.string().regex(/^[67]\d{7}$/, "Celular inválido (8 dígitos, ej. 71234567)"));

export const esquemaReto = z.object({
  nombre: textoRequerido(120, "Ponle un nombre al reto").min(3, "Mínimo 3 caracteres"),
  descripcion: textoOpcional(1000),
  fechaInicio: fecha,
  duracionDias: z.coerce.number({ message: "Número inválido" }).int("Días enteros").min(1, "Mínimo 1 día").max(365, "Máximo 365 días"),
  criterioGanador: z.enum(["porcentaje", "kilos"]),
  sucursalId: idPositivo.nullable(),
  premios: textoOpcional(1000),
});
export type DatosReto = z.input<typeof esquemaReto>;

export const esquemaParticipante = z.object({
  eventoId: idPositivo,
  nombreCompleto: textoRequerido(160, "Escribe el nombre completo").min(3, "Mínimo 3 caracteres"),
  cedulaIdentidad,
  telefono: celular,
  pesoInicial: pesoKg,
  aceptaParticipar: z.literal(true, { message: "El participante debe aceptar participar y que se registre su peso" }),
});
export type DatosParticipante = z.input<typeof esquemaParticipante>;

export const esquemaEditarParticipante = esquemaParticipante.omit({ eventoId: true, aceptaParticipar: true }).extend({ id: idPositivo });
export type DatosEditarParticipante = z.input<typeof esquemaEditarParticipante>;

export const esquemaBaja = z.object({
  id: idPositivo,
  motivo: textoRequerido(300, "Escribe el motivo de la baja").min(4, "Describe el motivo (mínimo 4 caracteres)"),
});
export type DatosBaja = z.input<typeof esquemaBaja>;

export const esquemaPesajes = z.object({
  eventoId: idPositivo,
  fecha,
  esPesajeFinal: z.boolean(),
  /** El usuario confirmó los cambios de más de 10 % (el servidor vuelve a comprobarlo). */
  confirmarCambios: z.boolean(),
  lineas: z
    .array(z.object({ participanteId: idPositivo, peso: pesoKg }))
    .min(1, "Ingresa al menos un peso")
    .max(500)
    .refine((ls) => new Set(ls.map((l) => l.participanteId)).size === ls.length, "Participante repetido"),
});
export type DatosPesajes = z.input<typeof esquemaPesajes>;

export const esquemaCorreccionPesaje = z.object({
  id: idPositivo,
  peso: pesoKg,
  motivo: textoRequerido(300, "Escribe por qué se corrige").min(4, "Describe el motivo (mínimo 4 caracteres)"),
});
export type DatosCorreccionPesaje = z.input<typeof esquemaCorreccionPesaje>;

// ---------------------------------------------------------------- Torneo de Pulseada

export const esquemaTorneo = z.object({
  nombre: textoRequerido(120, "Ponle un nombre al torneo").min(3, "Mínimo 3 caracteres"),
  descripcion: textoOpcional(1000),
  fechaInicio: fecha,
  formato: z.enum(["eliminacion_directa", "doble_eliminacion", "todos_contra_todos"], { message: "Elige el formato" }),
  mejorDe: z.union([z.literal(1), z.literal(3), z.literal(5)]),
  puntosVictoria: z.coerce.number().int().min(1).max(10),
  sucursalId: idPositivo.nullable(),
  premios: textoOpcional(1000),
});
export type DatosTorneo = z.input<typeof esquemaTorneo>;

/** Competidor: como el participante del reto, pero el peso es opcional (categoría libre). */
export const esquemaCompetidor = z.object({
  eventoId: idPositivo,
  nombreCompleto: textoRequerido(160, "Escribe el nombre completo").min(3, "Mínimo 3 caracteres"),
  cedulaIdentidad,
  telefono: celular,
  pesoInicial: z.union([z.literal("").transform(() => null), pesoKg]).nullable().default(null),
  aceptaParticipar: z.literal(true, { message: "El competidor debe aceptar participar" }),
});
export type DatosCompetidor = z.input<typeof esquemaCompetidor>;

export const esquemaEditarCompetidor = esquemaCompetidor.omit({ eventoId: true, aceptaParticipar: true }).extend({ id: idPositivo });
export type DatosEditarCompetidor = z.input<typeof esquemaEditarCompetidor>;

const conteo = (max: number) => z.coerce.number().int().min(0).max(max);

/** Resultado de un combate: asaltos ganados y faltas de cada lado (el motor valida el marcador según el "mejor de"). */
export const esquemaCombate = z.object({
  id: idPositivo,
  asaltosA: conteo(5),
  asaltosB: conteo(5),
  faltasA: conteo(30),
  faltasB: conteo(30),
});
export type DatosCombate = z.input<typeof esquemaCombate>;

export const esquemaAusencia = z.object({ id: idPositivo, ausente: z.enum(["a", "b"]) });
export type DatosAusencia = z.input<typeof esquemaAusencia>;

export const esquemaCorreccionCombate = esquemaCombate.extend({
  motivo: textoRequerido(300, "Escribe por qué se corrige").min(4, "Describe el motivo (mínimo 4 caracteres)"),
});
export type DatosCorreccionCombate = z.input<typeof esquemaCorreccionCombate>;
