"use client";

/* eslint-disable @next/next/no-img-element -- miniaturas propias */
import { Check, ChevronsUpDown, Package } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Resaltar } from "@/components/busqueda/buscador";
import { coincide } from "@/lib/busqueda";

export type ProductoLigero = {
  id: number;
  nombre: string;
  marca: string | null;
  sabor: string | null;
  presentacion: string | null;
  codigoBarras: string | null;
  fotoUrl: string | null;
};

export const detalleProducto = (p: Pick<ProductoLigero, "marca" | "sabor" | "presentacion">) =>
  [p.marca, p.sabor, p.presentacion].filter(Boolean).join(" · ");

export function Miniatura({ url, className }: { url: string | null; className?: string }) {
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted", className)}>
      {url ? <img src={url} alt="" loading="lazy" className="size-full object-cover" /> : <Package className="size-4 text-muted-foreground" />}
    </span>
  );
}

/**
 * Buscador de productos por nombre, marca, sabor, presentación o código de barras.
 * Con el lector: escanear y presionar Enter elige el producto cuyo código coincide exactamente.
 */
export function SelectorProducto({
  productos,
  valor,
  onCambiar,
  deshabilitados = [],
  extra,
  id,
  invalido,
}: {
  productos: ProductoLigero[];
  valor: number | null;
  onCambiar: (id: number) => void;
  /** Ya elegidos en otras filas. */
  deshabilitados?: number[];
  /** Texto adicional a la derecha de cada opción (p. ej. stock disponible). */
  extra?: (p: ProductoLigero) => React.ReactNode;
  id?: string;
  invalido?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const elegido = productos.find((p) => p.id === valor);

  const elegir = (idProducto: number) => {
    onCambiar(idProducto);
    setAbierto(false);
    setBusqueda("");
  };

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={abierto}
          aria-invalid={invalido || undefined}
          className="h-auto min-h-11 w-full justify-between gap-2 px-2.5 py-1.5 text-left font-normal"
        >
          {elegido ? (
            <span className="flex min-w-0 items-center gap-2.5">
              <Miniatura url={elegido.fotoUrl} className="size-8" />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{elegido.nombre}</span>
                <span className="block truncate text-xs text-muted-foreground">{detalleProducto(elegido)}</span>
              </span>
            </span>
          ) : (
            <span className="px-1 text-muted-foreground">Buscar producto o escanear código…</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command
          filter={(value, search) => {
            const p = productos.find((x) => String(x.id) === value);
            if (!p) return 0;
            return coincide(search, [p.nombre, p.marca, p.sabor, p.presentacion, p.codigoBarras]) ? 1 : 0;
          }}
        >
          <CommandInput
            placeholder="Nombre, marca o código de barras"
            value={busqueda}
            onValueChange={setBusqueda}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const porCodigo = productos.find((p) => p.codigoBarras && p.codigoBarras === busqueda.trim());
              if (porCodigo && !deshabilitados.includes(porCodigo.id)) {
                e.preventDefault();
                elegir(porCodigo.id);
              }
            }}
          />
          <CommandList>
            <CommandEmpty>No se encontraron resultados para “{busqueda.trim()}”</CommandEmpty>
            <CommandGroup>
              {productos.map((p) => (
                <CommandItem
                  key={p.id}
                  value={String(p.id)}
                  disabled={deshabilitados.includes(p.id) && p.id !== valor}
                  onSelect={() => elegir(p.id)}
                  className="gap-2.5"
                >
                  <Miniatura url={p.fotoUrl} className="size-8" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      <Resaltar texto={p.nombre} consulta={busqueda} />
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      <Resaltar texto={detalleProducto(p)} consulta={busqueda} />
                    </span>
                  </span>
                  {extra?.(p)}
                  {p.id === valor && <Check className="size-4 text-primary" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
