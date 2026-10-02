import { ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { BarraFiltros } from "@/components/reportes/barra-filtros";
import { requerirSesion } from "@/lib/auth/sesion";
import { formatoBs, hoyEnBolivia } from "@/lib/formato";
import { leerFiltros, textoRango } from "@/lib/reportes/filtros";
import { listarGastos, resumenGastos } from "@/lib/reportes/gastos";
import { opcionesFiltros } from "@/lib/reportes/opciones";
import { obtenerSucursalVista } from "@/lib/sucursal-vista";
import { CATEGORIAS_GASTO } from "@/lib/validaciones/caja";
import { AgregarGasto } from "@/components/gastos/agregar-gasto";
import { listarUbicaciones } from "@/lib/inventario/consultas";
import { ListaGastos } from "./lista-gastos";

export const metadata: Metadata = { title: "Gastos diarios" };

const LIMITE = 300;

const diaCorto = (dia: string) =>
  new Date(`${dia}T12:00:00Z`).toLocaleDateString("es-BO", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "short" });

/** Gasto diario (sección 4.3 del plan): por cajero y sucursal, totales por día y categoría, exportación. */
export default async function PaginaGastosAdmin(props: PageProps<"/admin/gastos">) {
  const sesion = await requerirSesion("admin");
  const hoy = hoyEnBolivia();
  const f = leerFiltros(await props.searchParams, hoy, await obtenerSucursalVista(sesion));

  const [opciones, r, lista, ubicaciones] = await Promise.all([opcionesFiltros({ conProductos: false }), resumenGastos(f), listarGastos(f, LIMITE + 1), listarUbicaciones()]);
  const sucursal = f.sucursalId ? opciones.sucursales.find((s) => s.id === f.sucursalId)?.nombre : "Todas las sucursales";
  const varios = f.desde !== f.hasta;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <EncabezadoPagina
        icono={ReceiptText}
        titulo="Gastos diarios"
        descripcion={
          <>
            {sucursal ?? "Sucursal"} · <span className="cifras">{textoRango(f.desde, f.hasta)}</span>
          </>
        }
      >
        <AgregarGasto sucursales={ubicaciones.map((u) => ({ id: u.id, nombre: u.nombre }))} sucursalPorDefecto={f.sucursalId} />
      </EncabezadoPagina>

      <BarraFiltros filtros={f} hoy={hoy} opciones={opciones} campos={["cajero", "categoria"]} categorias={CATEGORIAS_GASTO} exportar="gastos" />

      <section className="grid gap-3 sm:grid-cols-[16rem_1fr]">
        <div className="rounded-3xl bg-ficha-rosa p-5 text-ficha-rosa-foreground">
          <p className="font-bold">{varios ? "Total del periodo" : "Total del día"}</p>
          <p className="cifras mt-1 font-display text-3xl font-extrabold">{formatoBs(r.total)}</p>
          <p className="text-sm opacity-80">
            {r.cantidad} gasto{r.cantidad === 1 ? "" : "s"}
            {r.anulados > 0 && ` · ${r.anulados} anulado${r.anulados === 1 ? "" : "s"}`}
          </p>
        </div>
        <ul className="flex flex-wrap content-start gap-2 rounded-3xl border bg-card p-4" aria-label="Por categoría">
          {r.porCategoria.map((c) => (
            <li key={c.categoria} className="rounded-2xl bg-muted px-4 py-2">
              <p className="text-xs font-bold text-muted-foreground uppercase">
                {c.categoria} · {c.cantidad}
              </p>
              <p className="cifras font-display text-lg font-extrabold">{formatoBs(c.total)}</p>
            </li>
          ))}
          {r.porCategoria.length === 0 && <li className="self-center text-sm text-muted-foreground">Sin gastos con estos filtros.</li>}
        </ul>
      </section>

      {varios && r.porDia.length > 0 && (
        <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
          <h2 className="text-sm font-bold text-muted-foreground">Por día</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {r.porDia.map((d) => (
              <li key={d.dia} className="flex items-center justify-between gap-3 rounded-2xl bg-muted/60 px-4 py-2 text-sm">
                <span className="font-semibold first-letter:uppercase">{diaCorto(d.dia)}</span>
                <span className="cifras font-bold">
                  {formatoBs(d.total)} <span className="font-normal text-muted-foreground">· {d.cantidad}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ListaGastos gastos={lista.slice(0, LIMITE)} conFecha={varios} />
      {lista.length > LIMITE && (
        <p className="text-center text-sm text-muted-foreground">Se muestran los {LIMITE} más recientes; el Excel incluye todos.</p>
      )}
    </div>
  );
}
