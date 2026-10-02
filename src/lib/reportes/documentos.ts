import "server-only";
/**
 * Archivos de exportación de los reportes (sección 4.2 del plan: Excel y PDF), generados en el servidor.
 * Excel con SheetJS (montos como números con formato, para poder sumar y filtrar en la planilla);
 * PDF con jsPDF (fuentes estándar: sin "−" ni "–", se usa "-").
 */
import { jsPDF, type jsPDF as JsPdf } from "jspdf";
import * as XLSX from "xlsx";
import { deCentavos, aCentavos } from "@/lib/dinero";
import { formatoBs, ZONA_HORARIA } from "@/lib/formato";
import type { ResumenGastos, GastoListado } from "./gastos";
import type { LineaExportada, ResumenVentas, VentaListada, VentasCajero, VentasDia, VentasProducto } from "./ventas";
import { nombreUnidad } from "@/lib/inventario/fraccion";

/** Pares "Filtro: valor" que encabezan cada archivo. */
export type Descripcion = [string, string][];

export type DatosVentas = {
  resumen: ResumenVentas;
  ventas: VentaListada[];
  lineas: LineaExportada[];
  productos: VentasProducto[];
  dias: VentasDia[];
  cajeros: VentasCajero[];
  truncado: boolean;
};

export type DatosGastos = { resumen: ResumenGastos; gastos: GastoListado[]; truncado: boolean };

const fecha = (d: Date | string) => new Date(d).toLocaleDateString("es-BO", { timeZone: ZONA_HORARIA, day: "2-digit", month: "2-digit", year: "numeric" });
const hora = (d: Date | string) => new Date(d).toLocaleTimeString("es-BO", { timeZone: ZONA_HORARIA, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dia = (d: string) => d.split("-").reverse().join("/");
const n = (monto: string) => Number(monto);
const ganancia = (r: ResumenVentas) => deCentavos(aCentavos(r.ventaLineas) - aCentavos(r.costo));
const metodo = (v: VentaListada) => (v.metodoPago === "qr" ? (v.estadoPago === "qr_por_confirmar" ? "QR (por confirmar)" : "QR") : "Efectivo");

// ------------------------------------------------------------------------------------------ Excel

const FORMATO_BS = '#,##0.00';

/** Hoja desde filas; `montos` = índices de columnas con importes (formato 1.234,50 según la configuración regional). */
function hoja(filas: (string | number | null)[][], anchos: number[], montos: number[] = [], desdeFila = 1) {
  const ws = XLSX.utils.aoa_to_sheet(filas);
  ws["!cols"] = anchos.map((wch) => ({ wch }));
  for (let r = desdeFila; r < filas.length; r++) {
    for (const c of montos) {
      const celda = ws[XLSX.utils.encode_cell({ r, c })];
      if (celda && celda.t === "n") celda.z = FORMATO_BS;
    }
  }
  return ws;
}

function libro(hojas: [string, XLSX.WorkSheet][]) {
  const wb = XLSX.utils.book_new();
  for (const [nombre, ws] of hojas) XLSX.utils.book_append_sheet(wb, ws, nombre);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true }) as Buffer;
}

/** Totales: [etiqueta, valor, esMonto]. */
type Total = [string, number, boolean?];

function hojaResumen(titulo: string, descripcion: Descripcion, totales: Total[], avisos: string[]) {
  const inicio = descripcion.length + 3;
  const filas: (string | number | null)[][] = [
    [titulo],
    [],
    ...descripcion,
    [],
    ...totales.map(([k, v]) => [k, v]),
    ...(avisos.length ? [[], ...avisos.map((a) => [a])] : []),
  ];
  const ws = hoja(filas, [28, 40]);
  totales.forEach(([, , monto], i) => {
    if (monto) ws[XLSX.utils.encode_cell({ r: inicio + i, c: 1 })].z = FORMATO_BS;
  });
  return ws;
}

