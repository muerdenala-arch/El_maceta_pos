import { Bell, CalendarDays, CalendarRange, ChevronRight, LayoutDashboard, Medal, ReceiptText, Tag, TrendingUp, Truck, Wallet, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ESTILO_ALERTA } from "@/components/alertas/estilo";
import { SelectorFecha } from "@/components/panel/selector-fecha";
import { TarjetaEstadistica } from "@/components/panel/tarjeta-estadistica";
import { listarAlertasPendientes } from "@/lib/alertas/consultas";
import { cajasAbiertas, obtenerResumen } from "@/lib/consultas/resumen";
import { restar } from "@/lib/dinero";
import { requerirEncargado } from "@/lib/encargado";
import { fechaLarga, fechaValida, formatoBs, hoyEnBolivia } from "@/lib/formato";
import { textoCantidadVendida } from "@/lib/inventario/fraccion";
import { listarTransferencias } from "@/lib/inventario/consultas";
import { aParametros, type FiltrosReporte } from "@/lib/reportes/filtros";
import { ventasPorProducto } from "@/lib/reportes/ventas";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Inicio" };

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-BO", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Panel del encargado: ventas, cajas abiertas, más vendidos y alertas de stock, solo de su sucursal y sin costos. */
export default async function PanelEncargado(props: PageProps<"/encargado/panel">) {
  const { sesion, sucursal } = await requerirEncargado();
  const hoy = hoyEnBolivia();
  const fecha = fechaValida((await props.searchParams).fecha) ?? hoy;

  const filtroDia: FiltrosReporte = { desde: fecha, hasta: fecha, sucursalId: sucursal.id, cajeroId: null, metodo: null, productoId: null, categoria: null };
  const reporte = (vista?: string) => `/encargado/reportes?${aParametros(filtroDia, { vista })}`;

  const [r, masVendidos, cajas, alertas, transferencias] = await Promise.all([
    obtenerResumen(fecha, sucursal.id),
    ventasPorProducto(filtroDia, 5),
    cajasAbiertas(sucursal.id),
    listarAlertasPendientes(6, sesion),
    listarTransferencias({ destinoId: sucursal.id, limite: 30 }),
  ]);
  const enCamino = transferencias.filter((t) => t.estado === "enviada").length;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-extrabold sm:text-3xl">
            <LayoutDashboard className="size-7 text-primary" />
            {sucursal.nombre}
          </h1>
          <p className="mt-1 text-muted-foreground first-letter:uppercase">{fechaLarga(fecha)}</p>
        </div>
        <SelectorFecha fecha={fecha} hoy={hoy} />
      </header>

      <section className="mt-7 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
        <TarjetaEstadistica
          icono={TrendingUp}
          tono="naranja"
          valor={formatoBs(restar(r.ventasDia, r.gastosDia))}
          titulo="Venta del día (neta)"
          detalle={`Ingresos: ${formatoBs(r.ventasDia)} / Gastos: -${formatoBs(r.gastosDia)}`}
        />
        <TarjetaEstadistica icono={CalendarDays} tono="verde" valor={formatoBs(restar(r.ventasSemana, r.gastosSemana))} titulo="Semana (neta)" detalle={`Gastos: -${formatoBs(r.gastosSemana)}`} />
        <TarjetaEstadistica icono={CalendarRange} tono="verde" valor={formatoBs(restar(r.ventasMes, r.gastosMes))} titulo="Mes (neta)" detalle={`Gastos: -${formatoBs(r.gastosMes)}`} />
        <TarjetaEstadistica icono={ReceiptText} tono="neutra" valor={String(r.cantidadDia)} titulo="Cantidad de ventas" />
        <TarjetaEstadistica icono={Tag} tono="neutra" valor={formatoBs(r.descuentosDia)} titulo="Descuentos (Bs)" />
      </section>

      {enCamino > 0 && (
        <Link href="/encargado/transferencias" className="mt-6 flex items-center gap-3 rounded-3xl border border-primary/40 bg-primary/8 px-5 py-4 font-semibold transition-colors hover:bg-primary/12">
          <Truck className="size-5 text-primary" />
          {enCamino === 1 ? "Hay 1 transferencia en camino" : `Hay ${enCamino} transferencias en camino`} a tu sucursal: confírmala al recibirla.
          <ChevronRight className="ml-auto size-4" />
        </Link>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel icono={Medal} titulo="Más vendidos" enlace={reporte("productos")}>
          {masVendidos.length === 0 && <Vacio>Sin ventas este día.</Vacio>}
          <ol className="space-y-2">
            {masVendidos.map((p, i) => (
              <li key={p.id} className="flex items-center gap-3">
                <span className="cifras flex size-7 shrink-0 items-center justify-center rounded-full bg-ficha-naranja text-xs font-extrabold text-ficha-naranja-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.nombre}</p>
                  <p className="truncate text-xs text-muted-foreground">{[p.sabor, p.presentacion].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="text-right">
                  <p className="cifras text-sm font-bold">{formatoBs(p.neto)}</p>
                  <p className="cifras text-xs text-muted-foreground">
                    {p.unidades} unid.{p.sueltas > 0 && ` + ${textoCantidadVendida(p.sueltas, p.unidadFraccion ?? "capsula")}`}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel icono={Wallet} titulo={`Cajas abiertas${cajas.length ? ` (${cajas.length})` : ""}`} enlace="/encargado/cajas">
          {cajas.length === 0 && <Vacio>No hay cajas abiertas ahora.</Vacio>}
          <ul className="space-y-2">
            {cajas.map((c) => (
              <li key={c.id}>
                <Link href={`/encargado/cajas?caja=${c.id}`} className="flex items-center gap-3 rounded-2xl bg-muted/60 px-3 py-2 transition-colors hover:bg-accent">
                  <span className="size-2 shrink-0 rounded-full bg-exito" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{c.cajero}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      desde {hora(c.apertura)} · {c.cantidadVentas} venta{c.cantidadVentas === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="cifras text-sm font-bold">{formatoBs(c.esperado)}</p>
                    <p className="text-xs text-muted-foreground">en caja</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel icono={Bell} titulo={`Stock por reponer${alertas.length ? ` (${alertas.length})` : ""}`} enlace="/cajero/bodega">
          {alertas.length === 0 && <Vacio>Todo en orden: no falta stock.</Vacio>}
          <ul className="space-y-1">
            {alertas.map((a) => {
              const e = ESTILO_ALERTA[a.tipo];
              return (
                <li key={a.id}>
                  <Link href={a.destino} className="flex items-start gap-3 rounded-2xl px-2 py-1.5 transition-colors hover:bg-accent">
                    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", e.clase)}>
                      <e.icono className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-muted-foreground uppercase">{e.titulo}</p>
                      <p className="line-clamp-2 text-sm">{a.mensaje}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ icono: Icono, titulo, enlace, children }: { icono: LucideIcon; titulo: string; enlace?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border bg-card p-5 shadow-sm">
      <header className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-extrabold">
          <Icono className="size-5 text-primary" />
          {titulo}
        </h2>
        {enlace && (
          <Link href={enlace} className="flex items-center text-xs font-bold text-muted-foreground hover:text-foreground">
            Ver todo <ChevronRight className="size-3.5" />
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-sm text-muted-foreground">{children}</p>;
}
