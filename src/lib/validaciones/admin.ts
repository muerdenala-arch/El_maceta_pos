/** Validaciones de la Fase 2 (sucursales, personal, catálogo, configuración): mismas en cliente y servidor. */
import { z } from "zod";
import { esquemaPin } from "./auth";
import { CLAVES_UNIDAD } from "@/lib/inventario/fraccion";
import { idPositivo, monto, telefono, textoOpcional, textoRequerido, urlImagen } from "./comunes";

export const TAMANOS_IMPRESION = ["58mm", "80mm", "carta"] as const;

export const esquemaSucursal = z.object({
  nombre: textoRequerido(120, "Ingresa el nombre"),
  direccion: textoOpcional(200),
  telefono,
  encargado: textoOpcional(120),
  tamanoImpresion: z.enum(TAMANOS_IMPRESION),
});
export type DatosSucursal = z.input<typeof esquemaSucursal>;

export const esquemaNombreUsuario = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,50}$/, "De 3 a 50 caracteres: letras, números, punto, guion o guion bajo, sin espacios");

const baseUsuario = z.object({
  nombre: textoRequerido(120, "Ingresa el nombre"),
  rol: z.enum(["admin", "cajero", "encargado"]),
  sucursalId: idPositivo.nullable(),
});

/** Un cajero o un encargado deben tener sucursal; un administrador no (ve todas). */
const reglaSucursal = <T extends { rol: string; sucursalId: number | null }>(d: T, ctx: z.RefinementCtx) => {
  if (d.rol !== "admin" && d.sucursalId === null) {
    ctx.addIssue({ code: "custom", path: ["sucursalId"], message: d.rol === "encargado" ? "Asigna una sucursal al encargado" : "Asigna una sucursal al cajero" });
  }
};

export const esquemaCrearUsuario = baseUsuario
  .extend({ usuario: esquemaNombreUsuario, pin: esquemaPin })
  .superRefine(reglaSucursal)
  .transform((d) => ({ ...d, sucursalId: d.rol === "admin" ? null : d.sucursalId }));
export type DatosCrearUsuario = z.input<typeof esquemaCrearUsuario>;

export const esquemaEditarUsuario = baseUsuario
  .extend({ id: idPositivo })
  .superRefine(reglaSucursal)
  .transform((d) => ({ ...d, sucursalId: d.rol === "admin" ? null : d.sucursalId }));
export type DatosEditarUsuario = z.input<typeof esquemaEditarUsuario>;

export const esquemaCategoria = z.object({ nombre: textoRequerido(80, "Ingresa el nombre") });

const vacioANulo = <T extends z.ZodType>(esquema: T) =>
  z
    .union([z.literal(""), z.null(), esquema])
    .optional()
    .transform((v) => (v === "" || v === null || v === undefined ? null : (v as z.output<T>)));

export const esquemaProducto = z
  .object({
  nombre: textoRequerido(160, "Ingresa el nombre del producto"),
  marca: textoOpcional(80),
  categoriaId: idPositivo.nullable(),
  sabor: textoOpcional(80),
  presentacion: textoOpcional(80),
  descripcion: textoOpcional(2000),
  precioVenta: monto("Precio de venta inválido"),
  precioCosto: monto("Precio de costo inválido"),
  codigoBarras: textoOpcional(64).refine(
    (c) => c === null || /^[0-9A-Za-z-]+$/.test(c),
    "Solo números, letras y guiones",
  ),
  stockMinimo: z.coerce
    .number({ message: "Número inválido" })
    .int("Debe ser un número entero")
    .min(0, "No puede ser negativo")
    .max(100000),
  fotoUrl: urlImagen,
  activo: z.boolean(),
  /** Venta fraccionada: envase completo o unidades sueltas (lib/inventario/fraccion.ts). */
  fraccionado: z.boolean().optional().default(false),
  unidadFraccion: vacioANulo(z.enum(CLAVES_UNIDAD, { message: "Elige la unidad" })),
  unidadesPorEnvase: vacioANulo(z.coerce.number({ message: "Número inválido" }).int("Debe ser un número entero").min(2, "Mínimo 2 por envase").max(10000, "Máximo 10.000")),
  precioUnidad: vacioANulo(monto("Precio inválido")),
  })
  .superRefine((d, ctx) => {
    if (!d.fraccionado) return;
    if (!d.unidadFraccion) ctx.addIssue({ code: "custom", path: ["unidadFraccion"], message: "Elige la unidad (cápsula, tableta, scoop o sobre)" });
    if (!d.unidadesPorEnvase) ctx.addIssue({ code: "custom", path: ["unidadesPorEnvase"], message: "Indica cuántas unidades trae el envase" });
    if (!d.precioUnidad || Number(d.precioUnidad) <= 0) ctx.addIssue({ code: "custom", path: ["precioUnidad"], message: "Ingresa el precio de la unidad suelta" });
  })
  // Si no es fraccionado, los datos de la fracción no se guardan.
  .transform((d) => (d.fraccionado ? d : { ...d, unidadFraccion: null, unidadesPorEnvase: null, precioUnidad: null }));
export type DatosProducto = z.input<typeof esquemaProducto>;

export const esquemaConfiguracion = z.object({
  nombreComercial: textoRequerido(120, "Ingresa el nombre comercial"),
  nit: textoOpcional(30),
  mensajeAgradecimiento: textoRequerido(300, "Escribe un mensaje"),
  plantillaWhatsapp: textoRequerido(500, "Escribe el mensaje de WhatsApp").refine(
    (t) => t.includes("{enlace}"),
    "Debe incluir {enlace} para poder enviar el comprobante",
  ),
  codigoPais: z.string().trim().regex(/^\d{1,4}$/, "Solo números, ej. 591"),
  logoUrl: urlImagen,
  /** Máximo descuento manual del cajero, en % (0 = no puede dar descuentos manuales). */
  descuentoManualMaximo: z
    .string()
    .trim()
    .optional()
    .default("0")
    .transform((s) => (s === "" ? "0" : s.replace(",", ".")))
    .refine((s) => /^\d{1,3}(\.\d{1,2})?$/.test(s) && Number(s) <= 100, "Entre 0 y 100 %"),
  /** Máximo que puede dar o autorizar el encargado de sucursal, en %. */
  descuentoManualMaximoEncargado: z
    .string()
    .trim()
    .optional()
    .default("0")
    .transform((s) => (s === "" ? "0" : s.replace(",", ".")))
    .refine((s) => /^\d{1,3}(\.\d{1,2})?$/.test(s) && Number(s) <= 100, "Entre 0 y 100 %"),
});
export type DatosConfiguracion = z.input<typeof esquemaConfiguracion>;