export function excelVentas(d: DatosVentas, descripcion: Descripcion): Buffer {
  const r = d.resumen;
  const resumen = hojaResumen(
    "Reporte de ventas",
    descripcion,
    [
      ["Ventas completadas", r.cantidad],
      ["Total vendido", n(r.total), true],
      ["Efectivo", n(r.efectivo), true],
      ["QR", n(r.qr), true],
      ["QR por confirmar (ventas)", r.qrPorConfirmar],
      ["Descuentos", n(r.descuentos), true],
      ["Costo de lo vendido", n(r.costo), true],
      ["Ganancia bruta", n(ganancia(r)), true],
      ["Gastos del periodo", n(r.gastos), true],
      ["Ventas - gastos", n(deCentavos(aCentavos(r.total) - aCentavos(r.gastos))), true],
      ["Ventas anuladas", r.anuladas],
      ["Total anulado", n(r.totalAnuladas), true],
    ],
    [
      "Las ventas anuladas figuran en la hoja Ventas pero no suman en los totales.",
      ...(d.truncado ? ["Atención: el periodo tiene demasiadas ventas; se exportaron las más recientes. Acorta el rango."] : []),
    ],
  );
  const ventas = hoja(
    [
      ["N.º", "Fecha", "Hora", "Sucursal", "Cajero", "Cliente", "Método", "Estado", "Subtotal", "Descuento", "Total", "Sin conexión", "Motivo de anulación"],
      ...d.ventas.map((v) => [
        v.numero,
        fecha(v.fecha),
        hora(v.fecha),
        v.sucursal ?? "",
        v.cajero ?? "",
        v.cliente ?? "",
        metodo(v),
        v.estado === "anulada" ? "Anulada" : "Completada",
        n(v.subtotal),
        n(v.descuento),
        n(v.total),
        v.creadoOffline ? "Sí" : "",
        v.motivoAnulacion ?? "",
      ]),
    ],
    [7, 11, 7, 18, 18, 20, 16, 12, 11, 11, 11, 12, 30],
    [8, 9, 10],
  );
  const lineas = hoja(
    [
      ["N.º venta", "Fecha", "Hora", "Sucursal", "Cajero", "Estado", "Producto", "Detalle", "Cantidad", "Precio unitario", "Descuento", "Neto", "Costo", "Ganancia", "Vendido por"],
      ...d.lineas.map((l) => [
        l.numero,
        fecha(l.fecha),
        hora(l.fecha),
        l.sucursal,
        l.cajero,
        l.estado === "anulada" ? "Anulada" : "Completada",
        l.producto,
        l.detalleProducto,
        l.cantidad,
        n(l.precioUnitario),
        n(l.descuento),
        n(l.neto),
        n(l.costo),
        n(deCentavos(aCentavos(l.neto) - aCentavos(l.costo))),
        l.unidad ? nombreUnidad({ unidadFraccion: l.unidad }, 1) : "envase / unidad",
      ]),
    ],
    [9, 11, 7, 18, 18, 12, 28, 28, 9, 13, 11, 11, 11, 11, 16],
    [9, 10, 11, 12, 13],
  );
  const productos = hoja(
    [
      ["Producto", "Detalle", "Unidades (envases)", "Bruto", "Descuentos", "Neto", "Costo", "Ganancia", "Unidades sueltas", "Unidad suelta", "Neto de sueltas"],
      ...d.productos.map((p) => [
        p.nombre,
        [p.marca, p.sabor, p.presentacion].filter(Boolean).join(" · "),
        p.unidades,
        n(p.bruto),
        n(p.descuento),
        n(p.neto),
        n(p.costo),
        n(p.ganancia),
        p.sueltas || null,
        p.sueltas ? nombreUnidad({ unidadFraccion: p.unidadFraccion }, 1) : null,
        p.sueltas ? n(p.netoSueltas) : null,
      ]),
    ],
    [30, 30, 10, 12, 12, 12, 12, 12, 10, 12, 12],
    [3, 4, 5, 6, 7, 10],
  );
  const dias = hoja([["Día", "Ventas", "Efectivo", "QR", "Total"], ...d.dias.map((x) => [dia(x.dia), x.cantidad, n(x.efectivo), n(x.qr), n(x.total)])], [12, 9, 12, 12, 12], [2, 3, 4]);
  const cajeros = hoja(
    [["Cajero", "Sucursal", "Ventas", "Anuladas", "Efectivo", "QR", "Total"], ...d.cajeros.map((c) => [c.cajero, c.sucursal, c.cantidad, c.anuladas, n(c.efectivo), n(c.qr), n(c.total)])],
    [22, 20, 9, 9, 12, 12, 12],
    [4, 5, 6],
  );
  return libro([
    ["Resumen", resumen],
    ["Ventas", ventas],
    ["Detalle", lineas],
    ["Productos", productos],
    ["Por día", dias],
    ["Por cajero", cajeros],
  ]);
}

