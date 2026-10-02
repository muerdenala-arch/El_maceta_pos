import { ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import { ListaGastos } from "@/app/admin/gastos/lista-gastos";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { BarraFiltros } from "@/components/reportes/barra-filtros";
import { opcionesEncargado } from "@/lib/encargado-reportes";
import { requerirEncargado } from "@/lib/encargado";
import { formatoBs, hoyEnBolivia } from "@/lib/formato";
import { leerFiltros, textoRango } from "@/lib/reportes/filtros";
import { listarGastos, resumenGastos } from "@/lib/reportes/gastos";
import { CATEGORIAS_GASTO } from "@/lib/validaciones/caja";

export const metadata: Metadata = { title: "Gastos de la sucursal" };

const LIMITE = 300;

/** Gastos de la sucursal del encargado (solo consulta: anular un gasto sigue siendo del administrador). */
export default async function GastosEncargado(props: PageProps<"/encargado/gastos">) {
  const { sucursal } = await requerirEncargado();
  const hoy = hoyEnBolivia();
  const f = { ...leerFiltros(await props.searchParams, hoy, sucursal.id), sucursalId: sucursal.id };
  const [opciones, r, lista] = await Promise.all([opcionesEncargado(sucursal, { conProductos: false }), resumenGastos(f), listarGastos(f, LIMITE + 1)]);
  const varios = f.desde !== f.hasta;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <EncabezadoPagina
        icono={ReceiptText}
        titulo="Gastos de la sucursal"
        descripcion={
          <>
            {sucursal.nombre} · <span className="cifras">{textoRango(f.desde, f.hasta)}</span>
          </>
        }
      />

      <BarraFiltros sucursalFija filtros={f} hoy={hoy} opciones={opciones} campos={["cajero", "categoria"]} categorias={CATEGORIAS_GASTO} />

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

      <ListaGastos soloLectura gastos={lista.slice(0, LIMITE)} conFecha={varios} />
      {lista.length > LIMITE && <p className="text-center text-sm text-muted-foreground">Se muestran los {LIMITE} más recientes.</p>}
    </div>
  );
}
