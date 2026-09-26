/** Validaciones de la Fase 5 (promociones y cupones): mismas en cliente y servidor. */
import { z } from "zod";
import { fechaValida } from "@/lib/formato";
import { idPositivo, textoRequerido } from "./comunes";

const fecha = z.string().refine((f) => fechaValida(f) !== null, "Fecha inválida");

export const esquemaPromocion = z
  .object({
    nombre: textoRequerido(120, "Ponle un nombre, ej. 2x1 en Whey"),
    tipo: z.enum(["porcentaje", "monto_fijo", "combo"]),
    valor: z.string().trim().transform((s) => s.replace(",", ".")),
    comboLleva: z.coerce.number().int().nullable(),
    comboPaga: z.coerce.number().int().nullable(),
    alcance: z.enum(["todo", "producto", "categoria"]),
    productoId: idPositivo.nullable(),
    categoriaId: idPositivo.nullable(),
    sucursalId: idPositivo.nullable(),
    desde: fecha,
    hasta: fecha,
    requiereCupon: z.boolean(),
    activo: z.boolean(),
  })
  .superRefine((d, ctx) => {
    const error = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (d.tipo === "porcentaje") {
      if (!/^\d{1,3}(\.\d{1,2})?$/.test(d.valor) || Number(d.valor) <= 0 || Number(d.valor) > 100) error("valor", "Entre 0,01 y 100 %");
    } else if (d.tipo === "monto_fijo") {
      if (!/^\d{1,7}(\.\d{1,2})?$/.test(d.valor) || Number(d.valor) <= 0) error("valor", "Monto inválido");
    } else {
      if (!d.comboLleva || d.comboLleva < 2 || d.comboLleva > 20) error("comboLleva", "Entre 2 y 20");
      if (!d.comboPaga || d.comboPaga < 1 || (d.comboLleva && d.comboPaga >= d.comboLleva)) error("comboPaga", "Debe pagar menos de lo que lleva");
    }
    if (d.alcance === "producto" && !d.productoId) error("productoId", "Elige el producto");
    if (d.alcance === "categoria" && !d.categoriaId) error("categoriaId", "Elige la categoría");
    if (d.hasta < d.desde) error("hasta", "Debe ser igual o posterior a la fecha de inicio");
  })
  .transform((d) => ({
    ...d,
    valor: d.tipo === "combo" ? "0" : d.valor,
    comboLleva: d.tipo === "combo" ? d.comboLleva : null,
    comboPaga: d.tipo === "combo" ? d.comboPaga : null,
    productoId: d.alcance === "producto" ? d.productoId : null,
    categoriaId: d.alcance === "categoria" ? d.categoriaId : null,
  }));
export type DatosPromocion = z.input<typeof esquemaPromocion>;

/** Código de cupón: letras y números en mayúsculas (se normaliza). */
export const codigoCupon = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{3,40}$/, "De 3 a 40 letras, números o guiones, sin espacios");

export const esquemaCupon = z.object({
  promocionId: idPositivo,
  codigo: codigoCupon,
  usosMaximos: z.coerce.number().int().min(1, "Mínimo 1").max(1_000_000).nullable(),
});
export type DatosCupon = z.input<typeof esquemaCupon>;
