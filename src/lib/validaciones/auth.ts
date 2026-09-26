import { z } from "zod";

export const esquemaPin = z.string().regex(/^\d{4,6}$/, "El PIN debe tener de 4 a 6 dígitos");

export const esquemaLogin = z.object({
  usuario: z.string().trim().toLowerCase().min(1, "Ingresa tu usuario").max(50),
  pin: esquemaPin,
});

export type DatosLogin = z.input<typeof esquemaLogin>;
