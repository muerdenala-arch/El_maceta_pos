/** Validaciones de la Fase 4 (caja, ventas, gastos, QR): mismas en cliente y servidor. */
import { z } from "zod";
import { idPositivo, monto, textoOpcional, textoRequerido, urlImagen } from "./comunes";
import { cantidad } from "./inventario";

export const CATEGORIAS_GASTO = ["Transporte", "Limpieza", "Alimentación", "Servicios", "Insumos", "Otros"] as const;

export const esquemaApertura = z.object({ montoInicial: monto("Monto inválido") });
export type DatosApertura = z.input<typeof esquemaApertura>;

export const esquemaVenta = z
  .object({
    /** UUID generado en el dispositivo: si se reenvía (doble clic, reintento), no se duplica la venta. */
    uuid: z.uuid("Identificador inválido"),
    lineas: z
      .array(z.object({ productoId: idPositivo, cantidad }))
      .min(1, "El carrito está vacío")
      .max(200)
      .refine((ls) => new Set(ls.map((l) => l.productoId)).size === ls.length, "Producto repetido en el carrito"),
    metodoPago: z.enum(["efectivo", "qr"]),
    montoRecibido: monto("Monto recibido inválido").nullable(),
    clienteNombre: textoOpcional(120),
    clienteTelefono: textoOpcional(30).refine((t) => t === null || /^[\d\s+()-]{7,30}$/.test(t), "Teléfono inválido"),
  })
  .refine((d) => d.metodoPago !== "efectivo" || d.montoRecibido !== null, {
    path: ["montoRecibido"],
    message: "Ingresa el monto recibido",
  });
export type DatosVenta = z.input<typeof esquemaVenta>;

export const esquemaGasto = z.object({
  uuid: z.uuid(),
  categoria: z.enum(CATEGORIAS_GASTO, { message: "Elige una categoría" }),
  monto: monto("Monto inválido").refine((m) => Number(m) > 0, "El monto debe ser mayor a 0"),
  descripcion: textoOpcional(300),
  fotoUrl: urlImagen,
});
export type DatosGasto = z.input<typeof esquemaGasto>;

export const esquemaCierre = z.object({ efectivoContado: monto("Monto inválido") });
export type DatosCierre = z.input<typeof esquemaCierre>;

export const esquemaAnulacion = z.object({
  id: idPositivo,
  motivo: textoRequerido(300, "El motivo es obligatorio").min(4, "Describe el motivo (mínimo 4 caracteres)"),
});
export type DatosAnulacion = z.input<typeof esquemaAnulacion>;

export const esquemaQr = z.object({
  nombre: textoRequerido(120, "Ej. Banco Unión — cuenta tienda"),
  imagenUrl: urlImagen.refine((u) => u !== null, "Sube la imagen del QR"),
  sucursalId: idPositivo.nullable(),
  activo: z.boolean(),
});
export type DatosQr = z.input<typeof esquemaQr>;
