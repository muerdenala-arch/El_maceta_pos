"use client";

/* eslint-disable @next/next/no-img-element -- fotos propias de comprobantes */
import { Ban, Receipt, ReceiptText } from "lucide-react";
import { useState } from "react";
import { Campo } from "@/components/formularios/campo";
import { DialogoFormulario } from "@/components/formularios/dialogo-formulario";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { useAccion } from "@/components/formularios/use-accion";
import { SelectorFecha } from "@/components/panel/selector-fecha";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sumar } from "@/lib/dinero";
import { fechaLarga, formatoBs } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { anularGasto } from "./acciones";

type Gasto = {
  id: number;
  fecha: string;
  categoria: string;
  monto: string;
  descripcion: string | null;
  fotoUrl: string | null;
  anulado: boolean;
  motivoAnulacion: string | null;
  cajero: string;
  sucursal: string;
  cajaAbierta: boolean;
};

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-BO", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function ListaGastos({ fecha, hoy, gastos }: { fecha: string; hoy: string; gastos: Gasto[] }) {
  const [anulando, setAnulando] = useState<Gasto | null>(null);
  const vigentes = gastos.filter((g) => !g.anulado);
  const total = vigentes.length ? sumar(...vigentes.map((g) => g.monto)) : "0";
  const porCategoria = Object.entries(
    vigentes.reduce<Record<string, string[]>>((acc, g) => ({ ...acc, [g.categoria]: [...(acc[g.categoria] ?? []), g.monto] }), {}),
  )
    .map(([categoria, montos]) => ({ categoria, total: sumar(...montos), cantidad: montos.length }))
    .sort((a, b) => Number(b.total) - Number(a.total));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <EncabezadoPagina icono={ReceiptText} titulo="Gastos diarios" descripcion={<span className="first-letter:uppercase">{fechaLarga(fecha)}</span>}>
        <SelectorFecha fecha={fecha} hoy={hoy} />
      </EncabezadoPagina>

      <section className="grid gap-3 sm:grid-cols-[16rem_1fr]">
        <div className="rounded-3xl bg-ficha-rosa p-5 text-ficha-rosa-foreground">
          <p className="font-bold">Total del día</p>
          <p className="cifras mt-1 font-display text-3xl font-extrabold">{formatoBs(total)}</p>
          <p className="text-sm opacity-80">{vigentes.length} gasto{vigentes.length === 1 ? "" : "s"}</p>
        </div>
        <ul className="flex flex-wrap content-start gap-2 rounded-3xl border bg-card p-4">
          {porCategoria.map((c) => (
            <li key={c.categoria} className="rounded-2xl bg-muted px-4 py-2">
              <p className="text-xs font-bold text-muted-foreground uppercase">{c.categoria} · {c.cantidad}</p>
              <p className="cifras font-display text-lg font-extrabold">{formatoBs(c.total)}</p>
            </li>
          ))}
          {porCategoria.length === 0 && <li className="self-center text-sm text-muted-foreground">Sin gastos este día.</li>}
        </ul>
      </section>

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
                {hora(g.fecha)} · {g.cajero} · {g.sucursal}
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
