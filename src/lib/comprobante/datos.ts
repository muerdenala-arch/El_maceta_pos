/**
 * Datos de un comprobante de venta (nota de venta, no factura fiscal) y utilidades puras
 * para armar el mensaje de WhatsApp. Probado en datos.test.ts.
 */
import { formatoBs } from "@/lib/formato";

export type TamanoImpresion = "58mm" | "80mm" | "carta";

export type DatosComprobante = {
  negocio: {
    nombre: string;
    nit: string | null;
    logoUrl: string | null;
    mensajeAgradecimiento: string;
    plantillaWhatsapp: string;
    codigoPais: string;
  };
  sucursal: {
    nombre: string;
    direccion: string | null;
    telefono: string | null;
    tamanoImpresion: TamanoImpresion;
  };
  venta: {
    id: number;
    numero: number;
    /** ISO */
    fecha: string;
    cajero: string;
    cliente: { nombre: string | null; telefono: string | null } | null;
    lineas: {
      nombre: string;
      detalle: string | null;
      cantidad: number;
      precioUnitario: string;
      descuento: string;
      subtotal: string;
    }[];
    subtotal: string;
    descuento: string;
    total: string;
    metodoPago: "efectivo" | "qr";
    estadoPago: "pagado" | "qr_por_confirmar";
    montoRecibido: string | null;
    cambio: string | null;
    anulada: boolean;
    tokenPublico: string;
  };
};

/** "Comprobante N.º 000123" */
export const numeroComprobante = (n: number) => String(n).padStart(6, "0");

/** Fecha y hora de la venta en Bolivia: "26/09/2026 14:05". */
export function fechaHoraComprobante(iso: string) {
  const f = new Date(iso);
  const fecha = f.toLocaleDateString("es-BO", { timeZone: "America/La_Paz", day: "2-digit", month: "2-digit", year: "numeric" });
  const hora = f.toLocaleTimeString("es-BO", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `${fecha} ${hora}`;
}

/**
 * Número para wa.me: solo dígitos y con código de país (591 71234567 → 59171234567).
 * Devuelve null si no parece un celular válido.
 */
export function telefonoWhatsapp(telefono: string, codigoPais: string): string | null {
  let d = telefono.replace(/\D/g, "").replace(/^0+/, "");
  if (!d.startsWith(codigoPais)) d = codigoPais + d;
  const local = d.slice(codigoPais.length);
  return local.length >= 7 && local.length <= 12 ? d : null;
}

/** Reemplaza {cliente}, {negocio}, {total} y {enlace} en la plantilla configurada. */
export function mensajeWhatsapp(datos: DatosComprobante, enlace: string) {
  const cliente = datos.venta.cliente?.nombre?.split(" ")[0] ?? "";
  return datos.negocio.plantillaWhatsapp
    .replaceAll("{cliente}", cliente)
    .replaceAll("{negocio}", datos.negocio.nombre)
    .replaceAll("{total}", formatoBs(datos.venta.total))
    .replaceAll("{enlace}", enlace)
    .replace(/\s+,/g, ",") // "Hola , aquí…" cuando no hay nombre
    .replace(/ {2,}/g, " ")
    .trim();
}

export function enlaceWhatsapp(numero: string, mensaje: string) {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

/** Nombre del archivo PDF. */
export const nombreArchivo = (datos: DatosComprobante) =>
  `comprobante-${datos.negocio.nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${numeroComprobante(datos.venta.numero)}.pdf`;
