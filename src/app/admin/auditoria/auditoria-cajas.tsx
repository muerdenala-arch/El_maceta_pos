"use client";

import { AlertTriangle, CheckCircle2, Clock, Lock } from "lucide-react";
import { useState } from "react";
import { useResaltado } from "@/components/alertas/use-resaltado";
import { Campo } from "@/components/formularios/campo";
import { DialogoFormulario } from "@/components/formularios/dialogo-formulario";
import { useAccion } from "@/components/formularios/use-accion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CajaAuditada } from "@/lib/caja/auditadas";
import { aCentavos, sumar } from "@/lib/dinero";
import { formatoBs } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { cerrarCajaPendiente } from "./acciones";
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
  const [cerrando, setCerrando] = useState<CajaAuditada | null>(null);
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
                      <span className="inline-flex flex-col items-end gap-1.5">
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="size-3.5" /> En curso
                        </span>
                        <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" aria-label={`Cerrar la caja de ${c.cajero}`} onClick={() => setCerrando(c)}>
                          <Lock className="size-3" /> Cerrar caja
                        </Button>
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
      {cerrando && <DialogoCierre key={cerrando.id} caja={cerrando} onCerrar={() => setCerrando(null)} />}
      <p className="text-xs text-muted-foreground">Las cajas abiertas se muestran siempre, aunque se hayan abierto otro día. Esperado = inicial + ventas en efectivo − gastos. El QR no entra en el efectivo. Las cajas abiertas muestran los totales en vivo.</p>
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

/** Cierre desde Auditoría de una caja que quedó abierta: efectivo contado y motivo obligatorio. */
function DialogoCierre({ caja, onCerrar }: { caja: CajaAuditada; onCerrar: () => void }) {
  const [contado, setContado] = useState("");
  const [motivo, setMotivo] = useState("");
  const cerrar = useAccion(cerrarCajaPendiente, { mensajeExito: "Caja cerrada", alExito: onCerrar });
  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo={`Cerrar la caja de ${caja.cajero}`}
      descripcion={`${caja.sucursal} · abierta el ${fechaHora(caja.apertura)}. Lo normal es que la cierre el cajero; úsalo si quedó abierta (se olvidó, ya no trabaja aquí…).`}
      pendiente={cerrar.pendiente}
      textoGuardar="Cerrar caja"
      onGuardar={() => cerrar.ejecutar({ id: caja.id, efectivoContado: contado, motivo })}
    >
      <p className="rounded-2xl border bg-muted/40 px-4 py-3 text-sm">
        Efectivo esperado en la caja: <strong className="cifras">{formatoBs(caja.esperado)}</strong>
      </p>
      <Campo etiqueta="Efectivo contado (Bs)" error={cerrar.campos.efectivoContado} ayuda="Lo que realmente había en la caja. Si no cuadra, queda la alerta de diferencia.">
        {(p) => <Input {...p} inputMode="decimal" value={contado} onChange={(e) => (setContado(e.target.value), cerrar.limpiarCampo("efectivoContado"))} placeholder="0,00" autoFocus />}
      </Campo>
      <Campo etiqueta="Motivo" error={cerrar.campos.motivo}>
        {(p) => <Textarea {...p} rows={2} maxLength={300} value={motivo} onChange={(e) => (setMotivo(e.target.value), cerrar.limpiarCampo("motivo"))} placeholder="Ej. El cajero se retiró sin cerrar la caja" />}
      </Campo>
    </DialogoFormulario>
  );
}
