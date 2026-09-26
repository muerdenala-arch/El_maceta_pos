import { eq } from "drizzle-orm";
import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  CircleDollarSign,
  ReceiptText,
  Store,
  Tag,
  TrendingUp,
} from "lucide-react";
import type { Metadata } from "next";
import { db } from "@/db";
import { sucursales } from "@/db/schema";
import { SelectorFecha } from "@/components/panel/selector-fecha";
import { TarjetaEstadistica } from "@/components/panel/tarjeta-estadistica";
import { requerirSesion } from "@/lib/auth/sesion";
import { obtenerResumen, ventasPorSucursal } from "@/lib/consultas/resumen";
import { restar } from "@/lib/dinero";
import { fechaLarga, fechaValida, formatoBs, hoyEnBolivia } from "@/lib/formato";
import { obtenerSucursalVista } from "@/lib/sucursal-vista";

export const metadata: Metadata = { title: "Inicio" };

export default async function PanelInicio(props: PageProps<"/admin/dashboard">) {
  const sesion = await requerirSesion("admin");
  const hoy = hoyEnBolivia();
  const fecha = fechaValida((await props.searchParams).fecha) ?? hoy;
  const sucursalId = await obtenerSucursalVista(sesion);

  const [r, porSucursal, [sucursal]] = await Promise.all([
    obtenerResumen(fecha, sucursalId),
    ventasPorSucursal(fecha),
    sucursalId
      ? db.select({ nombre: sucursales.nombre }).from(sucursales).where(eq(sucursales.id, sucursalId))
      : Promise.resolve([undefined]),
  ]);
  const maximo = Math.max(...porSucursal.map((s) => Number(s.total)), 0);

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
              <div
                key={s.id}
                className={
                  "rounded-2xl border bg-secondary/50 p-4 " +
                  (s.id === sucursalId ? "ring-2 ring-primary/60" : "")
                }
              >
                <p className="truncate font-semibold">{s.nombre}</p>
                <p className="cifras mt-1 font-display text-2xl font-extrabold">{formatoBs(s.total)}</p>
                <p className="text-sm text-muted-foreground">
                  {s.cantidad} venta{s.cantidad === 1 ? "" : "s"}
                </p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted-foreground/15">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${maximo > 0 ? (Number(s.total) / maximo) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
