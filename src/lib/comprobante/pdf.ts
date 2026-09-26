/**
 * PDF del comprobante generado en el dispositivo con jsPDF (funciona sin internet).
 * jsPDF se carga recién al usarlo, para no pesar en el punto de venta.
 * Nota: las fuentes estándar del PDF no tienen el signo "−" (U+2212): se usa "-".
 */
import type { jsPDF as JsPdf } from "jspdf";
import { formatoBs } from "@/lib/formato";
import { fechaHoraComprobante, numeroComprobante, type DatosComprobante, type TamanoImpresion } from "./datos";

type Imagen = { dataUrl: string; ancho: number; alto: number };

/** Carga el logo como JPEG (en escala de grises para la térmica). Si falla, el PDF sale sin logo. */
async function cargarImagen(url: string, grises: boolean): Promise<Imagen | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    const lado = 300;
    const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(img.naturalWidth * escala);
    lienzo.height = Math.round(img.naturalHeight * escala);
    const ctx = lienzo.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    if (grises) ctx.filter = "grayscale(1)";
    ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    // JPEG sobre fondo blanco: el PDF queda liviano para enviarlo por WhatsApp.
    return { dataUrl: lienzo.toDataURL("image/jpeg", 0.85), ancho: lienzo.width, alto: lienzo.height };
  } catch {
    return null;
  }
}

const bs = (monto: string) => formatoBs(monto);
const recortar = (texto: string, max: number) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto);
const menos = (monto: string) => `-${formatoBs(monto)}`;
const pago = (d: DatosComprobante) =>
  d.venta.metodoPago === "efectivo" ? "Efectivo" : d.venta.estadoPago === "qr_por_confirmar" ? "QR (por confirmar)" : "QR";

// ---------------------------------------------------------------- Térmica (58 / 80 mm)

function dibujarTermica(doc: JsPdf, d: DatosComprobante, ancho: number, logo: Imagen | null): number {
  const m = ancho === 58 ? 3 : 4;
  const derecha = ancho - m;
  const util = ancho - 2 * m;
  const base = ancho === 58 ? 7.5 : 9;
  let y = m + 2;
  const salto = (pt: number) => pt * 0.3528 * 1.3;

  const centro = (texto: string, pt = base, negrita = false) => {
    doc.setFont("helvetica", negrita ? "bold" : "normal").setFontSize(pt);
    for (const linea of doc.splitTextToSize(texto, util) as string[]) {
      doc.text(linea, ancho / 2, y, { align: "center" });
      y += salto(pt);
    }
  };
  const izquierda = (texto: string, pt = base, negrita = false) => {
    doc.setFont("helvetica", negrita ? "bold" : "normal").setFontSize(pt);
    for (const linea of doc.splitTextToSize(texto, util) as string[]) {
      doc.text(linea, m, y);
      y += salto(pt);
    }
  };
  const fila = (a: string, b: string, pt = base, negrita = false) => {
    doc.setFont("helvetica", negrita ? "bold" : "normal").setFontSize(pt);
    doc.text(a, m, y);
    doc.text(b, derecha, y, { align: "right" });
    y += salto(pt);
  };
  const separador = () => {
    y += 0.8;
    doc.setLineDashPattern([0.8, 0.8], 0).setLineWidth(0.2).line(m, y, derecha, y);
    y += 3;
  };

  if (logo) {
    const lado = ancho === 58 ? 14 : 18;
    const alto = (lado * logo.alto) / logo.ancho;
    doc.addImage(logo.dataUrl, "JPEG", (ancho - lado) / 2, y - 2, lado, alto);
    y += alto + 1.5;
  }
  centro(d.negocio.nombre.toUpperCase(), base + 3, true);
  if (d.negocio.nit) centro(`NIT ${d.negocio.nit}`);
  centro(d.sucursal.nombre);
  if (d.sucursal.direccion) centro(d.sucursal.direccion);
  if (d.sucursal.telefono) centro(`Tel. ${d.sucursal.telefono}`);
  y += 1;
  centro("NOTA DE VENTA", base, true);
  centro(`N.º ${numeroComprobante(d.venta.numero)}`, base, true);
  centro(fechaHoraComprobante(d.venta.fecha));
  if (d.venta.anulada) centro("*** VENTA ANULADA ***", base + 1, true);

  separador();
  izquierda(`Cajero: ${d.venta.cajero}`);
  if (d.venta.cliente?.nombre) izquierda(`Cliente: ${d.venta.cliente.nombre}`);
  if (d.venta.cliente?.telefono) izquierda(`Cel.: ${d.venta.cliente.telefono}`);
  separador();

  for (const l of d.venta.lineas) {
    izquierda(l.nombre, base, true);
    if (l.detalle) izquierda(l.detalle, base - 1);
    fila(`${l.cantidad} x ${bs(l.precioUnitario)}`, bs(l.subtotal));
    if (Number(l.descuento) > 0) fila(recortar(l.promocion ?? "Descuento", ancho === 58 ? 22 : 30), menos(l.descuento));
    y += 0.8;
  }
  separador();

  if (Number(d.venta.descuento) > 0) {
    fila("Subtotal", bs(d.venta.subtotal));
    fila("Descuentos", menos(d.venta.descuento));
    if (d.venta.cupon) fila("Cupón", d.venta.cupon);
  }
  y += 1.5; // aire antes del total, que va en letra más grande
  fila("TOTAL", bs(d.venta.total), base + 3, true);
  fila("Pago", pago(d));
  if (d.venta.metodoPago === "efectivo" && d.venta.montoRecibido) {
    fila("Recibido", bs(d.venta.montoRecibido));
    fila("Cambio", bs(d.venta.cambio ?? "0"));
  }
  separador();
  centro(d.negocio.mensajeAgradecimiento, base, true);
  centro("Documento no válido como factura fiscal", base - 1.5);
  return y;
}