export function excelGastos(d: DatosGastos, descripcion: Descripcion): Buffer {
  const r = d.resumen;
  const resumen = hojaResumen(
    "Reporte de gastos",
    descripcion,
    [
      ["Gastos vigentes", r.cantidad],
      ["Total", n(r.total), true],
      ["Gastos anulados", r.anulados],
    ],
    [
      "Los gastos anulados figuran en la hoja Gastos pero no suman en los totales.",
      ...(d.truncado ? ["Atención: el periodo tiene demasiados gastos; se exportaron los más recientes. Acorta el rango."] : []),
    ],
  );
  const gastos = hoja(
    [
      ["Fecha", "Hora", "Sucursal", "Cajero", "Categoría", "Descripción", "Monto", "Estado", "Motivo de anulación", "Foto"],
      ...d.gastos.map((g) => [
        fecha(g.fecha),
        hora(g.fecha),
        g.sucursal,
        g.cajero,
        g.categoria,
        g.descripcion ?? "",
        n(g.monto),
        g.anulado ? "Anulado" : "Vigente",
        g.motivoAnulacion ?? "",
        g.fotoUrl ? "Sí" : "",
      ]),
    ],
    [11, 7, 18, 18, 14, 36, 11, 10, 30, 6],
    [6],
  );
  const categorias = hoja([["Categoría", "Gastos", "Total"], ...r.porCategoria.map((c) => [c.categoria, c.cantidad, n(c.total)])], [18, 9, 12], [2]);
  const dias = hoja([["Día", "Gastos", "Total"], ...r.porDia.map((x) => [dia(x.dia), x.cantidad, n(x.total)])], [12, 9, 12], [2]);
  return libro([
    ["Resumen", resumen],
    ["Gastos", gastos],
    ["Por categoría", categorias],
    ["Por día", dias],
  ]);
}

// ------------------------------------------------------------------------------------------- PDF

type Columna = { titulo: string; ancho: number; alinear?: "left" | "right" };

const MARGEN = 12;
const NARANJA: [number, number, number] = [234, 108, 30];

class Documento {
  doc: JsPdf;
  y = MARGEN;
  readonly alto: number;
  readonly ancho: number;

  constructor(
    private titulo: string,
    private marca: string,
    apaisado = false,
  ) {
    this.doc = new jsPDF({ unit: "mm", format: "a4", orientation: apaisado ? "landscape" : "portrait" });
    this.ancho = this.doc.internal.pageSize.getWidth();
    this.alto = this.doc.internal.pageSize.getHeight();
  }

  encabezado(descripcion: Descripcion) {
    const { doc } = this;
    doc.setFillColor(...NARANJA).rect(0, 0, this.ancho, 3, "F");
    doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(20);
    doc.text(this.titulo, MARGEN, MARGEN + 4);
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(90);
    doc.text(this.marca, this.ancho - MARGEN, MARGEN + 4, { align: "right" });
    this.y = MARGEN + 11;
    doc.setFontSize(9);
    for (const [k, v] of descripcion) {
      doc.setFont("helvetica", "bold").text(`${k}:`, MARGEN, this.y);
      doc.setFont("helvetica", "normal").text(v, MARGEN + 28, this.y);
      this.y += 4.5;
    }
    this.y += 2;
  }

  /** Fichas de totales en una grilla. */
  totales(items: [string, string][]) {
    const { doc } = this;
    const porFila = this.ancho > 250 ? 6 : 4;
    const ancho = (this.ancho - 2 * MARGEN - (porFila - 1) * 3) / porFila;
    items.forEach(([titulo, valor], i) => {
      const col = i % porFila;
      if (col === 0 && i > 0) this.y += 17;
      const x = MARGEN + col * (ancho + 3);
      doc.setFillColor(246, 243, 238).roundedRect(x, this.y, ancho, 14, 2, 2, "F");
      doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(100).text(titulo, x + 3, this.y + 5);
      doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(20).text(valor, x + 3, this.y + 11);
    });
    this.y += 21;
  }

  subtitulo(texto: string) {
    this.espacio(14);
    this.doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(20).text(texto, MARGEN, this.y);
    this.y += 4;
  }

  nota(texto: string) {
    this.espacio(6);
    this.doc.setFont("helvetica", "italic").setFontSize(8).setTextColor(110).text(texto, MARGEN, this.y);
    this.y += 5;
  }

  private espacio(mm: number) {
    if (this.y + mm > this.alto - MARGEN) {
      this.doc.addPage();
      this.y = MARGEN;
    }
  }

