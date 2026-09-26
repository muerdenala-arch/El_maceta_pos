/** Validaciones de la Fase 3 (inventario): mismas en cliente y servidor. */
import { z } from "zod";
import { idPositivo, textoOpcional, textoRequerido } from "./comunes";

export const cantidad = z.coerce
  .number({ message: "Cantidad inválida" })
  .int("Debe ser un número entero")
  .min(1, "Mínimo 1")
  .max(100_000, "Cantidad demasiado grande");

/** "" → null; si no, una fecha AAAA-MM-DD real. */
export const fechaOpcional = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((s) => (s ? s : null))
  .refine((s) => s === null || (/^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T12:00:00Z`).toISOString().startsWith(s)), "Fecha inválida");

const lineaIngreso = z.object({
  productoId: idPositivo,
  cantidad,
  fechaVencimiento: fechaOpcional,
});

export const esquemaIngreso = z.object({
  ubicacionId: idPositivo,
  proveedor: textoOpcional(120),
  documento: textoOpcional(60),
  lineas: z.array(lineaIngreso).min(1, "Agrega al menos un producto").max(300),
});
export type DatosIngreso = z.input<typeof esquemaIngreso>;

export const esquemaAjuste = z.object({
  productoId: idPositivo,
  ubicacionId: idPositivo,
  cantidadNueva: z.coerce.number({ message: "Cantidad inválida" }).int("Debe ser un número entero").min(0, "No puede ser negativa").max(1_000_000),
  /** Solo se usa si el ajuste suma unidades. */
  fechaVencimiento: fechaOpcional,
  motivo: textoRequerido(300, "El motivo es obligatorio").min(4, "Describe el motivo (mínimo 4 caracteres)"),
});
export type DatosAjuste = z.input<typeof esquemaAjuste>;

export const esquemaTransferencia = z
  .object({
    origenId: idPositivo,
    destinoId: idPositivo,
    nota: textoOpcional(300),
    lineas: z.array(z.object({ productoId: idPositivo, cantidad })).min(1, "Agrega al menos un producto").max(300),
    /** Si atiende una solicitud de reposición, se marca como resuelta. */
    alertaId: idPositivo.nullable().optional(),
  })
  .refine((d) => d.origenId !== d.destinoId, { path: ["destinoId"], message: "El destino debe ser distinto del origen" })
  .refine((d) => new Set(d.lineas.map((l) => l.productoId)).size === d.lineas.length, {
    path: ["lineas"],
    message: "Hay productos repetidos: junta las cantidades en una sola fila",
  });
export type DatosTransferencia = z.input<typeof esquemaTransferencia>;

export const esquemaSolicitudReposicion = z.object({
  productoId: idPositivo,
  cantidad,
  nota: textoOpcional(200),
});
export type DatosSolicitudReposicion = z.input<typeof esquemaSolicitudReposicion>;
