/** Validaciones del apartado Sueldos: mismas en cliente y servidor. */
import { z } from "zod";
import { periodoValido, TIPOS_MOVIMIENTO } from "@/lib/sueldos/calculo";
import { idPositivo, monto, textoOpcional, textoRequerido } from "./comunes";

const periodo = z.string().refine(periodoValido, "Mes inválido");

export const esquemaSueldo = z.object({
  usuarioId: idPositivo,
  periodo,
  monto: monto("Sueldo inválido"),
});
export type DatosSueldo = z.input<typeof esquemaSueldo>;

export const esquemaMovimientoSueldo = z
  .object({
    usuarioId: idPositivo,
    periodo,
    tipo: z.enum(TIPOS_MOVIMIENTO),
    monto: monto("Monto inválido").refine((m) => Number(m) > 0, "El monto debe ser mayor a 0"),
    nota: textoOpcional(300),
  })
  .refine((d) => d.tipo !== "descuento" || (d.nota !== null && d.nota.length >= 4), { path: ["nota"], message: "Escribe el motivo del descuento" });
export type DatosMovimientoSueldo = z.input<typeof esquemaMovimientoSueldo>;

export const esquemaAnularMovimiento = z.object({
  id: idPositivo,
  motivo: textoRequerido(300, "El motivo es obligatorio").min(4, "Describe el motivo (mínimo 4 caracteres)"),
});
export type DatosAnularMovimiento = z.input<typeof esquemaAnularMovimiento>;