  /** Tabla con encabezado repetido en cada página; `tenues` = filas en gris (p. ej. anuladas). */
  tabla(columnas: Columna[], filas: string[][], tenues: Set<number> = new Set()) {
    const { doc } = this;
    const util = this.ancho - 2 * MARGEN;
    const total = columnas.reduce((s, c) => s + c.ancho, 0);
    const anchos = columnas.map((c) => (c.ancho / total) * util);
    const altoFila = 5.5;

    const cabecera = () => {
      doc.setFillColor(40, 36, 32).rect(MARGEN, this.y, util, altoFila + 0.5, "F");
      doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(255);
      let x = MARGEN;
      columnas.forEach((c, i) => {
        const derecha = c.alinear === "right";
        doc.text(c.titulo, derecha ? x + anchos[i] - 1.5 : x + 1.5, this.y + 3.8, { align: derecha ? "right" : "left" });
        x += anchos[i];
      });
      this.y += altoFila + 0.5;
    };

    this.espacio(altoFila * 3);
    cabecera();
    filas.forEach((fila, f) => {
      if (this.y + altoFila > this.alto - MARGEN) {
        doc.addPage();
        this.y = MARGEN;
        cabecera();
      }
      if (f % 2 === 1) doc.setFillColor(248, 246, 243).rect(MARGEN, this.y, util, altoFila, "F");
      doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(tenues.has(f) ? 150 : 30);
      let x = MARGEN;
      columnas.forEach((c, i) => {
        const derecha = c.alinear === "right";
        const texto = this.recortar(fila[i] ?? "", anchos[i] - 3);
        doc.text(texto, derecha ? x + anchos[i] - 1.5 : x + 1.5, this.y + 3.8, { align: derecha ? "right" : "left" });
        x += anchos[i];
      });
      this.y += altoFila;
    });
    if (filas.length === 0) {
      doc.setFont("helvetica", "italic").setTextColor(120).text("Sin datos.", MARGEN + 1.5, this.y + 4);
      this.y += altoFila;
    }
    this.y += 4;
  }

  private recortar(texto: string, ancho: number) {
    if (this.doc.getTextWidth(texto) <= ancho) return texto;
    let t = texto;
    while (t.length > 1 && this.doc.getTextWidth(`${t}…`) > ancho) t = t.slice(0, -1);
    return `${t}…`;
  }

  /** Pie con número de página y fecha de generación. */
  cerrar(): Buffer {
    const { doc } = this;
    const paginas = doc.getNumberOfPages();
    const generado = `${fecha(new Date())} ${hora(new Date())}`;
    for (let p = 1; p <= paginas; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(130);
      doc.text(`Generado el ${generado}`, MARGEN, this.alto - 6);
      doc.text(`Página ${p} de ${paginas}`, this.ancho - MARGEN, this.alto - 6, { align: "right" });
    }
    return Buffer.from(doc.output("arraybuffer"));
  }
}

/** Máximo de ventas listadas en el PDF (el Excel lleva todas). */
export const MAX_FILAS_PDF = 1500;

