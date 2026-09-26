"use client";

/* eslint-disable @next/next/no-img-element -- fotos propias de comprobantes */
import { Ban, Receipt } from "lucide-react";
import { useState } from "react";
import { Campo } from "@/components/formularios/campo";
import { DialogoFormulario } from "@/components/formularios/dialogo-formulario";
import { useAccion } from "@/components/formularios/use-accion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatoBs } from "@/lib/formato";
import type { GastoListado } from "@/lib/reportes/gastos";
import { cn } from "@/lib/utils";
import { anularGasto } from "./acciones";

type Gasto = GastoListado;

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-BO", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-BO", { timeZone: "America/La_Paz", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Gastos con su foto; los de una caja todavía abierta se pueden anular (con motivo). */
export function ListaGastos({ gastos, conFecha }: { gastos: GastoListado[]; conFecha: boolean }) {
  const [anulando, setAnulando] = useState<Gasto | null>(null);

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {gastos.map((g) => (
          <li key={g.id} className={cn("flex flex-wrap items-center gap-3 rounded-3xl border bg-card p-3 shadow-sm sm:px-4", g.anulado && "opacity-60")}>
            {g.fotoUrl ? (
              <a href={g.fotoUrl} target="_blank" rel="noreferrer" className="size-14 shrink-0 overflow-hidden rounded-2xl" title="Ver comprobante">
                <img src={g.fotoUrl} alt="Comprobante" className="size-full object-cover" />
              </a>
            ) : (
              <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-muted">
                <Receipt className="size-6 text-muted-foreground" />
              </span>
            )}
            <div className="min-w-0 flex-1 basis-48">
              <p className="flex flex-wrap items-center gap-2 font-bold">
                {g.categoria}
                {g.anulado && <Badge variant="destructive">Anulado</Badge>}
              </p>
              <p className="text-sm text-muted-foreground">
                {conFecha ? fechaHora(g.fecha) : hora(g.fecha)} · {g.cajero} · {g.sucursal}
              </p>
              {g.descripcion && <p className="text-sm">{g.descripcion}</p>}
              {g.anulado && g.motivoAnulacion && <p className="text-sm text-destructive">Motivo: {g.motivoAnulacion}</p>}
            </div>
            <span className={cn("cifras font-display text-xl font-extrabold", g.anulado && "line-through")}>{formatoBs(g.monto)}</span>
            {!g.anulado && g.cajaAbierta && (
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setAnulando(g)}>
                <Ban className="size-4" /> Anular
              </Button>
            )}
          </li>
        ))}
        {gastos.length === 0 && <li className="rounded-3xl border border-dashed p-10 text-center text-muted-foreground">Sin gastos con estos filtros.</li>}
      </ul>

      {anulando && <DialogoAnular gasto={anulando} onCerrar={() => setAnulando(null)} />}
    </div>
  );
}

function DialogoAnular({ gasto, onCerrar }: { gasto: Gasto; onCerrar: () => void }) {
  const [motivo, setMotivo] = useState("");
  const anular = useAccion(anularGasto, { mensajeExito: "Gasto anulado", alExito: onCerrar });
  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo="Anular gasto"
      descripcion={`${gasto.categoria} de ${formatoBs(gasto.monto)} · ${gasto.cajero}. Deja de descontarse del efectivo esperado.`}
      pendiente={anular.pendiente}
      textoGuardar="Anular gasto"
      onGuardar={() => anular.ejecutar({ id: gasto.id, motivo })}
    >
      <Campo etiqueta="Motivo" error={anular.campos.motivo}>
        {(p) => <Textarea {...p} value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={300} autoFocus placeholder="Ej. registrado dos veces" />}
      </Campo>
    </DialogoFormulario>
  );
}
