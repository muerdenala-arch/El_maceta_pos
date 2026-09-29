"use client";

import { AlertTriangle, CalendarDays, Flag, Gift, Hourglass, Play, Store } from "lucide-react";
import { useState } from "react";
import { EstadoEventoBadge, fechaCorta } from "@/components/eventos/estado-evento";
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
import { Button } from "@/components/ui/button";
import { diasRestantes } from "@/lib/eventos/calculos";
import { finalizarReto, iniciarReto } from "../../acciones";
import type { DetalleRetoProps } from "./tipos";

/** Cabecera del reto: estado, fechas, días que faltan, aviso de pesajes finales y botones iniciar/finalizar. */
export function EncabezadoReto({ evento, participantes, pesajes, hoy }: Pick<DetalleRetoProps, "evento" | "participantes" | "pesajes" | "hoy">) {
  const [confirmar, setConfirmar] = useState<"iniciar" | "finalizar" | null>(null);
  const iniciar = useAccion(iniciarReto, { mensajeExito: "Reto iniciado", alExito: () => setConfirmar(null) });
  const finalizar = useAccion(finalizarReto, { mensajeExito: "Reto finalizado: resultados bloqueados", alExito: () => setConfirmar(null) });

  const activos = participantes.filter((p) => p.activo);
  const conFinal = new Set(pesajes.filter((p) => p.esPesajeFinal).map((p) => p.participanteId));
  const sinFinal = activos.filter((p) => !conFinal.has(p.id));
  const faltan = diasRestantes(evento.fechaFin, hoy);
  const empezo = hoy >= evento.fechaInicio;

  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2.5 text-2xl font-extrabold sm:text-3xl">
            {evento.nombre}
            <EstadoEventoBadge estado={evento.estado} className="text-sm" />
          </h1>
          {evento.descripcion && <p className="mt-1 max-w-2xl text-muted-foreground">{evento.descripcion}</p>}
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4" />
              <span className="cifras">
                {fechaCorta(evento.fechaInicio)} – {fechaCorta(evento.fechaFin)}
              </span>
              ({evento.duracionDias} días)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Store className="size-4" /> {evento.sucursal ?? "Todas las sucursales"}
            </span>
            <span>Gana por {evento.criterioGanador === "porcentaje" ? "% de peso perdido" : "kilos perdidos"}</span>
          </p>
          {evento.premios && (
            <p className="mt-2 inline-flex items-start gap-1.5 text-sm">
              <Gift className="mt-0.5 size-4 shrink-0 text-primary" /> {evento.premios}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {evento.estado === "en_curso" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-4 py-2 text-sm font-bold">
              <Hourglass className="size-4 text-primary" />
              {!empezo
                ? `Empieza el ${fechaCorta(evento.fechaInicio)}`
                : faltan > 1
                  ? `Faltan ${faltan} días`
                  : faltan === 1
                    ? "Falta 1 día"
                    : faltan === 0
                      ? "Hoy es el último día"
                      : "Terminó"}
            </span>
          )}
          {evento.estado === "borrador" && (
            <Button size="lg" className="rounded-full font-bold" onClick={() => setConfirmar("iniciar")}>
              <Play className="size-5" /> Iniciar reto
            </Button>
          )}
          {evento.estado === "en_curso" && (
            <Button size="lg" variant={faltan <= 0 ? "default" : "outline"} className="rounded-full font-bold" onClick={() => setConfirmar("finalizar")}>
              <Flag className="size-5" /> Finalizar reto
            </Button>
          )}
        </div>
      </div>

      {evento.estado === "en_curso" && faltan <= 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-aviso/50 bg-aviso/15 p-4 text-sm" role="status">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <p>
            <strong>El reto cumplió su duración.</strong> Registra los pesajes finales en la pestaña Pesajes (marcando “Pesaje final”)
            {sinFinal.length > 0 ? ` — faltan ${sinFinal.length} de ${activos.length}` : " — ya están todos"} y luego finaliza el reto.
          </p>
        </div>
      )}

      <AlertDialog open={confirmar !== null} onOpenChange={(v) => !v && setConfirmar(null)}>
        <AlertDialogContent className="rounded-3xl">
          {confirmar === "iniciar" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Iniciar el reto?</AlertDialogTitle>
                <AlertDialogDescription>
                  Pasa a “En curso” con {activos.length} participante{activos.length === 1 ? "" : "s"}. Desde ahí se registran los pesajes; todavía se
                  podrá inscribir gente mientras esté en curso.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={iniciar.pendiente}>Cancelar</AlertDialogCancel>
                <AlertDialogAction disabled={iniciar.pendiente} onClick={(e) => (e.preventDefault(), iniciar.ejecutar({ id: evento.id }))}>
                  Sí, iniciar
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Finalizar el reto?</AlertDialogTitle>
                <AlertDialogDescription>
                  Los resultados quedan bloqueados: ya no se podrán registrar ni corregir pesajes.
                  {sinFinal.length > 0 && (
                    <span className="mt-2 block font-semibold text-destructive">
                      Sin pesaje final ({sinFinal.length}): {sinFinal.map((p) => p.nombreCompleto).join(", ")}. Quedarán como “No completó”.
                    </span>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={finalizar.pendiente}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  disabled={finalizar.pendiente}
                  className={sinFinal.length > 0 ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
                  onClick={(e) => (e.preventDefault(), finalizar.ejecutar({ id: evento.id, forzar: sinFinal.length > 0 }))}
                >
                  {sinFinal.length > 0 ? "Finalizar igual" : "Sí, finalizar"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
