"use client";

import { BellOff, BellRing } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { activarPush, desactivarPush, estadoPush, type EstadoPush } from "@/lib/notificaciones/cliente";

/**
 * Pie de la campanita: activa las notificaciones del sistema en este celular, tablet o PC. Con ellas activas, cada
 * alerta nueva aparece fuera de la app (pantalla bloqueada, barra de notificaciones) y al tocarla abre su pantalla.
 */
export function ActivarNotificaciones() {
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [ocupado, iniciar] = useTransition();
  useEffect(() => {
    estadoPush().then(setEstado).catch(() => setEstado("no_disponible"));
  }, []);

  if (estado === null) return null;
  if (estado === "no_disponible") {
    return (
      <p className="border-t px-4 py-2.5 text-[11px] text-muted-foreground">
        Para recibir avisos en este equipo, instala la app (en iPhone o iPad: Compartir → “Agregar a inicio”) y ábrela desde su ícono.
      </p>
    );
  }
  if (estado === "bloqueadas") {
    return (
      <p className="flex items-center gap-2 border-t px-4 py-2.5 text-[11px] text-muted-foreground">
        <BellOff className="size-4 shrink-0" /> Las notificaciones están bloqueadas para esta app: actívalas en los ajustes del navegador o del teléfono.
      </p>
    );
  }
  const activas = estado === "activas";
  return (
    <div className="flex items-center gap-3 border-t px-4 py-2.5">
      <BellRing className={activas ? "size-4 shrink-0 text-exito" : "size-4 shrink-0 text-muted-foreground"} />
      <p className="flex-1 text-xs font-semibold">{activas ? "Avisos activados en este equipo" : "Recibe las alertas en este equipo, aunque la app esté cerrada"}</p>
      <Button
        size="sm"
        variant={activas ? "ghost" : "default"}
        disabled={ocupado}
        onClick={() =>
          iniciar(async () => {
            try {
              if (activas) {
                await desactivarPush();
                setEstado("apagadas");
                return;
              }
              const nuevo = await activarPush();
              setEstado(nuevo);
              if (nuevo === "activas") toast.success("Listo: las alertas nuevas llegarán a este equipo");
              else if (nuevo === "bloqueadas") toast.error("No diste permiso para las notificaciones");
            } catch {
              toast.error("No se pudieron activar las notificaciones. Revisa tu conexión.");
            }
          })
        }
      >
        {activas ? "Desactivar" : "Activar"}
      </Button>
    </div>
  );
}
