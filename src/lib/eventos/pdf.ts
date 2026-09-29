/**
 * PDF público de resultados del reto, generado en el dispositivo (como el comprobante) para descargarlo
 * o compartirlo por WhatsApp. Solo nombre, kilos y porcentaje perdido: nunca cédula ni teléfono.
 * Se carga bajo demanda (import dinámico) para no sumar jsPDF a las pantallas que no lo usan.
 * Las fuentes estándar del PDF no tienen "−" ni "–": se usa "-".
 */
import { jsPDF } from "jspdf";
import { textoKilos, textoPorcentaje, type FilaPosicion } from "./calculos";

export type DatosPdfResultados = {
  negocio: { nombre: string; logoUrl: string | null; nit: string | null };
  evento: { nombre: string; fechaInicio: string; fechaFin: string; criterioGanador: "porcentaje" | "kilos"; finalizado: boolean; premios: string | null };
  filas: FilaPosicion[];
};

const fecha = (f: string) => f.split("-").reverse().join("/");
const sinSignos = (t: string) => t.replace(/−/g, "-").replace(/–/g, "-");

/** Logo como JPEG sobre fondo blanco (jsPDF no lee WebP). Si falla, el PDF sale sin logo. */
async function logoJpeg(url: string) {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    const escala = Math.min(1, 240 / Math.max(img.naturalWidth, img.naturalHeight));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(img.naturalWidth * escala);
    lienzo.height = Math.round(img.naturalHeight * escala);
    const ctx = lienzo.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    return { dataUrl: lienzo.toDataURL("image/jpeg", 0.85), ancho: lienzo.width, alto: lienzo.height };
  } catch {
    return null;
  }
}

