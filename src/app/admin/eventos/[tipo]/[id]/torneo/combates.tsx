"use client";

import { CheckCircle2, Hourglass, Pencil, Swords, Trophy, Undo2, UserX } from "lucide-react";
import { useMemo, useState } from "react";
import { Campo } from "@/components/formularios/campo";
import { DialogoFormulario } from "@/components/formularios/dialogo-formulario";
import { useAccion } from "@/components/formularios/use-accion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { asaltosParaGanar, nombreRonda, porJugar, type Combate } from "@/lib/eventos/pulseada";
import { cn } from "@/lib/utils";
import { corregirCombate, registrarAusencia, registrarCombate } from "../../../torneo-acciones";
import { nombresDe, type TorneoProps } from "./tipos";

export function PestanaCombates(props: TorneoProps) {
  const { evento, torneo, llaves, participantes } = props;
  const [mesa, setMesa] = useState<Combate | null>(null);
  const [corrigiendo, setCorrigiendo] = useState<Combate | null>(null);
  // Recién guardados: salen de "Por jugar" al instante, sin esperar a que llegue la pantalla actualizada.
  const [guardados, setGuardados] = useState<ReadonlySet<string>>(new Set());
  const nombres = useMemo(() => nombresDe(participantes), [participantes]);
  const rondas = Math.max(0, ...llaves.filter((c) => c.fase === "ganadores").map((c) => c.ronda));
  const ronda = (c: Combate) => nombreRonda(c, rondas, torneo.formato);
  const listos = porJugar(llaves).filter((c) => !guardados.has(c.clave));
  const jugados = llaves.filter((c) => c.terminado && !c.paseLibre).reverse();
  const esperando = llaves.filter((c) => !c.terminado && (c.a === null || c.b === null)).length;
  const enCurso = evento.estado === "en_curso";

  if (!torneo.sorteado) {
    return <p className="rounded-2xl bg-muted p-4 text-sm">Inscribe a los competidores y sortea las llaves para ver los combates.</p>;
  }

  return (
    <section className="space-y-6">
      {enCurso && (
        <div className="space-y-2">
          <h2 className="flex items-center gap-2 text-base font-extrabold">
            <Swords className="size-5 text-primary" /> Por jugar ({listos.length})
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {listos.map((c) => (
              <li key={c.clave}>
                <button
                  type="button"
                  onClick={() => setMesa(c)}
                  className="flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{ronda(c)}</p>
                    <p className="mt-1 truncate font-semibold">{nombres.get(c.a!)}</p>
                    <p className="text-xs font-bold text-primary">vs</p>
                    <p className="truncate font-semibold">{nombres.get(c.b!)}</p>
                  </div>
                  <span className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Abrir mesa</span>
                </button>
              </li>
            ))}
          </ul>
          {listos.length === 0 && <p className="rounded-2xl bg-muted p-4 text-sm">No hay combates listos ahora mismo.</p>}
          {esperando > 0 && (
            <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Hourglass className="size-4" /> {esperando} combate{esperando === 1 ? "" : "s"} esperan a que se definan sus competidores.
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <h2 className="flex items-center gap-2 text-base font-extrabold">
          <CheckCircle2 className="size-5 text-primary" /> Jugados ({jugados.length})
        </h2>
        <ul className="space-y-2">
          {jugados.map((c) => {
            const ganaA = c.ganador === c.a;
            return (
              <li key={c.clave} className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm sm:px-4">
                <div className="min-w-0 flex-1 basis-60">
                  <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                    {ronda(c)} {c.walkover && <Badge className="ml-1 bg-aviso text-aviso-foreground">W.O.</Badge>}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm">
                    <span className={cn(ganaA ? "font-extrabold" : "text-muted-foreground")}>
                      {ganaA && <Trophy className="mr-1 inline size-4 text-primary" />}
                      {nombres.get(c.a!) ?? "—"}
                    </span>
                    <span className="cifras rounded-lg bg-muted px-2 py-0.5 font-display font-extrabold">
                      {c.asaltosA} – {c.asaltosB}
                    </span>
                    <span className={cn(!ganaA ? "font-extrabold" : "text-muted-foreground")}>
                      {!ganaA && <Trophy className="mr-1 inline size-4 text-primary" />}
                      {nombres.get(c.b!) ?? "—"}
                    </span>
                  </p>
                  {(c.faltasA > 0 || c.faltasB > 0) && (
                    <p className="cifras text-xs text-muted-foreground">
                      Faltas {c.faltasA} – {c.faltasB}
                    </p>
                  )}
                </div>
                {enCurso && props.ids[c.clave] && (
                  <Button variant="ghost" size="sm" onClick={() => setCorrigiendo(c)}>
                    <Pencil className="size-4" /> Corregir
                  </Button>
                )}
              </li>
            );
          })}
          {jugados.length === 0 && <li className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Todavía no se jugó ningún combate.</li>}
        </ul>
      </div>

      {mesa && (
        <Mesa
          key={mesa.clave}
          id={props.ids[mesa.clave]}
          titulo={ronda(mesa)}
          nombreA={nombres.get(mesa.a!)!}
          nombreB={nombres.get(mesa.b!)!}
          mejorDe={torneo.mejorDe}
          onCerrar={() => setMesa(null)}
          onGuardado={() => setGuardados((g) => new Set(g).add(mesa.clave))}
        />
      )}
      {corrigiendo && (
        <DialogoCorregir combate={corrigiendo} id={props.ids[corrigiendo.clave]} nombreA={nombres.get(corrigiendo.a!)!} nombreB={nombres.get(corrigiendo.b!)!} onCerrar={() => setCorrigiendo(null)} />
      )}
    </section>
  );
}

type Toque = "asalto-a" | "asalto-b" | "falta-a" | "falta-b";

/** Marcador a partir de los toques del juez: 2 faltas en un asalto le dan ese asalto al rival. */
function marcador(toques: Toque[]) {
  const m = { asaltosA: 0, asaltosB: 0, faltasA: 0, faltasB: 0, enAsaltoA: 0, enAsaltoB: 0 };
  const cerrarAsalto = (lado: "a" | "b") => {
    if (lado === "a") m.asaltosA++;
    else m.asaltosB++;
    m.enAsaltoA = 0;
    m.enAsaltoB = 0;
  };
  for (const t of toques) {
    if (t === "asalto-a") cerrarAsalto("a");
    else if (t === "asalto-b") cerrarAsalto("b");
    else if (t === "falta-a") {
      m.faltasA++;
      if (++m.enAsaltoA >= 2) cerrarAsalto("b");
    } else {
      m.faltasB++;
      if (++m.enAsaltoB >= 2) cerrarAsalto("a");
    }
  }
  return m;
}

/** "Mesa" del juez: pensada para el celular, botones grandes y un toque por acción. */
type PropsMesa = { id: number; titulo: string; nombreA: string; nombreB: string; mejorDe: number; onCerrar: () => void; onGuardado: () => void };

function Mesa({ id, titulo, nombreA, nombreB, mejorDe, onCerrar, onGuardado }: PropsMesa) {
  const [toques, setToques] = useState<Toque[]>([]);
  const [ausencia, setAusencia] = useState(false);
  const ganar = asaltosParaGanar(mejorDe);
  const m = marcador(toques);
  const ganador = m.asaltosA >= ganar ? "a" : m.asaltosB >= ganar ? "b" : null;
  const listo = () => {
    onGuardado();
    onCerrar();
  };
  const guardar = useAccion(registrarCombate, { mensajeExito: "Resultado guardado", alExito: listo });
  const wo = useAccion(registrarAusencia, { mensajeExito: "W.O. registrado", alExito: listo });
  const tocar = (t: Toque) => !ganador && setToques((x) => [...x, t]);

  const lado = (l: "a" | "b") => {
    const nombre = l === "a" ? nombreA : nombreB;
    const asaltos = l === "a" ? m.asaltosA : m.asaltosB;
    const faltas = l === "a" ? m.enAsaltoA : m.enAsaltoB;
    return (
      <div className={cn("flex flex-col items-center gap-3 rounded-3xl border p-4 text-center", ganador === l && "border-primary bg-primary/8")}>
        <p className="line-clamp-2 min-h-12 font-display text-lg leading-tight font-extrabold">{nombre}</p>
        <p className="cifras font-display text-6xl font-extrabold" aria-label={`Asaltos de ${nombre}`}>
          {asaltos}
        </p>
        <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground" aria-label={`Faltas en este asalto: ${faltas}`}>
          Faltas
          {[0, 1].map((i) => (
            <span key={i} className={cn("size-3 rounded-full border", i < faltas ? "border-destructive bg-destructive" : "border-muted-foreground/40")} />
          ))}
        </p>
        <Button className="h-14 w-full rounded-2xl text-base font-bold" disabled={!!ganador} onClick={() => tocar(l === "a" ? "asalto-a" : "asalto-b")}>
          +1 asalto
        </Button>
        <Button variant="outline" className="h-11 w-full rounded-2xl font-bold" disabled={!!ganador} onClick={() => tocar(l === "a" ? "falta-a" : "falta-b")}>
          Falta
        </Button>
      </div>
    );
  };

  return (
    <Dialog open onOpenChange={(v) => !v && !guardar.pendiente && onCerrar()}>
      <DialogContent className="max-h-[96dvh] overflow-y-auto rounded-3xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-extrabold">{titulo}</DialogTitle>
          <DialogDescription>
            Al mejor de {mejorDe}: gana quien llegue a {ganar} asalto{ganar === 1 ? "" : "s"}. 2 faltas en un asalto le dan el asalto al rival.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          {lado("a")}
          {lado("b")}
        </div>

        {ganador ? (
          <div className="space-y-2 rounded-2xl bg-ficha-verde p-4 text-ficha-verde-foreground" role="status">
            <p className="flex items-center gap-2 font-bold">
              <Trophy className="size-5" /> Gana {ganador === "a" ? nombreA : nombreB} ({m.asaltosA}–{m.asaltosB})
            </p>
            <Button
              size="lg"
              className="h-12 w-full rounded-2xl font-bold"
              disabled={guardar.pendiente}
              onClick={() => guardar.ejecutar({ id, asaltosA: m.asaltosA, asaltosB: m.asaltosB, faltasA: m.faltasA, faltasB: m.faltasB })}
            >
              {guardar.pendiente ? "Guardando…" : "Confirmar resultado"}
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" disabled={toques.length === 0 || guardar.pendiente} onClick={() => setToques((x) => x.slice(0, -1))}>
            <Undo2 className="size-4" /> Deshacer
          </Button>
          {ausencia ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={wo.pendiente} onClick={() => wo.ejecutar({ id, ausente: "a" })}>
                No vino {nombreA.split(" ")[0]}
              </Button>
              <Button variant="outline" size="sm" disabled={wo.pendiente} onClick={() => wo.ejecutar({ id, ausente: "b" })}>
                No vino {nombreB.split(" ")[0]}
              </Button>
            </div>
          ) : (
            <Button variant="ghost" className="text-muted-foreground" onClick={() => setAusencia(true)}>
              <UserX className="size-4" /> No se presentó
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DialogoCorregir({ combate, id, nombreA, nombreB, onCerrar }: { combate: Combate; id: number; nombreA: string; nombreB: string; onCerrar: () => void }) {
  const [d, setD] = useState({ asaltosA: String(combate.asaltosA), asaltosB: String(combate.asaltosB), faltasA: String(combate.faltasA), faltasB: String(combate.faltasB), motivo: "" });
  const corregir = useAccion(corregirCombate, { mensajeExito: "Resultado corregido", alExito: onCerrar });
  const poner = (k: keyof typeof d, v: string) => {
    setD((x) => ({ ...x, [k]: v }));
    corregir.limpiarCampo(k);
  };
  const numero = (k: "asaltosA" | "asaltosB" | "faltasA" | "faltasB", etiqueta: string) => (
    <Campo etiqueta={etiqueta} error={corregir.campos[k]}>
      {(p) => <Input {...p} type="number" inputMode="numeric" min={0} max={k.startsWith("asaltos") ? 5 : 30} value={d[k]} onChange={(e) => poner(k, e.target.value)} className="cifras text-lg font-bold" />}
    </Campo>
  );
  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo="Corregir resultado"
      descripcion="Solo si el combate siguiente todavía no se jugó. Queda registrado en la auditoría."
      pendiente={corregir.pendiente}
      textoGuardar="Corregir"
      onGuardar={() => corregir.ejecutar({ id, ...d })}
    >
      <div className="grid grid-cols-2 gap-4">
        {numero("asaltosA", `Asaltos de ${nombreA}`)}
        {numero("asaltosB", `Asaltos de ${nombreB}`)}
        {numero("faltasA", `Faltas de ${nombreA}`)}
        {numero("faltasB", `Faltas de ${nombreB}`)}
      </div>
      <Campo etiqueta="Motivo" error={corregir.campos.motivo}>
        {(p) => <Textarea {...p} value={d.motivo} onChange={(e) => poner("motivo", e.target.value)} rows={2} maxLength={300} placeholder="Ej. se anotó el asalto al competidor equivocado" />}
      </Campo>
    </DialogoFormulario>
  );
}