// ---------------------------------------------------------------- Carta

function dibujarCarta(doc: JsPdf, d: DatosComprobante, logo: Imagen | null) {
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const m = 18;
  const derecha = ancho - m;
  let y = m;

  let xTexto = m;
  if (logo) {
    const lado = 22;
    doc.addImage(logo.dataUrl, "JPEG", m, y, lado, (lado * logo.alto) / logo.ancho);
    xTexto = m + lado + 5;
  }
  doc.setFont("helvetica", "bold").setFontSize(18).text(d.negocio.nombre.toUpperCase(), xTexto, y + 7);
  doc.setFont("helvetica", "normal").setFontSize(10);
  const datosNegocio = [d.negocio.nit && `NIT ${d.negocio.nit}`, d.sucursal.nombre, d.sucursal.direccion, d.sucursal.telefono && `Tel. ${d.sucursal.telefono}`].filter(Boolean) as string[];
  datosNegocio.forEach((t, i) => doc.text(t, xTexto, y + 13 + i * 4.5));

  doc.setFont("helvetica", "bold").setFontSize(13).text("NOTA DE VENTA", derecha, y + 7, { align: "right" });
  doc.setFontSize(11).text(`N.º ${numeroComprobante(d.venta.numero)}`, derecha, y + 13, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(10).text(fechaHoraComprobante(d.venta.fecha), derecha, y + 18.5, { align: "right" });
  y += Math.max(28, 13 + datosNegocio.length * 4.5 + 4);

  if (d.venta.anulada) {
    doc.setFont("helvetica", "bold").setFontSize(14).text("*** VENTA ANULADA ***", ancho / 2, y, { align: "center" });
    y += 8;
  }

  doc.setDrawColor(200).setLineWidth(0.3).line(m, y, derecha, y);
  y += 6;
  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text(`Cajero: ${d.venta.cajero}`, m, y);
  if (d.venta.cliente) {
    doc.text([d.venta.cliente.nombre && `Cliente: ${d.venta.cliente.nombre}`, d.venta.cliente.telefono && `Cel.: ${d.venta.cliente.telefono}`].filter(Boolean).join("   "), ancho / 2, y);
  }
  y += 8;

  const col = { cant: derecha - 70, unit: derecha - 32, sub: derecha };
  const encabezado = () => {
    doc.setFont("helvetica", "bold").setFontSize(10).setDrawColor(0);
    doc.text("Producto", m, y);
    doc.text("Cant.", col.cant, y, { align: "right" });
    doc.text("P. unit.", col.unit, y, { align: "right" });
    doc.text("Subtotal", col.sub, y, { align: "right" });
    y += 2;
    doc.line(m, y, derecha, y);
    y += 5;
  };
  encabezado();

  for (const l of d.venta.lineas) {
    doc.setFont("helvetica", "bold").setFontSize(10);
    const nombre = doc.splitTextToSize(l.nombre, col.cant - m - 18) as string[];
    doc.setFont("helvetica", "normal").setFontSize(8.5);
    const detalle = l.detalle ? (doc.splitTextToSize(l.detalle, col.cant - m - 18) as string[]) : [];
    const altoFila = nombre.length * 4.5 + detalle.length * 3.8 + 2;
    if (y + altoFila > alto - 60) {
      doc.addPage();
      y = m;
      encabezado();
    }
    doc.setFont("helvetica", "bold").setFontSize(10).text(nombre, m, y);
    doc.setFont("helvetica", "normal").text(String(l.cantidad), col.cant, y, { align: "right" });
    doc.text(bs(l.precioUnitario), col.unit, y, { align: "right" });
    doc.text(bs(l.subtotal), col.sub, y, { align: "right" });
    if (Number(l.descuento) > 0) doc.setFontSize(8.5).text(`${recortar(l.promocion ?? "Desc.", 28)} ${menos(l.descuento)}`, col.sub, y + 4, { align: "right" }).setFontSize(10);
    if (detalle.length) doc.setFontSize(8.5).setTextColor(100).text(detalle, m, y + nombre.length * 4.5).setTextColor(0);
    y += altoFila;
    doc.setDrawColor(220).line(m, y - 1.5, derecha, y - 1.5);
    y += 3;
  }

  y += 3;
  const totales: [string, string, boolean?][] = [];
  if (Number(d.venta.descuento) > 0) totales.push(["Subtotal", bs(d.venta.subtotal)], ["Descuentos", menos(d.venta.descuento)]);
  if (d.venta.cupon) totales.push(["Cupón", d.venta.cupon]);
  totales.push(["TOTAL", bs(d.venta.total), true], ["Pago", pago(d)]);
  if (d.venta.metodoPago === "efectivo" && d.venta.montoRecibido) totales.push(["Recibido", bs(d.venta.montoRecibido)], ["Cambio", bs(d.venta.cambio ?? "0")]);
  for (const [a, b, fuerte] of totales) {
    doc.setFont("helvetica", fuerte ? "bold" : "normal").setFontSize(fuerte ? 14 : 10);
    doc.text(a, derecha - 70, y);
    doc.text(b, derecha, y, { align: "right" });
    y += fuerte ? 7 : 5.5;
  }

  y += 8;
  doc.setFont("helvetica", "bold").setFontSize(11).text(d.negocio.mensajeAgradecimiento, ancho / 2, y, { align: "center" });
  doc.setFont("helvetica", "normal").setFontSize(8).text("Documento no válido como factura fiscal", ancho / 2, y + 5, { align: "center" });
}

export async function generarPdf(d: DatosComprobante, tamano: TamanoImpresion): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const logo = d.negocio.logoUrl ? await cargarImagen(d.negocio.logoUrl, tamano !== "carta") : null;

  if (tamano === "carta") {
    const doc = new jsPDF({ unit: "mm", format: "letter", compress: true });
    dibujarCarta(doc, d, logo);
    return doc.output("blob");
  }

  // Rollo continuo: se mide el alto en un documento largo y se genera el definitivo a medida.
  const ancho = tamano === "58mm" ? 58 : 80;
  const alto = dibujarTermica(new jsPDF({ unit: "mm", format: [ancho, 3000] }), d, ancho, logo) + 6;
  const doc = new jsPDF({ unit: "mm", format: [ancho, Math.max(alto, ancho + 1)], compress: true });
  dibujarTermica(doc, d, ancho, logo);
  return doc.output("blob");
}
