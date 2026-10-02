"use client";

import { Minus, Package, Pill, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ProductoPos } from "@/lib/caja/consultas";
import { deCentavos, aCentavos } from "@/lib/dinero";
import { formatoBs } from "@/lib/formato";
import { factorEnvase, nombreEnvase, nombreUnidad, textoStock } from "@/lib/inventario/fraccion";
import { cn } from "@/lib/utils";

/**
 * Producto fraccionado: el cajero elige "frasco completo" o "por cápsulas" y la cantidad.
 * `disponible` = unidades sueltas que quedan sin contar lo que ya está en el carrito.
 */
export function DialogoFraccion({
  producto,
  disponible,
  onAgregar,
  onCerrar,
}: {
  producto: ProductoPos;
  disponible: number;
  onAgregar: (cantidad: number, fraccion: boolean) => void;
  onCerrar: () => void;
}) {
  const porEnvase = factorEnvase(producto);
  const maxEnvases = Math.floor(disponible / porEnvase);
  const [fraccion, setFraccion] = useState(maxEnvases === 0);
  const [texto, setTexto] = useState("1");
  const maximo = fraccion ? disponible : maxEnvases;
  const cantidad = /^\d+$/.test(texto) ? Number(texto) : 0;
  const valida = cantidad >= 1 && cantidad <= maximo;
  const precio = fraccion ? (producto.precioUnidad ?? "0") : producto.precioVenta;
  const total = deCentavos(aCentavos(precio) * BigInt(cantidad));
  const envase = nombreEnvase(producto);
  const unidad = (n: number) => nombreUnidad(producto, n);

  const elegir = (f: boolean) => {
    setFraccion(f);
    setTexto("1");
  };
  const opcion = (f: boolean, titulo: string, detalle: string, Icono: typeof Package, deshabilitada: boolean) => (
    <button
      type="button"
      role="radio"
      aria-checked={fraccion === f}
      disabled={deshabilitada}
      onClick={() => elegir(f)}
      className={cn(
        "flex flex-1 flex-col items-center gap-1 rounded-2xl border p-4 text-center transition-colors disabled:opacity-40",
        fraccion === f ? "border-primary bg-primary/8" : "hover:bg-accent",
      )}
    >
      <Icono className="size-6 text-primary" />
      <span className="font-bold">{titulo}</span>
      <span className="cifras text-sm text-muted-foreground">{detalle}</span>
    </button>
  );

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-extrabold">{producto.nombre}</DialogTitle>
          <DialogDescription>Disponible: {textoStock(disponible, producto)}</DialogDescription>
        </DialogHeader>

        <div className="flex gap-3" role="radiogroup" aria-label="Cómo se vende">
          {opcion(false, `${envase[0].toUpperCase()}${envase.slice(1)} completo`, `${formatoBs(producto.precioVenta)} · ${porEnvase} ${unidad(porEnvase)}`, Package, maxEnvases === 0)}
          {opcion(true, `Por ${unidad(2)}`, `${formatoBs(producto.precioUnidad ?? "0")} c/u`, Pill, disponible === 0)}
        </div>

        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="icon" className="size-12 rounded-xl" aria-label="Menos" disabled={cantidad <= 1} onClick={() => setTexto(String(Math.max(1, cantidad - 1)))}>
            <Minus className="size-5" />
          </Button>
          <label className="text-center">
            <span className="sr-only">Cantidad</span>
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value.replace(/\D/g, "").slice(0, 5))}
              onFocus={(e) => e.target.select()}
              inputMode="numeric"
              aria-label="Cantidad"
              className="cifras w-28 rounded-xl border bg-background py-2 text-center font-display text-3xl font-extrabold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <span className="mt-1 block text-xs text-muted-foreground">{fraccion ? unidad(cantidad) : nombreEnvase(producto, cantidad)}</span>
          </label>
          <Button variant="outline" size="icon" className="size-12 rounded-xl" aria-label="Más" disabled={cantidad >= maximo} onClick={() => setTexto(String(Math.min(maximo, cantidad + 1)))}>
            <Plus className="size-5" />
          </Button>
        </div>
        {cantidad > maximo && (
          <p className="text-center text-sm text-destructive" role="alert">
            Solo hay {fraccion ? `${maximo} ${unidad(maximo)}` : `${maximo} ${nombreEnvase(producto, maximo)} completo${maximo === 1 ? "" : "s"}`}
          </p>
        )}

        <Button size="lg" className="h-13 w-full rounded-2xl text-base font-bold" disabled={!valida} onClick={() => onAgregar(cantidad, fraccion)}>
          Agregar · <span className="cifras">{formatoBs(total)}</span>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
