"use client";

import { Check, PackageSearch, Search, Send, Truck, Warehouse } from "lucide-react";
import { useMemo, useState } from "react";
import { Campo } from "@/components/formularios/campo";
import { DialogoFormulario } from "@/components/formularios/dialogo-formulario";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { useAccion } from "@/components/formularios/use-accion";
import { Miniatura, detalleProducto } from "@/components/inventario/selector-producto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { ProductoInventario } from "@/lib/inventario/consultas";
import { cn } from "@/lib/utils";
import { solicitarReposicion } from "./acciones";

type Props = {
  sucursal: { id: number; nombre: string };
  bodegaId: number | null;
  productos: ProductoInventario[];
  stock: Record<string, number>;
  enCamino: Record<string, number>;
  /** productoId → mensaje de la solicitud pendiente. */
  solicitados: Record<number, string>;
};

export function ConsultaBodega({ sucursal, bodegaId, productos, stock, enCamino, solicitados }: Props) {
  const [busqueda, setBusqueda] = useState("");
  const [soloBajo, setSoloBajo] = useState(false);
  const [pidiendo, setPidiendo] = useState<ProductoInventario | null>(null);

  const aqui = (p: number) => stock[`${p}:${sucursal.id}`] ?? 0;
  const enBodega = (p: number) => (bodegaId ? (stock[`${p}:${bodegaId}`] ?? 0) : 0);
  const esBajo = (p: ProductoInventario) => aqui(p.id) <= 0 || (p.stockMinimo > 0 && aqui(p.id) < p.stockMinimo);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos.filter(
      (p) =>
        (!q || [p.nombre, p.marca, p.sabor, p.presentacion, p.codigoBarras].some((t) => t?.toLowerCase().includes(q))) &&
        (!soloBajo || esBajo(p)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- esBajo deriva de stock
  }, [productos, busqueda, soloBajo, stock]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <EncabezadoPagina icono={Warehouse} titulo="Bodega" descripcion={`Stock de ${sucursal.nombre} y de la bodega central`} />

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative block w-full max-w-sm">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto o código" className="h-12 rounded-full pl-10 text-base" />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <Switch checked={soloBajo} onCheckedChange={setSoloBajo} />
          Solo lo que falta
        </label>
      </div>

      <ul className="space-y-2">
        {visibles.map((p) => {
          const c = aqui(p.id);
          const llegando = enCamino[`${p.id}:${sucursal.id}`] ?? 0;
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-3xl border bg-card p-3 shadow-sm sm:px-4">
              <Miniatura url={p.fotoUrl} className="size-14 rounded-2xl" />
              <div className="min-w-0 flex-1 basis-40">
                <p className="font-bold leading-snug">{p.nombre}</p>
                <p className="truncate text-sm text-muted-foreground">{detalleProducto(p) || "—"}</p>
                {llegando > 0 && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-exito">
                    <Truck className="size-3.5" /> {llegando} en camino
                  </p>
                )}
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-[11px] font-bold text-muted-foreground uppercase">Aquí</p>
                  <p className={cn("cifras font-display text-2xl font-extrabold", c <= 0 ? "text-destructive" : esBajo(p) && "text-aviso-foreground dark:text-aviso")}>
                    {c}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[11px] font-bold text-muted-foreground uppercase">Bodega</p>
                  <p className="cifras font-display text-2xl font-extrabold text-muted-foreground">{enBodega(p.id)}</p>
                </div>
                {solicitados[p.id] ? (
                  <span className="flex w-28 items-center justify-center gap-1 rounded-full bg-ficha-verde px-3 py-2 text-xs font-bold text-ficha-verde-foreground" title={solicitados[p.id]}>
                    <Check className="size-4" /> Solicitado
                  </span>
                ) : (
                  <Button variant={esBajo(p) ? "default" : "outline"} className="w-28 rounded-full" onClick={() => setPidiendo(p)}>
                    <Send className="size-4" /> Pedir
                  </Button>
                )}
              </div>
            </li>
          );
        })}
        {visibles.length === 0 && (
          <li className="flex flex-col items-center gap-2 rounded-3xl border border-dashed p-10 text-center text-muted-foreground">
            <PackageSearch className="size-8" />
            No hay productos que coincidan.
          </li>
        )}
      </ul>

      {pidiendo && <DialogoSolicitud producto={pidiendo} sugerido={Math.max(1, pidiendo.stockMinimo * 2 - aqui(pidiendo.id))} onCerrar={() => setPidiendo(null)} />}
    </div>
  );
}

function DialogoSolicitud({ producto, sugerido, onCerrar }: { producto: ProductoInventario; sugerido: number; onCerrar: () => void }) {
  const [cantidad, setCantidad] = useState(String(sugerido));
  const [nota, setNota] = useState("");
  const enviar = useAccion(solicitarReposicion, { mensajeExito: "Solicitud enviada al administrador", alExito: onCerrar });

  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo="Solicitar reposición"
      descripcion={producto.nombre}
      pendiente={enviar.pendiente}
      textoGuardar="Enviar solicitud"
      onGuardar={() => enviar.ejecutar({ productoId: producto.id, cantidad, nota })}
    >
      <Campo etiqueta="Cantidad que necesitas" error={enviar.campos.cantidad}>
        {(p) => (
          <Input
            {...p}
            inputMode="numeric"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value.replace(/\D/g, "").slice(0, 5))}
            className="cifras h-12 max-w-32 text-xl font-bold"
            autoFocus
          />
        )}
      </Campo>
      <Campo etiqueta="Nota" opcional error={enviar.campos.nota}>
        {(p) => <Input {...p} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} placeholder="Ej. clientes lo piden seguido" />}
      </Campo>
    </DialogoFormulario>
  );
}
