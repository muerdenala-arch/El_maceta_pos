"use client";

import { ReceiptText } from "lucide-react";
import { ListaVentas, type VentaResumida } from "@/components/comprobante/lista-ventas";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { sumar } from "@/lib/dinero";
import { formatoBs } from "@/lib/formato";

export function ListaVentasDia({ ventas }: { ventas: VentaResumida[] }) {
  const completadas = ventas.filter((v) => v.estado === "completada");
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <EncabezadoPagina
        icono={ReceiptText}
        titulo="Ventas de hoy"
        descripcion={`${completadas.length} venta${completadas.length === 1 ? "" : "s"} · ${formatoBs(completadas.length ? sumar(...completadas.map((v) => v.total)) : "0")}`}
      />
      <p className="text-sm text-muted-foreground">Toca una venta para reimprimir, descargar o reenviar su comprobante.</p>
      <ListaVentas ventas={ventas} />
    </div>
  );
}