export function pdfVentas(d: DatosVentas, descripcion: Descripcion, marca: string): Buffer {
  const r = d.resumen;
  const pdf = new Documento("Reporte de ventas", marca);
  pdf.encabezado(descripcion);
  pdf.totales([
    ["Total vendido", formatoBs(r.total)],
    ["Ventas", String(r.cantidad)],
    ["Efectivo", formatoBs(r.efectivo)],
    ["QR", formatoBs(r.qr)],
    ["Descuentos", formatoBs(r.descuentos)],
    ["Ganancia bruta", formatoBs(ganancia(r))],
    ["Gastos", formatoBs(r.gastos)],
    ["Ventas - gastos", formatoBs(deCentavos(aCentavos(r.total) - aCentavos(r.gastos)))],
  ]);

  if (d.dias.length > 1) {
    pdf.subtitulo("Por día");
    pdf.tabla(
      [
        { titulo: "Día", ancho: 24 },
        { titulo: "Ventas", ancho: 14, alinear: "right" },
        { titulo: "Efectivo", ancho: 22, alinear: "right" },
        { titulo: "QR", ancho: 22, alinear: "right" },
        { titulo: "Total", ancho: 22, alinear: "right" },
      ],
      d.dias.map((x) => [dia(x.dia), String(x.cantidad), formatoBs(x.efectivo), formatoBs(x.qr), formatoBs(x.total)]),
    );
  }

  pdf.subtitulo("Productos vendidos");
  pdf.tabla(
    [
      { titulo: "Producto", ancho: 44 },
      { titulo: "Unid.", ancho: 10, alinear: "right" },
      { titulo: "Neto", ancho: 20, alinear: "right" },
      { titulo: "Costo", ancho: 20, alinear: "right" },
      { titulo: "Ganancia", ancho: 20, alinear: "right" },
    ],
    d.productos.map((p) => [
      [p.nombre, p.sabor, p.presentacion].filter(Boolean).join(" · "),
      p.sueltas > 0 ? `${p.unidades} + ${p.sueltas} s.` : String(p.unidades),
      formatoBs(p.neto),
      formatoBs(p.costo),
      formatoBs(p.ganancia),
    ]),
  );

  pdf.subtitulo("Ventas");
  const ventas = d.ventas.slice(0, MAX_FILAS_PDF);
  pdf.tabla(
    [
      { titulo: "N.º", ancho: 9 },
      { titulo: "Fecha", ancho: 22 },
      { titulo: "Sucursal", ancho: 22 },
      { titulo: "Cajero", ancho: 22 },
      { titulo: "Método", ancho: 18 },
      { titulo: "Estado", ancho: 15 },
      { titulo: "Total", ancho: 18, alinear: "right" },
    ],
    ventas.map((v) => [
      String(v.numero),
      `${fecha(v.fecha)} ${hora(v.fecha)}`,
      v.sucursal ?? "",
      v.cajero ?? "",
      metodo(v),
      v.estado === "anulada" ? "Anulada" : "",
      formatoBs(v.total),
    ]),
    new Set(ventas.flatMap((v, i) => (v.estado === "anulada" ? [i] : []))),
  );
  if (d.ventas.length > MAX_FILAS_PDF || d.truncado) pdf.nota(`Se listan las ${MAX_FILAS_PDF} ventas más recientes; el Excel incluye el detalle completo.`);
  pdf.nota("Las ventas anuladas aparecen en gris y no suman en los totales.");
  return pdf.cerrar();
}

export function pdfGastos(d: DatosGastos, descripcion: Descripcion, marca: string): Buffer {
  const r = d.resumen;
  const pdf = new Documento("Reporte de gastos", marca);
  pdf.encabezado(descripcion);
  pdf.totales([
    ["Total", formatoBs(r.total)],
    ["Gastos", String(r.cantidad)],
    ["Anulados", String(r.anulados)],
  ]);

  pdf.subtitulo("Por categoría");
  pdf.tabla(
    [
      { titulo: "Categoría", ancho: 40 },
      { titulo: "Gastos", ancho: 14, alinear: "right" },
      { titulo: "Total", ancho: 22, alinear: "right" },
    ],
    r.porCategoria.map((c) => [c.categoria, String(c.cantidad), formatoBs(c.total)]),
  );
  if (r.porDia.length > 1) {
    pdf.subtitulo("Por día");
    pdf.tabla(
      [
        { titulo: "Día", ancho: 40 },
        { titulo: "Gastos", ancho: 14, alinear: "right" },
        { titulo: "Total", ancho: 22, alinear: "right" },
      ],
      r.porDia.map((x) => [dia(x.dia), String(x.cantidad), formatoBs(x.total)]),
    );
  }

  pdf.subtitulo("Detalle");
  const gastos = d.gastos.slice(0, MAX_FILAS_PDF);
  pdf.tabla(
    [
      { titulo: "Fecha", ancho: 22 },
      { titulo: "Sucursal", ancho: 20 },
      { titulo: "Cajero", ancho: 20 },
      { titulo: "Categoría", ancho: 16 },
      { titulo: "Descripción", ancho: 34 },
      { titulo: "Monto", ancho: 16, alinear: "right" },
    ],
    gastos.map((g) => [
      `${fecha(g.fecha)} ${hora(g.fecha)}`,
      g.sucursal,
      g.cajero,
      g.categoria,
      g.anulado ? `ANULADO${g.motivoAnulacion ? `: ${g.motivoAnulacion}` : ""}` : (g.descripcion ?? ""),
      formatoBs(g.monto),
    ]),
    new Set(gastos.flatMap((g, i) => (g.anulado ? [i] : []))),
  );
  if (d.gastos.length > MAX_FILAS_PDF || d.truncado) pdf.nota(`Se listan los ${MAX_FILAS_PDF} gastos más recientes; el Excel incluye todos.`);
  return pdf.cerrar();
}
