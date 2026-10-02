/** Validaciones de la Fase 4 (caja, ventas, gastos, QR): mismas en cliente y servidor. */
import { z } from "zod";
import { idPositivo, monto, textoOpcional, textoRequerido, urlImagen } from "./comunes";
import { esquemaComboPedido } from "./combos";
import { cantidad } from "./inventario";

export const CATEGORIAS_GASTO = ["Transporte", "Limpieza", "Alimentación", "Servicios", "Insumos", "Otros"] as const;

export const esquemaApertura = z.object({ montoInicial: monto("Monto inválido") });
export type DatosApertura = z.input<typeof esquemaApertura>;

export const esquemaVenta = z
  .object({
    /** UUID generado en el dispositivo: si se reenvía (doble clic, reintento), no se duplica la venta. */
    uuid: z.uuid("Identificador inválido"),
    lineas: z
      // `fraccion`: unidades sueltas (cápsulas…) en vez del envase completo. Un producto puede ir de las dos formas.
      .array(z.object({ productoId: idPositivo, cantidad, fraccion: z.boolean().optional().default(false) }))
      .max(200)
      .refine((ls) => new Set(ls.map((l) => `${l.productoId}:${l.fraccion}`)).size === ls.length, "Producto repetido en el carrito"),
    /** Combos de productos (el servidor los cotiza con los precios de la BD). */
    combos: z
      .array(esquemaComboPedido)
      .max(50)
      .optional()
      .default([])
      .refine((cs) => new Set(cs.map((c) => c.comboId)).size === cs.length, "Combo repetido en el carrito"),
    metodoPago: z.enum(["efectivo", "qr"]),
    montoRecibido: monto("Monto recibido inválido").nullable(),
    clienteNombre: textoOpcional(120),
    clienteTelefono: textoOpcional(30).refine((t) => t === null || /^[\d\s+()-]{7,30}$/.test(t), "Teléfono inválido"),
    /** Código de cupón (opcional); se valida y consume en el servidor. */
    cuponCodigo: textoOpcional(40).transform((c) => c?.toUpperCase() ?? null),
  })
  .refine((d) => d.lineas.length + d.combos.length > 0, { path: ["lineas"], message: "El carrito está vacío" })
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

// ---------------------------------------------------------------- Operaciones sin conexión (Fase 6)

/** Venta hecha sin conexión: trae lo que se cobró en el dispositivo (precios y descuentos por línea). */
export const esquemaVentaOffline = z
  .object({
    uuid: z.uuid(),
    cajaId: idPositivo,
    /** Instante de la venta en el dispositivo (ms). */
    fecha: z.number().int().positive(),
    lineas: z
      .array(
        z.object({
          productoId: idPositivo,
          cantidad,
          precioUnitario: monto(),
          descuento: monto(),
          promocionId: idPositivo.nullable(),
          fraccion: z.boolean().optional().default(false),
          /** Posición en `combos` del combo al que pertenece la línea (null = producto suelto). */
          combo: z.number().int().min(0).max(49).nullable().optional().default(null),
        }),
      )
      .min(1)
      .max(400),
    /** Combos vendidos, con el nombre y los precios que se cobraron en el dispositivo. */
    combos: z
      .array(z.object({ comboId: idPositivo, nombre: textoRequerido(120), cantidad, precioNormal: monto(), precioFinal: monto() }))
      .max(50)
      .optional()
      .default([]),
    metodoPago: z.enum(["efectivo", "qr"]),
    montoRecibido: monto().nullable(),
    clienteNombre: textoOpcional(120),
    clienteTelefono: textoOpcional(30),
  })
  .refine((d) => d.lineas.every((l) => l.combo === null || l.combo < d.combos.length), { path: ["lineas"], message: "Línea de un combo inexistente" })
  .refine((d) => d.metodoPago !== "efectivo" || d.montoRecibido !== null, { path: ["montoRecibido"], message: "Falta el monto recibido" });
export type DatosVentaOffline = z.output<typeof esquemaVentaOffline>;

export const esquemaGastoOffline = z.object({
  uuid: z.uuid(),
  cajaId: idPositivo,
  fecha: z.number().int().positive(),
  categoria: z.enum(CATEGORIAS_GASTO),
  monto: monto().refine((m) => Number(m) > 0, "El monto debe ser mayor a 0"),
  descripcion: textoOpcional(300),
});
export type DatosGastoOffline = z.output<typeof esquemaGastoOffline>;

export const esquemaLoteSync = z.object({
  operaciones: z
    .array(
      z.object({
        uuid: z.uuid(),
        tipo: z.enum(["venta", "gasto"]),
        datos: z.unknown(),
      }),
    )
    .min(1)
    .max(50),
});
