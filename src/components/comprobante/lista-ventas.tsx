"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { numeroComprobante } from "@/lib/comprobante/datos";
import { formatoBs } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { DialogoComprobante } from "./dialogo-comprobante";

export type VentaResumida = {
  id: number;
  numero: number;
  fecha: string;
  total: string;
  metodoPago: "efectivo" | "qr";
  estado: "completada" | "anulada";
  cliente: string | null;
  cajero?: string;
  sucursal?: string;
};

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-BO", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Lista de ventas tocables: abre el comprobante para reimprimir o reenviar. */
export function ListaVentas({ ventas }: { ventas: VentaResumida[] }) {
  const [abierta, setAbierta] = useState<number | null>(null);
  return (
    <>
      <ul className="space-y-2">
        {ventas.map((v) => (
          <li key={v.id}>
            <button
              type="button"
              onClick={() => setAbierta(v.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left shadow-sm transition-colors hover:bg-accent sm:px-4",
                v.estado === "anulada" && "opacity-60",
              )}
            >
              <span className="cifras w-16 font-mono text-sm text-muted-foreground">#{numeroComprobante(v.numero).replace(/^0+/, "")}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {v.cliente ?? "Cliente sin nombre"}
                  {v.estado === "anulada" && <Badge variant="destructive" className="ml-2">Anulada</Badge>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {hora(v.fecha)} · {v.metodoPago === "qr" ? "QR" : "Efectivo"}
                  {v.cajero && ` · ${v.cajero}`}
                  {v.sucursal && ` · ${v.sucursal}`}
                </p>
              </div>
              <span className={cn("cifras font-display text-lg font-extrabold", v.estado === "anulada" && "line-through")}>{formatoBs(v.total)}</span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          </li>
        ))}
        {ventas.length === 0 && <li className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">No hay ventas.</li>}
      </ul>
      {abierta !== null && <DialogoComprobante ventaId={abierta} onCerrar={() => setAbierta(null)} />}
    </>
  );
}
