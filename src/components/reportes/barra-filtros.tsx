"use client";

import { FileSpreadsheet, FileText, FilterX, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { SelectorProducto } from "@/components/inventario/selector-producto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { aParametros, RANGOS_RAPIDOS, rangoActivo, rangoRapido, type FiltrosReporte } from "@/lib/reportes/filtros";
import type { OpcionesFiltros } from "@/lib/reportes/opciones";
import { cn } from "@/lib/utils";

type Campo = "cajero" | "metodo" | "producto" | "categoria";

/**
 * Filtros de un reporte en la URL (se pueden compartir y sobreviven a recargas) y botones de exportación.
 * Conserva `?vista=` (pestaña actual) y reinicia la página.
 */
export function BarraFiltros({
  filtros,
  hoy,
  opciones,
  campos,
  categorias = [],
  exportar,
}: {
  filtros: FiltrosReporte;
  hoy: string;
  opciones: OpcionesFiltros;
  campos: Campo[];
  categorias?: readonly string[];
  /** Reporte que exportan los botones Excel/PDF. */
  exportar?: "ventas" | "gastos";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [cargando, iniciar] = useTransition();
  const vista = params.get("vista");

  const ir = (cambios: Partial<FiltrosReporte>) => {
    const nuevos = { ...filtros, ...cambios };
    // Un cajero de otra sucursal ya no corresponde al cambiar la sucursal.
    if (cambios.sucursalId !== undefined && nuevos.cajeroId) {
      const cajero = opciones.cajeros.find((c) => c.id === nuevos.cajeroId);
      if (nuevos.sucursalId && cajero?.sucursalId !== nuevos.sucursalId) nuevos.cajeroId = null;
    }
    iniciar(() => router.replace(`${pathname}?${aParametros(nuevos, { vista })}`, { scroll: false }));
  };

  const activo = rangoActivo(filtros.desde, filtros.hasta, hoy);
  const cajeros = opciones.cajeros.filter((c) => !filtros.sucursalId || c.sucursalId === filtros.sucursalId || c.id === filtros.cajeroId);
  const hayFiltros = filtros.cajeroId || filtros.metodo || filtros.productoId || filtros.categoria;
  const enlace = (formato: "xlsx" | "pdf") => `/api/admin/exportar?${aParametros(filtros, { reporte: exportar, formato })}`;

  return (
    <section aria-label="Filtros" className={cn("space-y-3 rounded-3xl border bg-card p-4 shadow-sm transition-opacity", cargando && "opacity-60")}>
      <div className="sin-barra -mx-4 flex gap-2 overflow-x-auto px-4">
        {RANGOS_RAPIDOS.map((r) => (
          <button
            key={r.valor}
            type="button"
            onClick={() => ir(rangoRapido(r.valor, hoy))}
            aria-pressed={activo === r.valor}
            className={cn(
              "h-9 shrink-0 rounded-full border px-4 text-sm font-bold transition-colors",
              activo === r.valor ? "border-transparent bg-nav-activo text-nav-activo-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {r.titulo}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <label className="grid gap-1 text-xs font-bold text-muted-foreground">
          Desde
          <Input type="date" value={filtros.desde} max={filtros.hasta} onChange={(e) => e.target.value && ir({ desde: e.target.value })} className="h-10" />
        </label>
        <label className="grid gap-1 text-xs font-bold text-muted-foreground">
          Hasta
          <Input type="date" value={filtros.hasta} min={filtros.desde} max={hoy} onChange={(e) => e.target.value && ir({ hasta: e.target.value })} className="h-10" />
        </label>

        <Filtro etiqueta="Sucursal">
          <Select value={filtros.sucursalId ? String(filtros.sucursalId) : "todas"} onValueChange={(v) => ir({ sucursalId: v === "todas" ? null : Number(v) })}>
            <SelectTrigger className="h-10! w-full" aria-label="Sucursal">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las sucursales</SelectItem>
              {opciones.sucursales.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Filtro>

        {campos.includes("cajero") && (
          <Filtro etiqueta="Cajero">
            <Select value={filtros.cajeroId ? String(filtros.cajeroId) : "todos"} onValueChange={(v) => ir({ cajeroId: v === "todos" ? null : Number(v) })}>
              <SelectTrigger className="h-10! w-full" aria-label="Cajero">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los cajeros</SelectItem>
                {cajeros.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.nombre}
                    {!c.activo && " (inactivo)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Filtro>
        )}

        {campos.includes("metodo") && (
          <Filtro etiqueta="Método de pago">
            <Select value={filtros.metodo ?? "todos"} onValueChange={(v) => ir({ metodo: v === "todos" ? null : (v as "efectivo" | "qr") })}>
              <SelectTrigger className="h-10! w-full" aria-label="Método de pago">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Efectivo y QR</SelectItem>
                <SelectItem value="efectivo">Solo efectivo</SelectItem>
                <SelectItem value="qr">Solo QR</SelectItem>
              </SelectContent>
            </Select>
          </Filtro>
        )}

        {campos.includes("categoria") && (
          <Filtro etiqueta="Categoría">
            <Select value={filtros.categoria ?? "todas"} onValueChange={(v) => ir({ categoria: v === "todas" ? null : v })}>
              <SelectTrigger className="h-10! w-full" aria-label="Categoría">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las categorías</SelectItem>
                {categorias.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Filtro>
        )}

        {campos.includes("producto") && (
          <Filtro etiqueta="Producto" className="sm:col-span-2">
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <SelectorProducto productos={opciones.productos} valor={filtros.productoId} onCambiar={(id) => ir({ productoId: id })} />
              </div>
              {filtros.productoId && (
                <Button variant="ghost" size="icon" className="size-11" aria-label="Quitar filtro de producto" onClick={() => ir({ productoId: null })}>
                  <X className="size-4" />
                </Button>
              )}
            </div>
          </Filtro>
        )}
      </div>

      {(hayFiltros || exportar) && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          {hayFiltros && (
            <Button variant="ghost" size="sm" onClick={() => ir({ cajeroId: null, metodo: null, productoId: null, categoria: null })}>
              <FilterX className="size-4" /> Quitar filtros
            </Button>
          )}
          {exportar && (
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={enlace("xlsx")} download>
                  <FileSpreadsheet className="size-4 text-exito" /> Excel
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={enlace("pdf")} download>
                  <FileText className="size-4 text-destructive" /> PDF
                </a>
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Filtro({ etiqueta, className, children }: { etiqueta: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("col-span-2 grid content-start gap-1 sm:col-span-1", className)}>
      <span className="text-xs font-bold text-muted-foreground">{etiqueta}</span>
      {children}
    </div>
  );
}
