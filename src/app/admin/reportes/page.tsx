import { BarChart3, Banknote, CircleDollarSign, PiggyBank, QrCode, ReceiptText, Tag, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import { ListaVentas } from "@/components/comprobante/lista-ventas";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { Pestanas } from "@/components/inventario/pestanas";
import { TarjetaEstadistica } from "@/components/panel/tarjeta-estadistica";
import { BarraFiltros } from "@/components/reportes/barra-filtros";
import { margen, Paginacion, TablaCajeros, TablaDias, TablaProductos } from "@/components/reportes/tablas";
import { requerirSesion } from "@/lib/auth/sesion";
import { aCentavos, deCentavos, restar } from "@/lib/dinero";
import { formatoBs, hoyEnBolivia } from "@/lib/formato";
import { aParametros, leerFiltros, textoRango } from "@/lib/reportes/filtros";
import { opcionesFiltros } from "@/lib/reportes/opciones";
import { listarVentas, resumenVentas, ventasPorCajero, ventasPorDia, ventasPorProducto } from "@/lib/reportes/ventas";
import { obtenerSucursalVista } from "@/lib/sucursal-vista";

export const metadata: Metadata = { title: "Reporte de ventas" };

const POR_PAGINA = 50;
const VISTAS = ["ventas", "productos", "dias", "cajeros"] as const;
type Vista = (typeof VISTAS)[number];

/** Reporte de ventas (sección 4.2 del plan): filtros, totales, desgloses, comprobantes y exportación. */
export default async function PaginaReporteVentas(props: PageProps<"/admin/reportes">) {
  const sesion = await requerirSesion("admin");
  const hoy = hoyEnBolivia();
  const sp = await props.searchParams;
  const f = leerFiltros(sp, hoy, await obtenerSucursalVista(sesion));
  const vista: Vista = VISTAS.find((v) => v === sp.vista) ?? "ventas";
  const pagina = Math.max(1, Math.floor(Number(sp.pagina)) || 1);
  const ventaInicial = Number(sp.venta) || null;

  const [opciones, r, contenido] = await Promise.all([
    opcionesFiltros(),
    resumenVentas(f),
    vista === "productos"
      ? ventasPorProducto(f).then((filas) => <TablaProductos filas={filas} />)
      : vista === "dias"
        ? ventasPorDia(f).then((filas) => <TablaDias filas={filas} />)
        : vista === "cajeros"
          ? ventasPorCajero(f).then((filas) => <TablaCajeros filas={filas} />)
          : listarVentas(f, { limite: POR_PAGINA + 1, desplazamiento: (pagina - 1) * POR_PAGINA }).then((filas) => (
              <div className="space-y-3">
                <ListaVentas admin conFecha={f.desde !== f.hasta} ventaInicial={ventaInicial} ventas={filas.slice(0, POR_PAGINA)} />
                <Paginacion pagina={pagina} hayMas={filas.length > POR_PAGINA} href={(p) => `/admin/reportes?${aParametros(f, { vista, pagina: String(p) })}`} />
              </div>
            )),
  ]);

  const sucursal = f.sucursalId ? opciones.sucursales.find((s) => s.id === f.sucursalId)?.nombre : "Todas las sucursales";
  const producto = f.productoId ? opciones.productos.find((p) => p.id === f.productoId) : null;
  const ganancia = restar(r.ventaLineas, r.costo);
  const ticket = r.cantidad ? deCentavos(aCentavos(r.total) / BigInt(r.cantidad)) : "0";
  const pestana = (v: Vista) => `/admin/reportes?${aParametros(f, { vista: v === "ventas" ? null : v })}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <EncabezadoPagina
        icono={BarChart3}
        titulo="Reporte de ventas"
        descripcion={
          <>
            {sucursal ?? "Sucursal"} · <span className="cifras">{textoRango(f.desde, f.hasta)}</span>
          </>
        }
      />

      <BarraFiltros filtros={f} hoy={hoy} opciones={opciones} campos={["cajero", "metodo", "producto"]} exportar="ventas" />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6" aria-label="Totales">
        <TarjetaEstadistica
          icono={TrendingUp}
          tono="naranja"
          valor={formatoBs(r.total)}
          titulo="Total vendido"
          detalle={`${r.cantidad} venta${r.cantidad === 1 ? "" : "s"}${r.anuladas ? ` · ${r.anuladas} anulada${r.anuladas === 1 ? "" : "s"}` : ""}`}
        />
        <TarjetaEstadistica icono={ReceiptText} tono="neutra" valor={formatoBs(ticket)} titulo="Ticket promedio" />
        <TarjetaEstadistica icono={Banknote} tono="verde" valor={formatoBs(r.efectivo)} titulo="Efectivo" />
        <TarjetaEstadistica
          icono={QrCode}
          tono="verde"
          valor={formatoBs(r.qr)}
          titulo="QR"
          detalle={r.qrPorConfirmar ? `${r.qrPorConfirmar} por confirmar` : undefined}
        />
        <TarjetaEstadistica icono={Tag} tono="rosa" valor={formatoBs(r.descuentos)} titulo="Descuentos" />
        <TarjetaEstadistica
          icono={PiggyBank}
          tono="naranja"
          valor={formatoBs(ganancia)}
          titulo={producto ? "Ganancia del producto" : "Ganancia bruta"}
          detalle={`Margen ${margen(ganancia, r.ventaLineas)} · costo ${formatoBs(r.costo)}`}
        />
      </section>

      <section className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-3xl border bg-card px-5 py-4 text-sm shadow-sm">
        {producto ? (
          <p>
            <span className="text-muted-foreground">{producto.nombre}:</span>{" "}
            <strong className="cifras">
              {r.unidades} unidad{r.unidades === 1 ? "" : "es"} · {formatoBs(r.ventaLineas)}
            </strong>{" "}
            <span className="text-muted-foreground">(el total vendido incluye los demás productos de esas ventas)</span>
          </p>
        ) : (
          <>
            <p className="flex items-center gap-2">
              <CircleDollarSign className="size-4 text-primary" />
              <span className="text-muted-foreground">Ventas − gastos del periodo:</span>
              <strong className="cifras">
                {formatoBs(r.total)} − {formatoBs(r.gastos)} ={" "}
                <span className={aCentavos(restar(r.total, r.gastos)) < 0n ? "text-destructive" : ""}>{formatoBs(restar(r.total, r.gastos))}</span>
              </strong>
            </p>
            {f.metodo && <p className="text-muted-foreground">Los gastos no dependen del método de pago.</p>}
          </>
        )}
      </section>

      <Pestanas
        actual={vista}
        opciones={[
          { valor: "ventas", titulo: "Ventas", href: pestana("ventas") },
          { valor: "productos", titulo: "Productos", href: pestana("productos") },
          { valor: "dias", titulo: "Por día", href: pestana("dias") },
          { valor: "cajeros", titulo: "Por cajero", href: pestana("cajeros") },
        ]}
      />
      {contenido}
    </div>
  );
}
