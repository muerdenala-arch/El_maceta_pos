/** Validaciones de la Fase 2 (sucursales, personal, catálogo, configuración): mismas en cliente y servidor. */
import { z } from "zod";
import { esquemaPin } from "./auth";
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
  rol: z.enum(["admin", "cajero"]),
  sucursalId: idPositivo.nullable(),
});

/** Un cajero debe tener sucursal; un administrador no (ve todas). */
const reglaSucursal = <T extends { rol: string; sucursalId: number | null }>(d: T, ctx: z.RefinementCtx) => {
  if (d.rol === "cajero" && d.sucursalId === null) {
    ctx.addIssue({ code: "custom", path: ["sucursalId"], message: "Asigna una sucursal al cajero" });
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

export const esquemaProducto = z.object({
  nombre: textoRequerido(160, "Ingresa el nombre del producto"),
  marca: textoOpcional(80),
  categoriaId: idPositivo.nullable(),
  sabor: textoOpcional(80),
  presentacion: textoOpcional(80),
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
});
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
});
export type DatosConfiguracion = z.input<typeof esquemaConfiguracion>;
