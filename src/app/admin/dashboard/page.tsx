import { eq } from "drizzle-orm";
import {
  BarChart3,
  Bell,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  CircleDollarSign,
  Medal,
  ReceiptText,
  Store,
  Tag,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { sucursales } from "@/db/schema";
import { ESTILO_ALERTA } from "@/components/alertas/estilo";
import { SelectorFecha } from "@/components/panel/selector-fecha";
import { TarjetaEstadistica } from "@/components/panel/tarjeta-estadistica";
import { listarAlertasPendientes, resumenAlertas } from "@/lib/alertas/consultas";
import { requerirSesion } from "@/lib/auth/sesion";
import { cajasAbiertas, obtenerResumen, ventasPorSucursal } from "@/lib/consultas/resumen";
import { restar } from "@/lib/dinero";
import { fechaLarga, fechaValida, formatoBs, hoyEnBolivia } from "@/lib/formato";
import { aParametros, type FiltrosReporte } from "@/lib/reportes/filtros";
import { ventasPorProducto } from "@/lib/reportes/ventas";
import { obtenerSucursalVista } from "@/lib/sucursal-vista";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Inicio" };

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-BO", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Dashboard (sección 4.1 del plan): ventas, total por sucursal, más vendidos, cajas abiertas y alertas activas. */
export default async function PanelInicio(props: PageProps<"/admin/dashboard">) {
  const sesion = await requerirSesion("admin");
  const hoy = hoyEnBolivia();
  const fecha = fechaValida((await props.searchParams).fecha) ?? hoy;
  const sucursalId = await obtenerSucursalVista(sesion);

  // Mismos filtros que el reporte de ventas: los enlaces abren el detalle de ese día.
  const filtroDia: FiltrosReporte = { desde: fecha, hasta: fecha, sucursalId, cajeroId: null, metodo: null, productoId: null, categoria: null };
  const reporte = (extra: Partial<FiltrosReporte> = {}, vista?: string) => `/admin/reportes?${aParametros({ ...filtroDia, ...extra }, { vista })}`;

  const [r, porSucursal, masVendidos, cajas, alertas, avisos, [sucursal]] = await Promise.all([
    obtenerResumen(fecha, sucursalId),
    ventasPorSucursal(fecha),
    ventasPorProducto(filtroDia, 5),
    cajasAbiertas(sucursalId),
    listarAlertasPendientes(5),
    resumenAlertas(),
    sucursalId
      ? db.select({ nombre: sucursales.nombre }).from(sucursales).where(eq(sucursales.id, sucursalId))
      : Promise.resolve([undefined]),
  ]);
  const maximo = Math.max(...porSucursal.map((s) => Number(s.total)), 0);
  const totalAlertas = Object.values(avisos.porModulo).reduce((a, b) => a + b, 0);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-extrabold sm:text-3xl">
            <BarChart3 className="size-7 text-primary" />
            Reportes financieros
          </h1>
          <p className="mt-1 text-muted-foreground">
            {sucursal?.nombre ?? "Todas las sucursales"} · <span className="first-letter:uppercase">{fechaLarga(fecha)}</span>
          </p>
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
        <TarjetaEstadistica
          icono={CalendarDays}
          tono="verde"
          valor={formatoBs(restar(r.ventasSemana, r.gastosSemana))}
          titulo="Semana (neta)"
          detalle={`Gastos: -${formatoBs(r.gastosSemana)}`}
        />
        <TarjetaEstadistica
          icono={CalendarRange}
          tono="verde"
          valor={formatoBs(restar(r.ventasMes, r.gastosMes))}
          titulo="Mes (neta)"
          detalle={`Gastos: -${formatoBs(r.gastosMes)}`}
        />
        <TarjetaEstadistica
          icono={CircleDollarSign}
          tono="rosa"
          valor={formatoBs(restar(r.ventasAnio, r.gastosAnio))}
          titulo="Año (neta)"
          detalle={`Gastos: -${formatoBs(r.gastosAnio)}`}
        />
        <TarjetaEstadistica icono={ReceiptText} tono="neutra" valor={String(r.cantidadDia)} titulo="Cantidad de ventas" />
        <TarjetaEstadistica icono={Tag} tono="neutra" valor={formatoBs(r.descuentosDia)} titulo="Descuentos (Bs)" />
      </section>

      <section className="mt-8 rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="flex items-center gap-2.5 text-lg font-extrabold sm:text-xl">
          <Store className="size-5 text-primary" />
          Ventas por sucursal del día seleccionado
        </h2>
        {porSucursal.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">Todavía no hay sucursales registradas.</p>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {porSucursal.map((s) => (
              <Link
                key={s.id}
                href={reporte({ sucursalId: s.id })}
                className={cn("rounded-2xl border bg-secondary/50 p-4 transition-colors hover:bg-accent", s.id === sucursalId && "ring-2 ring-primary/60")}
              >
                <p className="truncate font-semibold">{s.nombre}</p>
                <p className="cifras mt-1 font-display text-2xl font-extrabold">{formatoBs(s.total)}</p>
                <p className="text-sm text-muted-foreground">
                  {s.cantidad} venta{s.cantidad === 1 ? "" : "s"}
                </p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted-foreground/15">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${maximo > 0 ? (Number(s.total) / maximo) * 100 : 0}%` }} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel icono={Medal} titulo="Más vendidos" enlace={reporte({}, "productos")}>
          {masVendidos.length === 0 && <Vacio>Sin ventas este día.</Vacio>}
          <ol className="space-y-2">
            {masVendidos.map((p, i) => (
              <li key={p.id} className="flex items-center gap-3">
                <span className="cifras flex size-7 shrink-0 items-center justify-center rounded-full bg-ficha-naranja text-xs font-extrabold text-ficha-naranja-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.nombre}</p>
                  <p className="truncate text-xs text-muted-foreground">{[p.sabor, p.presentacion].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="text-right">
                  <p className="cifras text-sm font-bold">{formatoBs(p.neto)}</p>
                  <p className="cifras text-xs text-muted-foreground">{p.unidades} unid.</p>
                </div>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel icono={Wallet} titulo={`Cajas abiertas${cajas.length ? ` (${cajas.length})` : ""}`} enlace="/admin/auditoria?vista=cajas">
          {cajas.length === 0 && <Vacio>No hay cajas abiertas ahora.</Vacio>}
          <ul className="space-y-2">
            {cajas.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/auditoria?vista=cajas&caja=${c.id}`}
                  className="flex items-center gap-3 rounded-2xl bg-muted/60 px-3 py-2 transition-colors hover:bg-accent"
                >
                  <span className="size-2 shrink-0 rounded-full bg-exito" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{c.cajero}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.sucursal} · desde {hora(c.apertura)} · {c.cantidadVentas} venta{c.cantidadVentas === 1 ? "" : "s"}
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

        <Panel icono={Bell} titulo={`Alertas activas${totalAlertas ? ` (${totalAlertas})` : ""}`}>
          {alertas.length === 0 && <Vacio>Todo en orden: no hay alertas pendientes.</Vacio>}
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
          {totalAlertas > alertas.length && <p className="mt-2 text-xs text-muted-foreground">Y {totalAlertas - alertas.length} más en la campanita.</p>}
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