export async function generarPdfResultados(d: DatosPdfResultados): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const m = 16;
  let y = m;

  const logo = d.negocio.logoUrl ? await logoJpeg(d.negocio.logoUrl) : null;
  if (logo) {
    const h = 18;
    doc.addImage(logo.dataUrl, "JPEG", m, y, (logo.ancho / logo.alto) * h, h);
  }
  const xTexto = logo ? m + 24 : m;
  doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(20).text(d.negocio.nombre, xTexto, y + 7);
  if (d.negocio.nit) doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(100).text(`NIT ${d.negocio.nit}`, xTexto, y + 13);
  y += 28;

  doc.setFillColor(234, 108, 30).rect(m, y - 6, ancho - 2 * m, 0.8, "F");
  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(20).text(d.evento.finalizado ? "Resultados finales" : "Posiciones parciales", m, y + 4);
  y += 11;
  doc.setFont("helvetica", "bold").setFontSize(12).text(d.evento.nombre, m, y);
  y += 6;
  doc
    .setFont("helvetica", "normal")
    .setFontSize(9.5)
    .setTextColor(90)
    .text(
      `Del ${fecha(d.evento.fechaInicio)} al ${fecha(d.evento.fechaFin)} · Gana por ${d.evento.criterioGanador === "porcentaje" ? "porcentaje de peso perdido" : "kilos perdidos"}`,
      m,
      y,
    );
  y += 5;
  if (d.evento.premios) {
    for (const linea of doc.splitTextToSize(`Premios: ${d.evento.premios}`, ancho - 2 * m) as string[]) {
      doc.text(sinSignos(linea), m, y);
      y += 4.5;
    }
  }
  y += 5;

  // Podio
  const podio = d.filas.filter((f) => f.posicion !== null && f.posicion <= 3);
  const colores: Record<number, [number, number, number]> = { 1: [240, 196, 80], 2: [205, 208, 214], 3: [214, 150, 100] };
  const anchoFicha = (ancho - 2 * m - 8) / 3;
  podio.forEach((f, i) => {
    const x = m + i * (anchoFicha + 4);
    doc.setFillColor(...colores[f.posicion!]).roundedRect(x, y, anchoFicha, 24, 3, 3, "F");
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(40).text(`${f.posicion}.º lugar`, x + 4, y + 6);
    doc.setFontSize(11).text(doc.splitTextToSize(f.nombre, anchoFicha - 8)[0] as string, x + 4, y + 12.5);
    doc
      .setFont("helvetica", "normal")
      .setFontSize(9)
      .text(sinSignos(`${textoKilos(f.kilos!)} · ${textoPorcentaje(f.porcentaje!)}`), x + 4, y + 19);
  });
  if (podio.length) y += 32;

  // Tabla: posición, nombre, kilos y porcentaje (nada más).
  const cols = [
    { t: "#", x: m + 2, a: "left" as const },
    { t: "Participante", x: m + 14, a: "left" as const },
    { t: "Kilos perdidos", x: ancho - m - 42, a: "right" as const },
    { t: "% perdido", x: ancho - m - 2, a: "right" as const },
  ];
  const cabecera = () => {
    doc.setFillColor(40, 36, 32).rect(m, y, ancho - 2 * m, 7, "F");
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(255);
    cols.forEach((c) => doc.text(c.t, c.x, y + 4.8, { align: c.a }));
    y += 7;
  };
  cabecera();
  d.filas.forEach((f, i) => {
    if (y > alto - m - 10) {
      doc.addPage();
      y = m;
      cabecera();
    }
    if (i % 2) doc.setFillColor(247, 244, 240).rect(m, y, ancho - 2 * m, 6.5, "F");
    doc.setFont("helvetica", f.posicion && f.posicion <= 3 ? "bold" : "normal").setFontSize(9.5).setTextColor(f.posicion === null ? 140 : 30);
    doc.text(f.posicion === null ? "-" : String(f.posicion), cols[0].x, y + 4.5);
    doc.text(doc.splitTextToSize(f.nombre, ancho - 2 * m - 70)[0] as string, cols[1].x, y + 4.5);
    if (f.kilos === null) {
      doc.text(f.estado === "no_completo" ? "No completó" : "Sin pesaje", cols[3].x, y + 4.5, { align: "right" });
    } else {
      doc.text(sinSignos(textoKilos(f.kilos)), cols[2].x, y + 4.5, { align: "right" });
      doc.text(sinSignos(textoPorcentaje(f.porcentaje!)), cols[3].x, y + 4.5, { align: "right" });
    }
    y += 6.5;
  });

  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(140);
    doc.text(`${d.negocio.nombre} · ${d.evento.nombre}`, m, alto - 8);
    doc.text(`Página ${p} de ${paginas}`, ancho - m, alto - 8, { align: "right" });
  }
  return doc.output("blob");
}

export const nombreArchivoResultados = (evento: string) =>
  `resultados-${evento.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`;

// ---------------------------------------------------------------- Torneo de Pulseada

export type DatosPdfTorneo = {
  negocio: { nombre: string; logoUrl: string | null; nit: string | null };
  evento: { nombre: string; fecha: string; formato: string; mejorDe: number; finalizado: boolean; premios: string | null; conPuntos: boolean };
  /** Solo nombre y resultados deportivos (nunca cédula ni teléfono). */
  filas: { posicion: number | null; nombre: string; victorias: number; derrotas: number; asaltosFavor: number; asaltosContra: number; puntos: number }[];
};

