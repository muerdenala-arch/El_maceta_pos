/**
 * Generación de PDF (sección 10 del plan), acceso a comprobantes y reportes/exportación
 * contra la base en memoria.
 */
import { randomUUID } from "node:crypto";
import { inflateSync } from "node:zlib";
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { beforeAll, describe, expect, it } from "vitest";
import { anularVenta } from "@/app/admin/reportes/acciones";
import { abrirCaja, registrarGasto, registrarVenta, verComprobante } from "@/app/cajero/acciones";
import { db } from "@/db";
import { ventas } from "@/db/schema";
import { obtenerComprobante } from "@/lib/comprobante/consulta";
import { generarPdf } from "@/lib/comprobante/pdf";
import { excelVentas, pdfGastos, pdfVentas, excelGastos } from "@/lib/reportes/documentos";
import { leerFiltros, type FiltrosReporte } from "@/lib/reportes/filtros";
import { listarGastos, resumenGastos } from "@/lib/reportes/gastos";
import { lineasDeVentas, listarVentas, resumenVentas, ventasPorCajero, ventasPorDia, ventasPorProducto } from "@/lib/reportes/ventas";
import { comoUsuario, prepararBase, type Base } from "./base";

let b: Base;
const ids: Record<string, number> = {};

async function vender(nombre: string, productoId: number, cantidad: number, metodoPago: "efectivo" | "qr", fechaIso: string) {
  const r = await registrarVenta({
    uuid: randomUUID(),
    lineas: [{ productoId, cantidad }],
    metodoPago,
    montoRecibido: metodoPago === "efectivo" ? "5000" : null,
    clienteNombre: nombre === "cliente" ? "Carla Rojas" : null,
    clienteTelefono: nombre === "cliente" ? "71234567" : null,
    cuponCodigo: null,
  });
  if (!r.ok) throw new Error(r.error);
  await db.update(ventas).set({ fecha: new Date(fechaIso) }).where(eq(ventas.id, r.datos.ventaId));
  ids[nombre] = r.datos.ventaId;
}

beforeAll(async () => {
  b = await prepararBase();
  await comoUsuario(b.cajeroNorte);
  await abrirCaja({ montoInicial: "100" });
  // 9 de septiembre en Bolivia (UTC−4): 23:30 local = 03:30 UTC del día 10.
  await vender("cliente", b.proteina.id, 2, "efectivo", "2026-09-10T03:30:00Z");
  // 10 de septiembre, 00:10 local.
  await vender("qr", b.creatina.id, 1, "qr", "2026-09-10T04:10:00Z");
  await vender("anulada", b.proteina.id, 1, "efectivo", "2026-09-10T15:00:00Z");
  await registrarGasto({ uuid: randomUUID(), categoria: "Limpieza", monto: "30", descripcion: "Detergente", fotoUrl: null });
  await comoUsuario(b.admin);
  await anularVenta({ id: ids.anulada, motivo: "Error de cobro" });
});

/** Texto de un PDF, descomprimiendo sus flujos (el comprobante va comprimido para WhatsApp). */
function textoPdf(bytes: Buffer) {
  const crudo = bytes.toString("latin1");
  const flujos = [...crudo.matchAll(/stream\r?\n([\s\S]*?)endstream/g)].map((m) => {
    try {
      return inflateSync(Buffer.from(m[1], "latin1")).toString("latin1");
    } catch {
      return m[1];
    }
  });
  return [crudo, ...flujos].join("\n");
}

const filtro = (p: Record<string, string>): FiltrosReporte => leerFiltros({ sucursal: "todas", ...p }, "2026-12-31", null);

describe("comprobante", () => {
  it("el PDF se genera en 58 mm, 80 mm y carta con los datos de la venta", async () => {
    const datos = (await obtenerComprobante({ ventaId: ids.cliente }))!;
    for (const tamano of ["58mm", "80mm", "carta"] as const) {
      const pdf = await generarPdf(datos, tamano);
      const texto = textoPdf(Buffer.from(await pdf.arrayBuffer()));
      expect(texto.startsWith("%PDF-")).toBe(true);
      expect(texto).toContain("Whey Test");
      expect(texto).toContain("Carla Rojas");
      expect(texto).toContain("Bs 700,00");
    }
  });

  it("el cajero ve solo sus comprobantes; el admin, todos; la página pública, solo con el token", async () => {
    await comoUsuario(b.cajeroSur);
    expect(await verComprobante(ids.cliente)).toEqual({ ok: false, error: "No puedes ver este comprobante" });
    await comoUsuario(b.admin);
    expect((await verComprobante(ids.cliente)).ok).toBe(true);

    const [v] = await db.select({ token: ventas.tokenPublico, numero: ventas.numeroComprobante }).from(ventas).where(eq(ventas.id, ids.cliente));
    expect(v.token.length).toBeGreaterThanOrEqual(24);
    expect((await obtenerComprobante({ token: v.token }))?.venta.numero).toBe(v.numero);
    expect(await obtenerComprobante({ token: String(v.numero) })).toBeNull();
  });
});

