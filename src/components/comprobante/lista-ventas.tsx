"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Resaltar, SinResultados } from "@/components/busqueda/buscador";
import { Badge } from "@/components/ui/badge";
import { coincide } from "@/lib/busqueda";
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
  estadoPago?: "pagado" | "qr_por_confirmar";
  /** Nombres de los productos vendidos (para buscar por producto). */
  productos?: string | null;
};

export const numeroCorto = (numero: number) => numeroComprobante(numero).replace(/^0+/, "");

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-BO", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-BO", { timeZone: "America/La_Paz", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Lista de ventas tocables: abre el comprobante para reimprimir o reenviar. */
export function ListaVentas({
  ventas,
  admin,
  ventaInicial = null,
  conFecha = false,
  consulta = "",
  onLimpiar,
}: {
  /** Búsqueda vigente: resalta coincidencias y cambia el mensaje de lista vacía. */
  consulta?: string;
  onLimpiar?: () => void;
  ventas: VentaResumida[];
  /** Permite confirmar pagos QR y anular ventas desde el comprobante. */
  admin?: boolean;
  /** ?venta=ID: abre ese comprobante al entrar (desde una alerta), aunque sea de otro día. */
  ventaInicial?: number | null;
  /** Muestra día y hora (listas de varios días). */
  conFecha?: boolean;
}) {
  const [abierta, setAbierta] = useState<number | null>(ventaInicial);
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
              <span className="cifras w-16 font-mono text-sm text-muted-foreground">
                #<Resaltar texto={numeroCorto(v.numero)} consulta={consulta} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  <Resaltar texto={v.cliente ?? "Cliente sin nombre"} consulta={consulta} />
                  {v.estado === "anulada" && <Badge variant="destructive" className="ml-2">Anulada</Badge>}
                  {v.estado === "completada" && v.estadoPago === "qr_por_confirmar" && (
                    <Badge className="ml-2 bg-aviso text-aviso-foreground">QR por confirmar</Badge>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {conFecha ? fechaHora(v.fecha) : hora(v.fecha)} · {v.metodoPago === "qr" ? "QR" : "Efectivo"}
                  {v.cajero && (
                    <>
                      {" · "}
                      <Resaltar texto={v.cajero} consulta={consulta} />
                    </>
                  )}
                  {v.sucursal && (
                    <>
                      {" · "}
                      <Resaltar texto={v.sucursal} consulta={consulta} />
                    </>
                  )}
                </p>
                {consulta.trim() && v.productos && coincide(consulta, [v.productos]) && (
                  <p className="truncate text-xs text-muted-foreground">
                    <Resaltar texto={v.productos} consulta={consulta} />
                  </p>
                )}
              </div>
              <span className={cn("cifras font-display text-lg font-extrabold", v.estado === "anulada" && "line-through")}>{formatoBs(v.total)}</span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          </li>
        ))}
        {ventas.length === 0 && (
          <li>
            {consulta.trim() && onLimpiar ? (
              <SinResultados consulta={consulta} onLimpiar={onLimpiar} />
            ) : (
              <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">No hay ventas.</p>
            )}
          </li>
        )}
      </ul>
      {abierta !== null && <DialogoComprobante ventaId={abierta} admin={admin} onCerrar={() => setAbierta(null)} />}
    </>
  );
}
