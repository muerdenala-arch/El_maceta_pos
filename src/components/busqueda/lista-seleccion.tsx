"use client";

import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import { Buscador, Resaltar, SinResultados } from "@/components/busqueda/buscador";
import { coincide } from "@/lib/busqueda";
import { cn } from "@/lib/utils";

export type OpcionSeleccion = {
  id: number;
  nombre: string;
  /** Texto gris al lado del nombre, p. ej. la categoría: "Agua en botella (Bebidas)". */
  detalle?: string | null;
  /** Más textos por los que se puede buscar (marca, código de barras…). */
  buscarPor?: (string | null | undefined)[];
};

/**
 * Lista con buscador para elegir uno o varios elementos (productos, categorías…): la lista siempre está a la vista,
 * se filtra mientras se escribe y cada toque marca o desmarca sin borrar lo escrito, así se sigue eligiendo.
 * `unica`: elegir uno solo (tocar otro lo reemplaza).
 */
export function ListaSeleccion({
  opciones,
  elegidos,
  onAlternar,
  etiqueta,
  placeholder = "Escribe para buscar y toca para agregar…",
  unica = false,
  invalida = false,
  alto = "max-h-72",
}: {
  opciones: OpcionSeleccion[];
  elegidos: readonly number[];
  onAlternar: (id: number) => void;
  etiqueta: string;
  placeholder?: string;
  unica?: boolean;
  invalida?: boolean;
  alto?: string;
}) {
  const [busqueda, setBusqueda] = useState("");
  const marcados = useMemo(() => new Set(elegidos), [elegidos]);
  const visibles = useMemo(() => opciones.filter((o) => coincide(busqueda, [o.nombre, o.detalle, ...(o.buscarPor ?? [])])), [opciones, busqueda]);

  return (
    <div className={cn("space-y-2 rounded-2xl border bg-card p-3", invalida && "border-destructive")}>
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-sm font-bold">{etiqueta}</p>
        {!unica && marcados.size > 0 && (
          <p className="cifras text-xs font-semibold text-primary">
            {marcados.size} elegido{marcados.size === 1 ? "" : "s"}
          </p>
        )}
      </div>
      <Buscador className="max-w-none" valor={busqueda} onCambiar={setBusqueda} etiqueta={`Buscar en ${etiqueta.toLowerCase()}`} placeholder={placeholder} />
      {visibles.length === 0 ? (
        <SinResultados className="p-5" consulta={busqueda} onLimpiar={() => setBusqueda("")} />
      ) : (
        <ul role={unica ? "radiogroup" : "group"} aria-label={etiqueta} className={cn("divide-y overflow-y-auto overscroll-contain rounded-xl border bg-background", alto)}>
          {visibles.map((o) => {
            const elegido = marcados.has(o.id);
            return (
              <li key={o.id}>
                <button
                  type="button"
                  role={unica ? "radio" : "checkbox"}
                  aria-checked={elegido}
                  onClick={() => onAlternar(o.id)}
                  className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent", elegido && "bg-primary/8")}
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-semibold">
                      <Resaltar texto={o.nombre} consulta={busqueda} />
                    </span>
                    {o.detalle && (
                      <span className="ml-1.5 text-sm text-muted-foreground">
                        (<Resaltar texto={o.detalle} consulta={busqueda} />)
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      elegido ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                    )}
                    aria-hidden
                  >
                    {elegido && <Check className="size-4" strokeWidth={3} />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