describe("reportes de ventas", () => {
  it("cada venta cuenta en su día de Bolivia (no en el de UTC)", async () => {
    const dia9 = await resumenVentas(filtro({ desde: "2026-09-09", hasta: "2026-09-09" }));
    expect(dia9).toMatchObject({ cantidad: 1, total: "700.00", efectivo: "700.00", qr: "0" });
    const dia10 = await resumenVentas(filtro({ desde: "2026-09-10", hasta: "2026-09-10" }));
    expect(dia10).toMatchObject({ cantidad: 1, total: "120.00", qr: "120.00", anuladas: 1, totalAnuladas: "350.00" });
    expect((await ventasPorDia(filtro({ desde: "2026-09-01", hasta: "2026-09-30" }))).map((d) => [d.dia, d.total])).toEqual([
      ["2026-09-09", "700.00"],
      ["2026-09-10", "120.00"],
    ]);
  });

  it("totales, ganancia y filtros por método, producto y cajero (sin contar anuladas)", async () => {
    const f = filtro({ desde: "2026-09-01", hasta: "2026-09-30" });
    const r = await resumenVentas(f);
    // Ganancia = (700 − 2 × 280,50) + (120 − 80) = 139 + 40.
    expect(r).toMatchObject({ cantidad: 2, total: "820.00", ventaLineas: "820.00", costo: "641.00", unidades: 3 });
    expect((await resumenVentas({ ...f, metodo: "qr" })).total).toBe("120.00");
    expect((await resumenVentas({ ...f, productoId: b.proteina.id })).total).toBe("700.00");
    expect((await resumenVentas({ ...f, cajeroId: b.cajeroSur.id })).cantidad).toBe(0);

    const productos = await ventasPorProducto(f);
    expect(productos.map((p) => [p.nombre, p.unidades, p.ganancia])).toEqual([
      ["Whey Test", 2, "139.00"],
      ["Creatina Test", 1, "40.00"],
    ]);
    const [cajero] = await ventasPorCajero(f);
    expect(cajero).toMatchObject({ cajero: "Ana Norte", cantidad: 2, anuladas: 1, total: "820.00" });
    expect(await listarVentas(f, { limite: 10 })).toHaveLength(3);
  });

  it("exporta a Excel con montos numéricos y a PDF", async () => {
    const f = filtro({ desde: "2026-09-01", hasta: "2026-09-30" });
    const datos = {
      resumen: await resumenVentas(f),
      ventas: await listarVentas(f, { limite: 100 }),
      lineas: await lineasDeVentas(f, 100),
      productos: await ventasPorProducto(f),
      dias: await ventasPorDia(f),
      cajeros: await ventasPorCajero(f),
      truncado: false,
    };
    const libro = XLSX.read(excelVentas(datos, [["Periodo", "septiembre"]]));
    expect(libro.SheetNames).toEqual(["Resumen", "Ventas", "Detalle", "Productos", "Por día", "Por cajero"]);
    const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(libro.Sheets.Ventas);
    expect(filas).toHaveLength(3);
    expect(filas.find((x) => x.Estado === "Anulada")?.Total).toBe(350);
    expect(typeof filas[0].Total).toBe("number");

    const pdf = pdfVentas(datos, [["Periodo", "septiembre"]], "El Maseta").toString("latin1");
    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect(pdf).toContain("Bs 820,00");
  });
});

describe("reportes de gastos", () => {
  it("totales por categoría y exportación", async () => {
    const f = filtro({ desde: "2026-01-01", hasta: "2026-12-31" });
    const r = await resumenGastos(f);
    expect(r).toMatchObject({ total: "30.00", cantidad: 1, porCategoria: [{ categoria: "Limpieza", total: "30.00", cantidad: 1 }] });
    expect((await resumenGastos({ ...f, categoria: "Transporte" })).cantidad).toBe(0);
    const gastos = await listarGastos(f, 10);
    const libro = XLSX.read(excelGastos({ resumen: r, gastos, truncado: false }, []));
    expect(XLSX.utils.sheet_to_json<Record<string, unknown>>(libro.Sheets.Gastos)[0]).toMatchObject({ Categoría: "Limpieza", Monto: 30 });
    expect(pdfGastos({ resumen: r, gastos, truncado: false }, [], "El Maseta").toString("latin1")).toContain("Detergente");
  });
});
