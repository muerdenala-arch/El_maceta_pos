"use client";

import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { useState } from "react";
import { useResaltado } from "@/components/alertas/use-resaltado";
import { Badge } from "@/components/ui/badge";
import type { CajaAuditada } from "@/lib/caja/auditadas";
import { aCentavos, sumar } from "@/lib/dinero";
import { formatoBs } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { FiltroFechas } from "./filtro-fechas";
import { Buscador, Resaltar, SinResultados } from "@/components/busqueda/buscador";
import { coincide } from "@/lib/busqueda";

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-BO", { timeZone: "America/La_Paz", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Aperturas y cierres de caja: esperado vs. contado y diferencia (sección 4.11 del plan). */
export function AuditoriaCajas({
  cajas,
  desde,
  hasta,
  hoy,
  resaltar,
}: {
  cajas: CajaAuditada[];
  desde: string;
  hasta: string;
  hoy: string;
  resaltar: number | null;
}) {
  const resaltado = useResaltado<HTMLTableRowElement>(resaltar);

  const [busqueda, setBusqueda] = useState("");
  const visibles = cajas.filter((c) => coincide(busqueda, [c.cajero, c.sucursal, c.estado === "abierta" ? "Abierta" : "Cerrada"]));

  const cerradas = cajas.filter((c) => c.estado === "cerrada" && c.diferencia !== null);
  const conDiferencia = cerradas.filter((c) => aCentavos(c.diferencia!) !== 0n);
  const neto = cerradas.length ? sumar(...cerradas.map((c) => c.diferencia!)) : "0";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <FiltroFechas desde={desde} hasta={hasta} hoy={hoy} />
          <Buscador className="w-64" valor={busqueda} onCambiar={setBusqueda} etiqueta="Buscar cajas" placeholder="Cajero o sucursal" />
        </div>
        <p className="text-sm text-muted-foreground">
          {cajas.length} caja{cajas.length === 1 ? "" : "s"} · {conDiferencia.length} con diferencia · neto{" "}
          <strong className={cn("cifras", aCentavos(neto) < 0n ? "text-destructive" : "text-foreground")}>{formatoBs(neto)}</strong>
        </p>
      </div>

      <div className="overflow-x-auto rounded-3xl border bg-card shadow-sm">
        <table className="w-full min-w-[64rem] text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3">Cajero · sucursal</th>
              <th className="px-3 py-3">Apertura → cierre</th>
              <th className="px-3 py-3 text-right">Inicial</th>
              <th className="px-3 py-3 text-right">Efectivo</th>
              <th className="px-3 py-3 text-right">QR</th>
              <th className="px-3 py-3 text-right">Gastos</th>
              <th className="px-3 py-3 text-right">Esperado</th>
              <th className="px-3 py-3 text-right">Contado</th>
              <th className="px-4 py-3 text-right">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((c) => {
              const dif = c.diferencia !== null ? aCentavos(c.diferencia) : null;
              return (
                <tr key={c.id} ref={c.id === resaltar ? resaltado.ref : undefined} className={cn("border-b last:border-0", resaltado.activo && c.id === resaltar && "fila-resaltada")}>
                  <td className="px-4 py-3">
                    <p className="font-semibold">
                      <Resaltar texto={c.cajero} consulta={busqueda} />
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <Resaltar texto={c.sucursal} consulta={busqueda} />
                    </p>
                  </td>
                  <td className="cifras px-3 py-3 whitespace-nowrap text-muted-foreground">
                    {fechaHora(c.apertura)} → {c.cierre ? fechaHora(c.cierre) : <Badge className="bg-exito text-exito-foreground">Abierta</Badge>}
                  </td>
                  <Monto v={c.montoInicial} />
                  <Monto v={c.ventasEfectivo} />
                  <Monto v={c.ventasQr} />
                  <Monto v={c.gastos} negativo />
                  <Monto v={c.esperado} fuerte />
                  <td className="cifras px-3 py-3 text-right">{c.contado ? formatoBs(c.contado) : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {dif === null ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3.5" /> En curso
                      </span>
                    ) : dif === 0n ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-exito">
                        <CheckCircle2 className="size-4" /> Cuadra
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-bold text-destructive">
                        <AlertTriangle className="size-4" />
                        <span className="cifras">
                          {dif < 0n ? "Faltan" : "Sobran"} {formatoBs(c.diferencia!.replace("-", ""))}
                        </span>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-muted-foreground">
                  {cajas.length > 0 ? <SinResultados className="border-0 p-2" consulta={busqueda} onLimpiar={() => setBusqueda("")} /> : "No hay cajas en estas fechas."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Esperado = inicial + ventas en efectivo − gastos. El QR no entra en el efectivo. Las cajas abiertas muestran los totales en vivo.</p>
    </div>
  );
}

function Monto({ v, negativo, fuerte }: { v: string; negativo?: boolean; fuerte?: boolean }) {
  return (
    <td className={cn("cifras px-3 py-3 text-right whitespace-nowrap", fuerte && "font-display font-extrabold", negativo && aCentavos(v) > 0n && "text-destructive")}>
      {negativo && aCentavos(v) > 0n ? "−" : ""}
      {formatoBs(v)}
    </td>
  );
}