/** PDF de la clasificación del torneo: logo y datos de la tienda, podio y tabla (V, D, asaltos, puntos). */
export async function generarPdfTorneo(d: DatosPdfTorneo): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const m = 16;
  let y = m;

  const logo = d.negocio.logoUrl ? await logoJpeg(d.negocio.logoUrl) : null;
  if (logo) doc.addImage(logo.dataUrl, "JPEG", m, y, (logo.ancho / logo.alto) * 18, 18);
  const xTexto = logo ? m + 24 : m;
  doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(20).text(d.negocio.nombre, xTexto, y + 7);
  if (d.negocio.nit) doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(100).text(`NIT ${d.negocio.nit}`, xTexto, y + 13);
  y += 28;
  doc.setFillColor(234, 108, 30).rect(m, y - 6, ancho - 2 * m, 0.8, "F");
  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(20).text(d.evento.finalizado ? "Resultados finales" : "Clasificación parcial", m, y + 4);
  y += 11;
  doc.setFont("helvetica", "bold").setFontSize(12).text(d.evento.nombre, m, y);
  y += 6;
  doc
    .setFont("helvetica", "normal")
    .setFontSize(9.5)
    .setTextColor(90)
    .text(`Torneo de pulseada · ${fecha(d.evento.fecha)} · ${d.evento.formato} · combates al mejor de ${d.evento.mejorDe}`, m, y);
  y += 5;
  if (d.evento.premios) {
    for (const linea of doc.splitTextToSize(`Premios: ${d.evento.premios}`, ancho - 2 * m) as string[]) {
      doc.text(sinSignos(linea), m, y);
      y += 4.5;
    }
  }
  y += 5;

  const podio = d.filas.filter((f) => f.posicion !== null && f.posicion <= 3);
  const colores: Record<number, [number, number, number]> = { 1: [240, 196, 80], 2: [205, 208, 214], 3: [214, 150, 100] };
  const anchoFicha = (ancho - 2 * m - 8) / 3;
  podio.slice(0, 3).forEach((f, i) => {
    const x = m + i * (anchoFicha + 4);
    doc.setFillColor(...colores[f.posicion!]).roundedRect(x, y, anchoFicha, 22, 3, 3, "F");
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(40).text(`${f.posicion}.º lugar`, x + 4, y + 6);
    doc.setFontSize(11).text(doc.splitTextToSize(f.nombre, anchoFicha - 8)[0] as string, x + 4, y + 12.5);
    doc.setFont("helvetica", "normal").setFontSize(9).text(`${f.victorias} victoria${f.victorias === 1 ? "" : "s"} · ${f.derrotas} derrota${f.derrotas === 1 ? "" : "s"}`, x + 4, y + 18);
  });
  if (podio.length) y += 30;

  const cols = [
    { t: "#", x: m + 2, a: "left" as const },
    { t: "Competidor", x: m + 14, a: "left" as const },
    { t: "V", x: ancho - m - 62, a: "right" as const },
    { t: "D", x: ancho - m - 48, a: "right" as const },
    { t: "Asaltos", x: ancho - m - (d.evento.conPuntos ? 20 : 2), a: "right" as const },
    ...(d.evento.conPuntos ? [{ t: "Pts", x: ancho - m - 2, a: "right" as const }] : []),
  ];
  const cabecera = () => {
    doc.setFillColor(40, 36, 32).rect(m, y, ancho - 2 * m, 7, "F");
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(255);
    cols.forEach((c) => doc.text(c.t, c.x, y + 4.8, { align: c.a }));
    y += 7;
  };
  cabecera();
  d.filas.forEach((f, i) => {
    if (y > alto - m - 10) {
      doc.addPage();
      y = m;
      cabecera();
    }
    if (i % 2) doc.setFillColor(247, 244, 240).rect(m, y, ancho - 2 * m, 6.5, "F");
    doc.setFont("helvetica", f.posicion && f.posicion <= 3 ? "bold" : "normal").setFontSize(9.5).setTextColor(30);
    const valores = [f.posicion === null ? "-" : String(f.posicion), doc.splitTextToSize(f.nombre, ancho - 2 * m - 90)[0] as string, String(f.victorias), String(f.derrotas), `${f.asaltosFavor}-${f.asaltosContra}`, String(f.puntos)];
    cols.forEach((c, k) => doc.text(valores[k], c.x, y + 4.5, { align: c.a }));
    y += 6.5;
  });

  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(140);
    doc.text(`${d.negocio.nombre} · ${d.evento.nombre}`, m, alto - 8);
    doc.text(`Página ${p} de ${paginas}`, ancho - m, alto - 8, { align: "right" });
  }
  return doc.output("blob");
}
