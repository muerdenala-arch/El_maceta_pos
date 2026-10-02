"use client";

import { AlertTriangle, ChevronDown, Flag, History, Pencil, Save } from "lucide-react";
import { Buscador, Resaltar, SinResultados } from "@/components/busqueda/buscador";
import { coincide } from "@/lib/busqueda";
import { useMemo, useState } from "react";
import { fechaCorta } from "@/components/eventos/estado-evento";
import { Campo } from "@/components/formularios/campo";
import { DialogoFormulario } from "@/components/formularios/dialogo-formulario";
import { useAccion } from "@/components/formularios/use-accion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { aCentikg, cambioSospechoso, plazoCumplido, textoKilos } from "@/lib/eventos/calculos";
import type { PesajeListado } from "@/lib/eventos/consultas";
import { pesoKg } from "@/lib/validaciones/eventos";
import { cn } from "@/lib/utils";
import { corregirPesaje, guardarPesajes } from "../../acciones";
import type { DetalleRetoProps } from "./tipos";

const kg = (c: number) => textoKilos(c).replace(" kg", "");

export function PestanaPesajes({ evento, participantes, pesajes, hoy }: Pick<DetalleRetoProps, "evento" | "participantes" | "pesajes" | "hoy">) {
  const activos = participantes.filter((p) => p.activo);
  const enCurso = evento.estado === "en_curso";
  const [fecha, setFecha] = useState(hoy);
  const [final, setFinal] = useState(() => enCurso && plazoCumplido(evento.fechaFin, hoy));
  const [pesos, setPesos] = useState<Record<number, string>>({});
  const [confirmar, setConfirmar] = useState<string[] | null>(null);
  const [corrigiendo, setCorrigiendo] = useState<{ pesaje: PesajeListado; nombre: string } | null>(null);

  const porParticipante = useMemo(() => {
    const m = new Map<number, PesajeListado[]>();
    for (const p of pesajes) m.set(p.participanteId, [...(m.get(p.participanteId) ?? []), p]);
    return m;
  }, [pesajes]);

  const guardar = useAccion(guardarPesajes, {
    mensajeExito: "Pesajes guardados",
    alExito: () => {
      setPesos({});
      setConfirmar(null);
    },
  });

  // Filas de la planilla: último peso (o el inicial) y si ya no admite pesaje en esta jornada.
  const filas = activos.map((p) => {
    const suyos = porParticipante.get(p.id) ?? [];
    const ultimo = suyos.at(-1);
    const anterior = aCentikg(ultimo?.peso ?? p.pesoInicial);
    const bloqueo = suyos.some((x) => x.fecha === fecha) ? "Ya pesado ese día" : final && suyos.some((x) => x.esPesajeFinal) ? "Ya tiene pesaje final" : null;
    const valor = pesos[p.id] ?? "";
    const valido = valor ? pesoKg.safeParse(valor) : null;
    const nuevo = valido?.success ? aCentikg(valido.data) : null;
    return { p, ultimo, anterior, bloqueo, valor, valido, nuevo, sospechoso: nuevo !== null && cambioSospechoso(anterior, nuevo) };
  });
  const listas = filas.filter((f) => f.valido?.success && !f.bloqueo);
  const invalidas = filas.filter((f) => f.valor && !f.valido?.success);

  const enviar = (confirmarCambios: boolean) =>
    guardar.ejecutar({
      eventoId: evento.id,
      fecha,
      esPesajeFinal: final,
      confirmarCambios,
      lineas: listas.map((f) => ({ participanteId: f.p.id, peso: f.valor })),
    });

  const alGuardar = () => {
    const sospechosos = listas.filter((f) => f.sospechoso);
    if (sospechosos.length) return setConfirmar(sospechosos.map((f) => `${f.p.nombreCompleto}: ${kg(f.anterior)} → ${kg(f.nuevo!)} kg`));
    enviar(false);
  };

  const [busqueda, setBusqueda] = useState("");
  const filasVisibles = filas.filter((f) => coincide(busqueda, [f.p.nombreCompleto]));
  const historialVisible = participantes.filter((p) => coincide(busqueda, [p.nombreCompleto]));

  return (
    <section className="space-y-6">
      {participantes.length > 0 && <Buscador valor={busqueda} onCambiar={setBusqueda} etiqueta="Buscar participante" placeholder="Buscar participante" />}
      {enCurso ? (
        <div className="space-y-3 rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-xs font-bold text-muted-foreground">
              Jornada de pesaje
              <Input type="date" value={fecha} min={evento.fechaInicio} max={hoy} onChange={(e) => e.target.value && setFecha(e.target.value)} className="h-10 w-auto" />
            </label>
            <label className={cn("flex h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-bold", final && "border-primary bg-primary/8")}>
              <input type="checkbox" className="size-4 accent-primary" checked={final} onChange={(e) => setFinal(e.target.checked)} />
              <Flag className="size-4 text-primary" /> Pesaje final
            </label>
            <p className="text-xs text-muted-foreground">
              {final ? "Cuenta para los resultados finales del reto." : "Pesaje intermedio: para ver el avance."}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">
                  <th className="py-2 pr-3">Participante</th>
                  <th className="px-3 py-2 text-right">Inicial</th>
                  <th className="px-3 py-2 text-right">Último</th>
                  <th className="py-2 pl-3">Peso de hoy (kg)</th>
                </tr>
              </thead>
              <tbody>
                {filasVisibles.map((f) => (
                  <tr key={f.p.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-semibold">
                      <Resaltar texto={f.p.nombreCompleto} consulta={busqueda} />
                    </td>
                    <td className="cifras px-3 py-2 text-right text-muted-foreground">{kg(aCentikg(f.p.pesoInicial))}</td>
                    <td className="cifras px-3 py-2 text-right">
                      {f.ultimo ? (
                        <>
                          {kg(aCentikg(f.ultimo.peso))}
                          <span className="block text-xs text-muted-foreground">{fechaCorta(f.ultimo.fecha).slice(0, 5)}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pl-3">
                      {f.bloqueo ? (
                        <span className="text-xs text-muted-foreground">{f.bloqueo}</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Input
                            value={f.valor}
                            onChange={(e) => setPesos((x) => ({ ...x, [f.p.id]: e.target.value.replace(/[^\d.,]/g, "") }))}
                            inputMode="decimal"
                            placeholder="kg"
                            aria-label={`Peso de ${f.p.nombreCompleto}`}
                            aria-invalid={f.valor && !f.valido?.success ? true : undefined}
                            className="cifras h-10 w-28 font-bold"
                          />
                          {f.nuevo !== null && (
                            <span className={cn("cifras text-xs font-bold", f.sospechoso ? "text-destructive" : f.nuevo <= f.anterior ? "text-exito" : "text-muted-foreground")}>
                              {f.sospechoso && <AlertTriangle className="mr-0.5 inline size-3.5" />}
                              {f.nuevo <= f.anterior ? "−" : "+"}
                              {kg(Math.abs(f.anterior - f.nuevo))}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {filasVisibles.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted-foreground">
                      {filas.length > 0 ? <SinResultados className="border-0 p-2" consulta={busqueda} onLimpiar={() => setBusqueda("")} /> : "No hay participantes activos."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {invalidas.length > 0 && (
            <p className="text-sm text-destructive">Revisa: {invalidas.map((f) => f.p.nombreCompleto).join(", ")} (entre 30 y 300 kg, hasta 2 decimales).</p>
          )}
          <Button size="lg" className="w-full rounded-2xl font-bold sm:w-auto" disabled={listas.length === 0 || invalidas.length > 0 || guardar.pendiente} onClick={alGuardar}>
            <Save className="size-5" />
            {guardar.pendiente ? "Guardando…" : `Guardar ${listas.length || ""} pesaje${listas.length === 1 ? "" : "s"}${final ? " finales" : ""}`}
          </Button>
        </div>
      ) : (
        <p className="rounded-2xl bg-muted p-4 text-sm">
          {evento.estado === "borrador" ? "Inicia el reto para registrar pesajes." : "El reto está finalizado: los pesajes quedaron bloqueados."}
        </p>
      )}

      <div className="space-y-2">
        <h2 className="flex items-center gap-2 text-base font-extrabold">
          <History className="size-5 text-primary" /> Historial por participante
        </h2>
        {historialVisible.map((p) => {
          const suyos = porParticipante.get(p.id) ?? [];
          return (
            <details key={p.id} className="group rounded-2xl border bg-card shadow-sm">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                <span className={cn("min-w-0 flex-1 truncate font-semibold", !p.activo && "text-muted-foreground line-through")}>
                  <Resaltar texto={p.nombreCompleto} consulta={busqueda} />
                </span>
                <span className="text-xs text-muted-foreground">
                  {suyos.length} pesaje{suyos.length === 1 ? "" : "s"}
                </span>
                <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <ul className="divide-y border-t text-sm">
                <li className="flex items-center gap-3 px-4 py-2 text-muted-foreground">
                  <span className="cifras w-24">{fechaCorta(evento.fechaInicio)}</span>
                  <span className="cifras flex-1">{kg(aCentikg(p.pesoInicial))} kg · inicial</span>
                </li>
                {suyos.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                    <span className="cifras w-24">{fechaCorta(x.fecha)}</span>
                    <span className="cifras flex-1 font-semibold">
                      {kg(aCentikg(x.peso))} kg {x.esPesajeFinal && <Badge className="ml-1 bg-ficha-naranja text-ficha-naranja-foreground">Final</Badge>}
                      {x.nota && <span className="block text-xs font-normal text-muted-foreground">{x.nota}</span>}
                    </span>
                    {enCurso && (
                      <Button variant="ghost" size="sm" onClick={() => setCorrigiendo({ pesaje: x, nombre: p.nombreCompleto })}>
                        <Pencil className="size-4" /> Corregir
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>

      <AlertDialog open={confirmar !== null} onOpenChange={(v) => !v && setConfirmar(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Seguro? Puede ser un error de digitación</AlertDialogTitle>
            <AlertDialogDescription>Estos pesos cambian más de 10 % respecto al pesaje anterior:</AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="cifras space-y-1 rounded-2xl bg-muted p-3 text-sm font-semibold">
            {confirmar?.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={guardar.pendiente}>Revisar</AlertDialogCancel>
            <AlertDialogAction disabled={guardar.pendiente} onClick={(e) => (e.preventDefault(), enviar(true))}>
              Sí, están bien
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {corrigiendo && <DialogoCorregir {...corrigiendo} onCerrar={() => setCorrigiendo(null)} />}
    </section>
  );
}

function DialogoCorregir({ pesaje, nombre, onCerrar }: { pesaje: PesajeListado; nombre: string; onCerrar: () => void }) {
  const [peso, setPeso] = useState(String(Number(pesaje.peso)));
  const [motivo, setMotivo] = useState("");
  const corregir = useAccion(corregirPesaje, { mensajeExito: "Pesaje corregido", alExito: onCerrar });
  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo="Corregir pesaje"
      descripcion={`${nombre} · ${fechaCorta(pesaje.fecha)} · antes ${kg(aCentikg(pesaje.peso))} kg. Queda registrado en la auditoría.`}
      pendiente={corregir.pendiente}
      textoGuardar="Corregir"
      onGuardar={() => corregir.ejecutar({ id: pesaje.id, peso, motivo })}
    >
      <Campo etiqueta="Peso correcto (kg)" error={corregir.campos.peso}>
        {(p) => <Input {...p} value={peso} onChange={(e) => setPeso(e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" className="cifras text-lg font-bold" autoFocus />}
      </Campo>
      <Campo etiqueta="Motivo" error={corregir.campos.motivo}>
        {(p) => <Textarea {...p} value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={300} placeholder="Ej. se digitó 58 en vez de 85" />}
      </Campo>
    </DialogoFormulario>
  );
}
