import { BarChart3, Banknote, CircleDollarSign, QrCode, ReceiptText, Tag, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { Pestanas } from "@/components/inventario/pestanas";
import { TarjetaEstadistica } from "@/components/panel/tarjeta-estadistica";
import { BarraFiltros } from "@/components/reportes/barra-filtros";
import { CajerosConBuscador, ProductosConBuscador, VentasConBuscador } from "@/components/reportes/buscables";
import { ReporteDeDescuentos } from "@/components/reportes/descuentos";
import { Paginacion, TablaDias } from "@/components/reportes/tablas";
import { aCentavos, deCentavos, restar } from "@/lib/dinero";
import { opcionesEncargado } from "@/lib/encargado-reportes";
import { requerirEncargado } from "@/lib/encargado";
import { formatoBs, hoyEnBolivia } from "@/lib/formato";
import { aParametros, leerFiltros, textoRango } from "@/lib/reportes/filtros";
import { listarVentas, reporteDescuentos, resumenVentas, ventasPorCajero, ventasPorDia, ventasPorProducto } from "@/lib/reportes/ventas";

export const metadata: Metadata = { title: "Reporte de ventas" };

const POR_PAGINA = 50;
const VISTAS = ["ventas", "productos", "dias", "cajeros", "descuentos"] as const;
type Vista = (typeof VISTAS)[number];

/** Reporte de ventas del encargado: solo su sucursal, sin costos ni ganancia y sin exportación. */
export default async function ReporteVentasEncargado(props: PageProps<"/encargado/reportes">) {
  const { sucursal } = await requerirEncargado();
  const hoy = hoyEnBolivia();
  const sp = await props.searchParams;
  // La sucursal nunca sale de la URL: aunque escriba ?sucursal=otra, se consulta la suya.
  const f = { ...leerFiltros(sp, hoy, sucursal.id), sucursalId: sucursal.id };
  const vista: Vista = VISTAS.find((v) => v === sp.vista) ?? "ventas";
  const pagina = Math.max(1, Math.floor(Number(sp.pagina)) || 1);
  const busqueda = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";

  const [opciones, r, contenido] = await Promise.all([
    opcionesEncargado(sucursal),
    resumenVentas(f),
    vista === "productos"
      ? // Los costos no viajan al navegador.
        ventasPorProducto(f).then((filas) => <ProductosConBuscador sinCostos filas={filas.map((p) => ({ ...p, costo: "0", ganancia: "0" }))} />)
      : vista === "dias"
        ? ventasPorDia(f).then((filas) => <TablaDias filas={filas} />)
        : vista === "cajeros"
          ? ventasPorCajero(f).then((filas) => <CajerosConBuscador filas={filas} />)
          : vista === "descuentos"
            ? reporteDescuentos(f).then((d) => <ReporteDeDescuentos r={d} />)
            : listarVentas(f, { limite: POR_PAGINA + 1, desplazamiento: (pagina - 1) * POR_PAGINA, busqueda }).then((filas) => (
                <div className="space-y-3">
                  <VentasConBuscador anulacion="encargado" conFecha={f.desde !== f.hasta} ventas={filas.slice(0, POR_PAGINA)} />
                  <Paginacion pagina={pagina} hayMas={filas.length > POR_PAGINA} href={(p) => `/encargado/reportes?${aParametros(f, { vista, pagina: String(p), q: busqueda })}`} />
                </div>
              )),
  ]);

  const producto = f.productoId ? opciones.productos.find((p) => p.id === f.productoId) : null;
  const ticket = r.cantidad ? deCentavos(aCentavos(r.total) / BigInt(r.cantidad)) : "0";
  const pestana = (v: Vista) => `/encargado/reportes?${aParametros(f, { vista: v === "ventas" ? null : v })}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <EncabezadoPagina
        icono={BarChart3}
        titulo="Reporte de ventas"
        descripcion={
          <>
            {sucursal.nombre} · <span className="cifras">{textoRango(f.desde, f.hasta)}</span>
          </>
        }
      />

      <BarraFiltros sucursalFija filtros={f} hoy={hoy} opciones={opciones} campos={["cajero", "metodo", "producto"]} />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5" aria-label="Totales">
        <TarjetaEstadistica
          icono={TrendingUp}
          tono="naranja"
          valor={formatoBs(r.total)}
          titulo="Total vendido"
          detalle={`${r.cantidad} venta${r.cantidad === 1 ? "" : "s"}${r.anuladas ? ` · ${r.anuladas} anulada${r.anuladas === 1 ? "" : "s"}` : ""}`}
        />
        <TarjetaEstadistica icono={ReceiptText} tono="neutra" valor={formatoBs(ticket)} titulo="Ticket promedio" />
        <TarjetaEstadistica icono={Banknote} tono="verde" valor={formatoBs(r.efectivo)} titulo="Efectivo" />
        <TarjetaEstadistica icono={QrCode} tono="verde" valor={formatoBs(r.qr)} titulo="QR" detalle={r.qrPorConfirmar ? `${r.qrPorConfirmar} por confirmar` : undefined} />
        <TarjetaEstadistica icono={Tag} tono="rosa" valor={formatoBs(r.descuentos)} titulo="Descuentos" />
      </section>

      <section className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-3xl border bg-card px-5 py-4 text-sm shadow-sm">
        {producto ? (
          <p>
            <span className="text-muted-foreground">{producto.nombre}:</span>{" "}
            <strong className="cifras">
              {r.unidades} unidad{r.unidades === 1 ? "" : "es"}
              {r.sueltas > 0 && ` + ${r.sueltas} suelta${r.sueltas === 1 ? "" : "s"}`} · {formatoBs(r.ventaLineas)}
            </strong>
          </p>
        ) : (
          <p className="flex items-center gap-2">
            <CircleDollarSign className="size-4 text-primary" />
            <span className="text-muted-foreground">Ventas − gastos del periodo:</span>
            <strong className="cifras">
              {formatoBs(r.total)} − {formatoBs(r.gastos)} ={" "}
              <span className={aCentavos(restar(r.total, r.gastos)) < 0n ? "text-destructive" : ""}>{formatoBs(restar(r.total, r.gastos))}</span>
            </strong>
          </p>
        )}
      </section>

      <Pestanas
        actual={vista}
        opciones={[
          { valor: "ventas", titulo: "Ventas", href: pestana("ventas") },
          { valor: "productos", titulo: "Productos", href: pestana("productos") },
          { valor: "dias", titulo: "Por día", href: pestana("dias") },
          { valor: "cajeros", titulo: "Por cajero", href: pestana("cajeros") },
          { valor: "descuentos", titulo: "Descuentos", href: pestana("descuentos") },
        ]}
      />
      {contenido}
    </div>
  );
}
