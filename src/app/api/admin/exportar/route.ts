import type { NextRequest } from "next/server";
import { obtenerSesion } from "@/lib/auth/sesion";
import { obtenerMarca } from "@/lib/configuracion";
import { hoyEnBolivia } from "@/lib/formato";
import { excelGastos, excelVentas, pdfGastos, pdfVentas, type Descripcion } from "@/lib/reportes/documentos";
import { leerFiltros, textoRango, type FiltrosReporte } from "@/lib/reportes/filtros";
import { listarGastos, resumenGastos } from "@/lib/reportes/gastos";
import { opcionesFiltros } from "@/lib/reportes/opciones";
import { lineasDeVentas, listarVentas, resumenVentas, ventasPorCajero, ventasPorDia, ventasPorProducto } from "@/lib/reportes/ventas";

/** Topes por archivo: un año de una tienda pequeña entra de sobra; más que eso pide acortar el rango. */
const MAX_VENTAS = 20_000;
const MAX_LINEAS = 60_000;
const MAX_GASTOS = 20_000;

const TIPOS = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
} as const;

/**
 * Exportación de reportes a Excel o PDF (sección 4.2 del plan). Solo administrador: el proxy protege
 * /api/admin y además se verifica la sesión aquí (nunca confiar solo en el proxy).
 * GET /api/admin/exportar?reporte=ventas|gastos&formato=xlsx|pdf&desde=&hasta=&sucursal=&cajero=&metodo=&producto=&categoria=
 */
export async function GET(req: NextRequest) {
  const sesion = await obtenerSesion();
  if (!sesion) return Response.json({ error: "Sesión vencida" }, { status: 401 });
  if (sesion.rol !== "admin") return Response.json({ error: "Sin permiso" }, { status: 403 });

  const p = req.nextUrl.searchParams;
  const reporte = p.get("reporte");
  const formato = p.get("formato");
  if ((reporte !== "ventas" && reporte !== "gastos") || (formato !== "xlsx" && formato !== "pdf")) {
    return Response.json({ error: "Reporte o formato inválido" }, { status: 400 });
  }
  // Sin parámetro de sucursal se exporta todo (el enlace de la pantalla siempre la envía explícita).
  const f = leerFiltros(p, hoyEnBolivia(), null);
  const [opciones, marca] = await Promise.all([opcionesFiltros({ conProductos: !!f.productoId }), obtenerMarca()]);
  const descripcion = describir(f, opciones, reporte);

  let archivo: Buffer;
  if (reporte === "ventas") {
    const [resumen, ventas, lineas, productos, dias, cajeros] = await Promise.all([
      resumenVentas(f),
      listarVentas(f, { limite: MAX_VENTAS + 1 }),
      formato === "xlsx" ? lineasDeVentas(f, MAX_LINEAS + 1) : Promise.resolve([]),
      ventasPorProducto(f, 5000),
      ventasPorDia(f),
      ventasPorCajero(f),
    ]);
    const datos = {
      resumen,
      ventas: ventas.slice(0, MAX_VENTAS),
      lineas: lineas.slice(0, MAX_LINEAS),
      productos,
      dias,
      cajeros,
      truncado: ventas.length > MAX_VENTAS || lineas.length > MAX_LINEAS,
    };
    archivo = formato === "xlsx" ? excelVentas(datos, descripcion) : pdfVentas(datos, descripcion, marca.nombre);
  } else {
    const [resumen, gastos] = await Promise.all([resumenGastos(f), listarGastos(f, MAX_GASTOS + 1)]);
    const datos = { resumen, gastos: gastos.slice(0, MAX_GASTOS), truncado: gastos.length > MAX_GASTOS };
    archivo = formato === "xlsx" ? excelGastos(datos, descripcion) : pdfGastos(datos, descripcion, marca.nombre);
  }

  const nombre = `${reporte}_${f.desde}${f.hasta !== f.desde ? `_a_${f.hasta}` : ""}.${formato}`;
  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": TIPOS[formato],
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function describir(f: FiltrosReporte, o: Awaited<ReturnType<typeof opcionesFiltros>>, reporte: "ventas" | "gastos"): Descripcion {
  const d: Descripcion = [
    ["Periodo", textoRango(f.desde, f.hasta).replace("–", "al")],
    ["Sucursal", f.sucursalId ? (o.sucursales.find((s) => s.id === f.sucursalId)?.nombre ?? `#${f.sucursalId}`) : "Todas"],
  ];
  if (f.cajeroId) d.push(["Cajero", o.cajeros.find((c) => c.id === f.cajeroId)?.nombre ?? `#${f.cajeroId}`]);
  if (reporte === "ventas" && f.metodo) d.push(["Método de pago", f.metodo === "qr" ? "QR" : "Efectivo"]);
  if (reporte === "ventas" && f.productoId) {
    const p = o.productos.find((x) => x.id === f.productoId);
    d.push(["Producto", p ? [p.nombre, p.sabor, p.presentacion].filter(Boolean).join(" · ") : `#${f.productoId}`]);
  }
  if (reporte === "gastos" && f.categoria) d.push(["Categoría", f.categoria]);
  return d;
}
