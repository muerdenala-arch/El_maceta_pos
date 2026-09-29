"use client";

import { CalendarDays, Flag, Gift, Shuffle, Store, Swords } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
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
import { porJugar, torneoCompleto } from "@/lib/eventos/pulseada";
import { FORMATOS } from "@/lib/eventos/textos-torneo";
import { finalizarTorneo, sortearTorneo } from "../../../torneo-acciones";
import type { TorneoProps } from "./tipos";

/** Cabecera del torneo: estado, formato, avance y botones sortear / volver a sortear / finalizar. */
export function EncabezadoTorneo({ evento, torneo, participantes, llaves }: TorneoProps) {
  const [confirmar, setConfirmar] = useState<"sortear" | "finalizar" | null>(null);
  const router = useRouter();
  const ruta = usePathname();
  // Después de sortear se va a los combates; al finalizar, a los resultados.
  const ir = (vista: string) => () => {
    setConfirmar(null);
    router.replace(`${ruta}?vista=${vista}`);
  };
  const sortear = useAccion(sortearTorneo, { mensajeExito: "Llaves sorteadas: ¡a competir!", alExito: ir("combates") });
  const finalizar = useAccion(finalizarTorneo, { mensajeExito: "Torneo finalizado: resultados bloqueados", alExito: ir("clasificacion") });

  const activos = participantes.filter((p) => p.activo).length;
  const jugados = llaves.filter((c) => c.terminado && !c.paseLibre).length;
  // El servidor decide en última instancia (solo cuentan los resultados cargados por el juez).
  const conResultado = llaves.some((c) => c.terminado && !c.paseLibre);
  const total = llaves.filter((c) => !c.paseLibre).length;
  const completo = llaves.length > 0 && torneoCompleto(llaves);
  const puedeSortear = evento.estado === "borrador" || (evento.estado === "en_curso" && !conResultado);

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
              <span className="cifras">{fechaCorta(evento.fechaInicio)}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Swords className="size-4" /> {FORMATOS[torneo.formato].titulo} · al mejor de {torneo.mejorDe}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Store className="size-4" /> {evento.sucursal ?? "Todas las sucursales"}
            </span>
          </p>
          {evento.premios && (
            <p className="mt-2 inline-flex items-start gap-1.5 text-sm">
              <Gift className="mt-0.5 size-4 shrink-0 text-primary" /> {evento.premios}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {evento.estado === "en_curso" && (
            <span className="cifras rounded-full bg-muted px-4 py-2 text-sm font-bold">
              {jugados} de {total} combates · {porJugar(llaves).length} listos para jugar
            </span>
          )}
          {puedeSortear && (
            <Button size="lg" variant={evento.estado === "borrador" ? "default" : "outline"} className="rounded-full font-bold" onClick={() => setConfirmar("sortear")}>
              <Shuffle className="size-5" /> {torneo.sorteado ? "Volver a sortear" : "Sortear llaves"}
            </Button>
          )}
          {evento.estado === "en_curso" && completo && (
            <Button size="lg" className="rounded-full font-bold" onClick={() => setConfirmar("finalizar")}>
              <Flag className="size-5" /> Finalizar torneo
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={confirmar !== null} onOpenChange={(v) => !v && setConfirmar(null)}>
        <AlertDialogContent className="rounded-3xl">
          {confirmar === "sortear" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{torneo.sorteado ? "¿Volver a sortear las llaves?" : "¿Sortear las llaves?"}</AlertDialogTitle>
                <AlertDialogDescription>
                  Se arman los cruces al azar entre los {activos} competidores y el torneo pasa a “En curso”. Desde ahí ya no se inscribe más gente
                  {torneo.sorteado ? "; mientras no se juegue ningún combate se puede volver a sortear" : ""}.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={sortear.pendiente}>Cancelar</AlertDialogCancel>
                <AlertDialogAction disabled={sortear.pendiente} onClick={(e) => (e.preventDefault(), sortear.ejecutar({ id: evento.id }))}>
                  Sí, sortear
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Finalizar el torneo?</AlertDialogTitle>
                <AlertDialogDescription>Los resultados quedan bloqueados: ya no se podrán cargar ni corregir combates.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={finalizar.pendiente}>Cancelar</AlertDialogCancel>
                <AlertDialogAction disabled={finalizar.pendiente} onClick={(e) => (e.preventDefault(), finalizar.ejecutar({ id: evento.id }))}>
                  Sí, finalizar
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
