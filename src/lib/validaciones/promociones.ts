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

const fechaOpcional = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((s) => (s ? s : null))
  .refine((s) => s === null || fechaValida(s) !== null, "Fecha inválida");
const ids = z.array(idPositivo).max(500).optional().default([]);

export const esquemaCupon = z
  .object({
    codigo: codigoCupon,
    descripcion: z.string().trim().max(160, "Máximo 160 caracteres").optional().default("").transform((s) => s || null),
    tipo: z.enum(["porcentaje", "monto"]),
    valor: z.string().trim().transform((s) => s.replace(",", ".")),
    /** Vacío = sin mínimo. */
    montoMinimo: z.string().trim().optional().default("").transform((s) => (s === "" ? "0" : s.replace(",", "."))),
    fechaInicio: fechaOpcional,
    fechaFin: fechaOpcional,
    /** Vacío = sin límite. */
    usosMaximos: z
      .union([z.literal(""), z.null(), z.coerce.number({ message: "Número inválido" }).int("Debe ser un número entero").min(1, "Mínimo 1").max(1_000_000)])
      .optional()
      .transform((v) => (v === "" || v === null || v === undefined ? null : v)),
    alcance: z.enum(["todo", "productos", "categorias"]),
    productoIds: ids,
    categoriaIds: ids,
    /** Vacío = todas las sucursales. */
    sucursalIds: ids,
    acumulaPromociones: z.boolean(),
    acumulaCombos: z.boolean(),
    activo: z.boolean(),
  })
  .superRefine((d, ctx) => {
    const error = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (d.tipo === "porcentaje") {
      if (!/^\d{1,3}(\.\d{1,2})?$/.test(d.valor) || Number(d.valor) <= 0 || Number(d.valor) > 100) error("valor", "Entre 0,01 y 100 %");
    } else if (!/^\d{1,7}(\.\d{1,2})?$/.test(d.valor) || Number(d.valor) <= 0) error("valor", "Monto inválido");
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(d.montoMinimo)) error("montoMinimo", "Monto inválido");
    if (d.alcance === "productos" && d.productoIds.length === 0) error("productoIds", "Elige al menos un producto");
    if (d.alcance === "categorias" && d.categoriaIds.length === 0) error("categoriaIds", "Elige al menos una categoría");
    if (d.fechaInicio && d.fechaFin && d.fechaFin < d.fechaInicio) error("fechaFin", "Debe ser igual o posterior a la fecha de inicio");
  })
  .transform((d) => ({
    ...d,
    productoIds: d.alcance === "productos" ? [...new Set(d.productoIds)] : [],
    categoriaIds: d.alcance === "categorias" ? [...new Set(d.categoriaIds)] : [],
    sucursalIds: [...new Set(d.sucursalIds)],
  }));
export type DatosCupon = z.input<typeof esquemaCupon>;
