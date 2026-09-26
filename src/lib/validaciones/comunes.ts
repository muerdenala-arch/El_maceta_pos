import { z } from "zod";

/** Texto opcional: "" o solo espacios → null. */
export const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .transform((s) => (s === "" ? null : s))
    .nullable()
    .optional()
    .transform((s) => s ?? null);

export const textoRequerido = (max: number, mensaje = "Este campo es obligatorio") =>
  z.string().trim().min(1, mensaje).max(max, `Máximo ${max} caracteres`);

/** Monto en bolivianos como string decimal ("12,5" → "12.5"). Nunca se convierte a float. */
export const monto = (mensaje = "Monto inválido") =>
  z
    .string()
    .trim()
    .transform((s) => s.replace(",", "."))
    .pipe(z.string().regex(/^\d{1,9}(\.\d{1,2})?$/, mensaje));

export const telefono = textoOpcional(30).refine(
  (t) => t === null || /^[\d\s+()-]{6,30}$/.test(t),
  "Teléfono inválido",
);

export const idPositivo = z.coerce.number().int().positive();

/**
 * URL de imagen propia: subida por la app (Vercel Blob o almacenamiento local de desarrollo).
 * Evita que se guarden enlaces a sitios externos arbitrarios.
 */
export const urlImagen = z
  .string()
  .refine(
    (u) => /^\/api\/archivos\/[\w-]+\/[\w-]+\.(webp|png|jpg)$/.test(u) || /^https:\/\/[\w-]+\.public\.blob\.vercel-storage\.com\//.test(u),
    "Imagen inválida",
  )
  .nullable();
