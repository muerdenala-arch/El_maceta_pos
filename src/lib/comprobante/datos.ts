/**
 * Datos de un comprobante de venta (nota de venta, no factura fiscal) y utilidades puras
 * para armar el mensaje de WhatsApp. Probado en datos.test.ts.
 */
import { formatoBs } from "@/lib/formato";
import { textoCantidadVendida } from "@/lib/inventario/fraccion";

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
      /** Unidad suelta vendida (capsula, sobre…); nulo o ausente = envase completo / producto normal. */
      unidad?: string | null;
      precioUnitario: string;
      descuento: string;
      /** Precio × cantidad, antes del descuento de la línea. */
      subtotal: string;
      /** Nombre de la promoción aplicada a la línea. */
      promocion: string | null;
    }[];
    /** Combos vendidos: precio normal (bruto), descuento del combo y el detalle de sus productos. */
    combos?: {
      nombre: string;
      cantidad: number;
      /** Precio normal de un combo (suma de sus productos). */
      precioNormal: string;
      /** Precio normal × cantidad. */
      subtotal: string;
      /** Descuento total del combo en esta venta. */
      descuento: string;
      productos: { nombre: string; cantidad: number; unidad?: string | null }[];
    }[];
    subtotal: string;
    descuento: string;
    /** Desglose de `descuento` (las ventas guardadas antes de que existiera no lo traen). */
    descuentos?: { promociones: string; combos: string; cupon: string; manual: string; porcentajeManual: string | null };
    total: string;
    metodoPago: "efectivo" | "qr";
    estadoPago: "pagado" | "qr_por_confirmar";
    montoRecibido: string | null;
    cambio: string | null;
    /** Código del cupón usado, si hubo. */
    cupon: string | null;
    anulada: boolean;
    tokenPublico: string;
    /** Venta hecha sin conexión y todavía no sincronizada: aún no tiene número ni enlace. */
    provisional?: boolean;
    /** Código corto para identificar la venta provisional (inicio del UUID). */
    codigoLocal?: string;
  };
};

/** Filas de descuento del pie del comprobante: ["Promociones", "59.00"], ["Cupón DIEZ", "24.00"], ["Descuento (5 %)", "12.00"]. */
export function filasDescuento(venta: Pick<DatosComprobante["venta"], "descuento" | "descuentos" | "cupon">): [string, string][] {
  const d = venta.descuentos;
  if (!d) return Number(venta.descuento) > 0 ? [["Descuentos", venta.descuento]] : [];
  const porcentaje = d.porcentajeManual ? ` (${Number(d.porcentajeManual).toLocaleString("es-BO")} %)` : "";
  const filas: [string, string][] = [
    ["Promociones", d.promociones],
    ["Combos", d.combos],
    [venta.cupon ? `Cupón ${venta.cupon}` : "Cupón", d.cupon],
    [`Descuento${porcentaje}`, d.manual],
  ];
  return filas.filter(([, monto]) => Number(monto) > 0);
}

/** Cantidad de una línea como se imprime: "2" (envases) o "30 cápsulas" (unidades sueltas). */
export const cantidadLinea = (l: { cantidad: number; unidad?: string | null }) => textoCantidadVendida(l.cantidad, l.unidad ?? null);

/**
 * Lo que se imprime en el cuerpo del comprobante: los productos sueltos y, después, cada combo como una línea más
 * (su nombre, el detalle de sus productos, su precio normal y el descuento del combo debajo).
 */
export function lineasImprimibles(venta: Pick<DatosComprobante["venta"], "lineas" | "combos">): DatosComprobante["venta"]["lineas"] {
  return [
    ...venta.lineas,
    ...(venta.combos ?? []).map((c) => ({
      // Sin repetir la palabra si el nombre ya la trae ("Combo Volumen").
      nombre: /^combo/i.test(c.nombre.trim()) ? c.nombre : `Combo ${c.nombre}`,
      detalle: c.productos.map((p) => `${cantidadLinea(p)} ${p.nombre}`).join(" + "),
      cantidad: c.cantidad,
      unidad: null,
      precioUnitario: c.precioNormal,
      descuento: c.descuento,
      subtotal: c.subtotal,
      promocion: Number(c.descuento) > 0 ? "Descuento del combo" : null,
    })),
  ];
}

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
  `comprobante-${datos.negocio.nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${
    datos.venta.provisional ? `provisional-${datos.venta.codigoLocal}` : numeroComprobante(datos.venta.numero)
  }.pdf`;
