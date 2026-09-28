import { z } from "zod";

export const esquemaPin = z.string().regex(/^\d{4,6}$/, "El PIN debe tener de 4 a 6 dígitos");

/** Ingreso solo con el PIN: el sistema identifica al usuario por su PIN (únicos entre usuarios). */
export const esquemaLogin = z.object({ pin: esquemaPin });

export type DatosLogin = z.input<typeof esquemaLogin>;
