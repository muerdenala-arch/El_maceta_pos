/** Validaciones del apartado Sueldos: mismas en cliente y servidor. */
import { z } from "zod";
import { periodoValido, TIPOS_MOVIMIENTO } from "@/lib/sueldos/calculo";
import { idPositivo, monto, textoOpcional, textoRequerido } from "./comunes";
import { fechaOpcional } from "./inventario";

const periodo = z.string().refine(periodoValido, "Mes inválido");
const fechaRequerida = fechaOpcional.refine((f) => f !== null, "Elige la fecha");

/** Trabajador de la planilla (con o sin usuario en el sistema). */
export const esquemaTrabajador = z.object({
  nombre: textoRequerido(120, "Escribe el nombre"),
  cargo: textoOpcional(80),
  sucursalId: idPositivo.nullable(),
  /** Desde cuándo trabaja: marca el día en que cumple su mes. */
  fechaIngreso: fechaOpcional,
  sueldoMensual: monto("Sueldo inválido"),
});
export type DatosTrabajador = z.input<typeof esquemaTrabajador>;

export const esquemaSueldo = z.object({
  empleadoId: idPositivo,
  periodo,
  monto: monto("Sueldo inválido"),
});
export type DatosSueldo = z.input<typeof esquemaSueldo>;

export const esquemaMovimientoSueldo = z
  .object({
    empleadoId: idPositivo,
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

/** Baja (despido, renuncia…): fecha y motivo quedan en el historial del trabajador. */
export const esquemaBaja = z.object({
  id: idPositivo,
  fecha: fechaRequerida,
  motivo: textoRequerido(300, "El motivo es obligatorio").min(4, "Describe el motivo (mínimo 4 caracteres)"),
});
export type DatosBaja = z.input<typeof esquemaBaja>;

export const esquemaReincorporacion = z.object({ id: idPositivo, fecha: fechaRequerida });
export type DatosReincorporacion = z.input<typeof esquemaReincorporacion>;
