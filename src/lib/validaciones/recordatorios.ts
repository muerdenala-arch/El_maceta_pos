/** Validación de recordatorios: la misma en el formulario y en el servidor. */
import { z } from "zod";
import { fechaValida } from "@/lib/formato";
import { REPETICIONES } from "@/lib/recordatorios/calculo";
import { textoRequerido } from "./comunes";

export const esquemaRecordatorio = z.object({
  titulo: textoRequerido(120, "Escribe qué quieres recordar"),
  nota: z.string().trim().max(500, "Máximo 500 caracteres").optional().default("").transform((s) => s || null),
  fecha: z.string().refine((f) => fechaValida(f) !== null, "Fecha inválida"),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida"),
  repeticion: z.enum(REPETICIONES),
});
export type DatosRecordatorio = z.input<typeof esquemaRecordatorio>;
