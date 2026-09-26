"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import { escribirAlmacen } from "@/lib/almacen";
import { cerrarSesion } from "@/lib/auth/acciones";
import { CLAVE_DESBLOQUEO } from "@/lib/auth/constantes";
import { borrarPaginasGuardadas } from "@/lib/offline/precarga";
import { usePendientes } from "@/lib/offline/sincronizar";
import { cn } from "@/lib/utils";

/**
 * Cerrar sesión. Si quedan operaciones sin sincronizar, avisa primero (sección 8.7 del plan):
 * no se pierden, siguen en este dispositivo y se envían al volver a ingresar.
 */
export function BotonCerrarSesion({ soloIcono, className }: { soloIcono?: boolean; className?: string }) {
  const router = useRouter();
  const [ocupado, iniciar] = useTransition();
  const [confirmar, setConfirmar] = useState(false);
  const { pendientes } = usePendientes();

  const salir = () =>
    iniciar(async () => {
      if (!navigator.onLine) {
        setConfirmar(false);
        return;
      }
      await cerrarSesion();
      escribirAlmacen("session", CLAVE_DESBLOQUEO, null);
      await borrarPaginasGuardadas();
      router.replace("/login");
      router.refresh();
    });

  return (
    <>
      <Button
        variant="outline"
        size={soloIcono ? "icon" : "lg"}
        aria-label="Cerrar sesión"
        disabled={ocupado}
        className={cn(!soloIcono && "h-11 w-full rounded-xl bg-transparent font-semibold", className)}
        onClick={() => (pendientes > 0 || !navigator.onLine ? setConfirmar(true) : salir())}
      >
        <LogOut className="size-4" />
        {!soloIcono && (ocupado ? "Cerrando…" : "Cerrar sesión")}
      </Button>

      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {typeof navigator !== "undefined" && !navigator.onLine ? "Sin conexión" : `Hay ${pendientes} operación${pendientes === 1 ? "" : "es"} sin enviar`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {typeof navigator !== "undefined" && !navigator.onLine
                ? "Cerrar sesión requiere internet: sin conexión no podrías volver a ingresar hasta que vuelva. Puedes seguir vendiendo."
                : "No se pierden: quedan guardadas en este dispositivo y se enviarán cuando vuelvas a ingresar aquí. Lo ideal es sincronizar antes (botón de recarga)."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            {typeof navigator !== "undefined" && navigator.onLine && (
              <AlertDialogAction variant="destructive" onClick={salir}>
                Cerrar sesión igual
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
