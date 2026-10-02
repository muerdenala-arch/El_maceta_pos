/** Validaciones de los combos de productos: mismas en el formulario y en el servidor. */
import { z } from "zod";
import { idPositivo, monto, textoOpcional, textoRequerido, urlImagen } from "./comunes";
import { cantidad, fechaOpcional } from "./inventario";

export const esquemaCombo = z
  .object({
    nombre: textoRequerido(120, "Ingresa el nombre del combo"),
    descripcion: textoOpcional(1000),
    fotoUrl: urlImagen,
    tipoDescuento: z.enum(["porcentaje", "monto"]),
    /** Porcentaje (0–100) o Bs, según `tipoDescuento`. Vacío = sin descuento. */
    valorDescuento: z
      .string()
      .trim()
      .transform((s) => (s === "" ? "0" : s))
      .pipe(monto("Descuento inválido")),
    fechaInicio: fechaOpcional,
    fechaFin: fechaOpcional,
    activo: z.boolean(),
    items: z
      .array(z.object({ productoId: idPositivo, cantidad, fraccion: z.boolean().optional().default(false) }))
      .min(1, "Agrega al menos un producto al combo")
      .max(30, "Máximo 30 productos por combo")
      .refine((is) => new Set(is.map((i) => `${i.productoId}:${i.fraccion}`)).size === is.length, "Hay productos repetidos en el combo"),
  })
  .superRefine((d, ctx) => {
    if (d.tipoDescuento === "porcentaje" && Number(d.valorDescuento) > 100) {
      ctx.addIssue({ code: "custom", path: ["valorDescuento"], message: "El porcentaje no puede pasar de 100" });
    }
    if (d.fechaInicio && d.fechaFin && d.fechaFin < d.fechaInicio) {
      ctx.addIssue({ code: "custom", path: ["fechaFin"], message: "La fecha de fin no puede ser anterior al inicio" });
    }
  });
export type DatosCombo = z.input<typeof esquemaCombo>;

/** Combo pedido en una venta. */
export const esquemaComboPedido = z.object({ comboId: idPositivo, cantidad });
