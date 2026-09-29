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
