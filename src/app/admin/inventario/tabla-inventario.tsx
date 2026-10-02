"use client";

import { Boxes, PackagePlus, SlidersHorizontal, Truck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Buscador, Resaltar, SinResultados } from "@/components/busqueda/buscador";
import { coincide } from "@/lib/busqueda";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { DialogoAjuste, DialogoIngreso, type UbicacionLigera } from "@/components/inventario/dialogos-inventario";
import { Miniatura, detalleProducto } from "@/components/inventario/selector-producto";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { ProductoInventario } from "@/lib/inventario/consultas";
import { cn } from "@/lib/utils";

type Props = {
  ubicaciones: UbicacionLigera[];
  /** Columnas visibles (todas, o solo la sucursal elegida en "Viendo sucursal"). */
  columnas: UbicacionLigera[];
  productos: ProductoInventario[];
  stock: Record<string, number>;
  enCamino: Record<string, number>;
  /** ?resaltar=ID: producto a destacar al llegar desde una alerta. */
  resaltar: number | null;
  children?: React.ReactNode;
};

export function TablaInventario({ ubicaciones, columnas, productos, stock, enCamino, resaltar, children }: Props) {
  const [busqueda, setBusqueda] = useState("");
  const [soloBajo, setSoloBajo] = useState(false);
  const [ajuste, setAjuste] = useState<{ productoId: number; ubicacionId: number } | "nuevo" | null>(null);
  const [ingreso, setIngreso] = useState(false);
  const filaResaltada = useRef<HTMLTableRowElement>(null);

  const cant = (p: number, u: number) => stock[`${p}:${u}`] ?? 0;
  const bajo = (p: ProductoInventario, u: number) => p.stockMinimo > 0 && cant(p.id, u) < p.stockMinimo;
  // La bodega no vende: el stock mínimo se controla en las sucursales.
  const columnasVenta = columnas.filter((c) => c.tipo === "sucursal");

  const visibles = useMemo(() => {
    return productos.filter(
      (p) =>
        coincide(busqueda, [p.nombre, p.marca, p.sabor, p.presentacion, p.codigoBarras]) &&
        (!soloBajo || columnasVenta.some((c) => bajo(p, c.id)) || columnas.some((c) => cant(p.id, c.id) < 0)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bajo/cant derivan de stock y columnas
  }, [productos, busqueda, soloBajo, stock, columnas]);

  useEffect(() => {
    filaResaltada.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [resaltar]);

  const cantidadBajos = productos.filter((p) => columnasVenta.some((c) => bajo(p, c.id))).length;

  return (
    <>
      <EncabezadoPagina icono={Boxes} titulo="Inventario" descripcion="Stock por producto y ubicación. Toca una cantidad para ajustarla.">
        <Button variant="outline" size="lg" className="rounded-full" onClick={() => setAjuste("nuevo")}>
          <SlidersHorizontal className="size-5" />
          Ajustar stock
        </Button>
        <Button size="lg" className="rounded-full font-bold" onClick={() => setIngreso(true)}>
          <PackagePlus className="size-5" />
          Ingreso de mercadería
        </Button>
      </EncabezadoPagina>
      {children}

      <div className="flex flex-wrap items-center gap-3">
        <Buscador valor={busqueda} onCambiar={setBusqueda} etiqueta="Buscar producto" placeholder="Buscar producto, marca o código" />
        <label className="flex items-center gap-2 text-sm font-semibold">
          <Switch checked={soloBajo} onCheckedChange={setSoloBajo} />
          Solo stock bajo {cantidadBajos > 0 && <span className="cifras text-aviso-foreground rounded-full bg-aviso px-2 text-xs">{cantidadBajos}</span>}
        </label>
      </div>

      <div className="overflow-x-auto rounded-3xl border bg-card shadow-sm">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">
              <th className="sticky left-0 z-10 bg-card px-4 py-3">Producto</th>
              {columnas.map((u) => (
                <th key={u.id} className="px-3 py-3 text-right whitespace-nowrap">
                  {u.nombre}
                </th>
              ))}
              {columnas.length > 1 && <th className="px-4 py-3 text-right">Total</th>}
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => {
              const total = columnas.reduce((s, u) => s + cant(p.id, u.id), 0);
              const esResaltado = p.id === resaltar;
              return (
                <tr
                  key={p.id}
                  ref={esResaltado ? filaResaltada : undefined}
                  className={cn("border-b last:border-0", esResaltado && "fila-resaltada", !p.activo && "opacity-60")}
                >
                  <td className="sticky left-0 z-10 bg-card px-4 py-2.5">
                    <div className="flex min-w-48 items-center gap-3">
                      <Miniatura url={p.fotoUrl} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          <Resaltar texto={p.nombre} consulta={busqueda} />
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          <Resaltar texto={detalleProducto(p) || "—"} consulta={busqueda} />
                          {p.stockMinimo > 0 && ` · mín. ${p.stockMinimo}`}
                        </p>
                      </div>
                    </div>
                  </td>
                  {columnas.map((u) => {
                    const c = cant(p.id, u.id);
                    const llegando = enCamino[`${p.id}:${u.id}`];
                    return (
                      <td key={u.id} className="px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setAjuste({ productoId: p.id, ubicacionId: u.id })}
                          title={`Ajustar ${p.nombre} en ${u.nombre}`}
                          className={cn(
                            "cifras inline-flex min-w-12 flex-col items-end rounded-lg px-2.5 py-1 font-display text-base font-bold transition-colors hover:bg-accent",
                            c < 0 && "bg-destructive/15 text-destructive",
                            c === 0 && "text-muted-foreground",
                            c > 0 && u.tipo === "sucursal" && bajo(p, u.id) && "bg-aviso/25",
                          )}
                        >
                          {c}
                          {llegando > 0 && (
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                              <Truck className="size-3" />+{llegando}
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                  {columnas.length > 1 && <td className="cifras px-4 py-2 text-right font-display text-base font-extrabold">{total}</td>}
                </tr>
              );
            })}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={columnas.length + 2} className="p-6 text-center text-muted-foreground">
                  {productos.length === 0 ? (
                    "Todavía no hay productos en el catálogo."
                  ) : busqueda.trim() ? (
                    <SinResultados className="border-0 p-2" consulta={busqueda} onLimpiar={() => setBusqueda("")} />
                  ) : (
                    "No hay productos con stock bajo."
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span><span className="mr-1.5 inline-block size-2.5 rounded-sm bg-aviso/60" />Por debajo del mínimo</span>
        <span><span className="mr-1.5 inline-block size-2.5 rounded-sm bg-destructive/60" />Negativo (revisar)</span>
        <span className="flex items-center gap-1"><Truck className="size-3" /> En camino por transferencia</span>
      </p>

      {ajuste && (
        <DialogoAjuste
          productos={productos}
          ubicaciones={ubicaciones}
          stock={stock}
          inicial={ajuste === "nuevo" ? undefined : ajuste}
          onCerrar={() => setAjuste(null)}
        />
      )}
      {ingreso && <DialogoIngreso productos={productos} ubicaciones={ubicaciones} onCerrar={() => setIngreso(false)} />}
    </>
  );
}
