"use client";

import { useState } from "react";
import { Buscador, SinResultados, useBusquedaUrl } from "@/components/busqueda/buscador";
import { ListaVentas } from "@/components/comprobante/lista-ventas";
import { coincide } from "@/lib/busqueda";
import type { VentasCajero, VentasProducto } from "@/lib/reportes/ventas";
import { TablaCajeros, TablaProductos } from "./tablas";

/** Ventas del reporte: la búsqueda va al servidor (`?q=`) porque la lista está paginada. */
export function VentasConBuscador(props: Omit<React.ComponentProps<typeof ListaVentas>, "consulta" | "onLimpiar">) {
  const { valor, cambiar } = useBusquedaUrl("q");
  return (
    <div className="space-y-3">
      <Buscador valor={valor} onCambiar={cambiar} etiqueta="Buscar ventas" placeholder="N.º de venta, cliente, teléfono o cajero" />
      <ListaVentas {...props} consulta={valor} onLimpiar={() => cambiar("")} />
    </div>
  );
}

export function ProductosConBuscador({ filas, sinCostos }: { filas: VentasProducto[]; sinCostos?: boolean }) {
  const [busqueda, setBusqueda] = useState("");
  const visibles = filas.filter((p) => coincide(busqueda, [p.nombre, p.marca, p.sabor, p.presentacion]));
  return (
    <div className="space-y-3">
      {filas.length > 0 && <Buscador valor={busqueda} onCambiar={setBusqueda} etiqueta="Buscar productos" placeholder="Producto, marca o presentación" />}
      {filas.length > 0 && visibles.length === 0 ? (
        <SinResultados consulta={busqueda} onLimpiar={() => setBusqueda("")} />
      ) : (
        <TablaProductos filas={visibles} consulta={busqueda} sinCostos={sinCostos} />
      )}
    </div>
  );
}

export function CajerosConBuscador({ filas }: { filas: VentasCajero[] }) {
  const [busqueda, setBusqueda] = useState("");
  const visibles = filas.filter((c) => coincide(busqueda, [c.cajero, c.sucursal]));
  return (
    <div className="space-y-3">
      {filas.length > 0 && <Buscador valor={busqueda} onCambiar={setBusqueda} etiqueta="Buscar cajeros" placeholder="Cajero o sucursal" />}
      {filas.length > 0 && visibles.length === 0 ? (
        <SinResultados consulta={busqueda} onLimpiar={() => setBusqueda("")} />
      ) : (
        <TablaCajeros filas={visibles} consulta={busqueda} />
      )}
    </div>
  );
}
