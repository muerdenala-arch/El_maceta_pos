"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { escribirAlmacen } from "@/lib/almacen";
import { cerrarSesion } from "@/lib/auth/acciones";
import { CLAVE_DESBLOQUEO } from "@/lib/auth/constantes";
import { cn } from "@/lib/utils";

/** En la Fase 6 advertirá si hay operaciones offline pendientes antes de salir. */
export function BotonCerrarSesion({ soloIcono, className }: { soloIcono?: boolean; className?: string }) {
  const router = useRouter();
  const [ocupado, iniciar] = useTransition();

  return (
    <Button
      variant="outline"
      size={soloIcono ? "icon" : "lg"}
      aria-label="Cerrar sesión"
      disabled={ocupado}
      className={cn(!soloIcono && "h-11 w-full rounded-xl bg-transparent font-semibold", className)}
      onClick={() =>
        iniciar(async () => {
          await cerrarSesion();
          escribirAlmacen("session", CLAVE_DESBLOQUEO, null);
          router.replace("/login");
          router.refresh();
        })
      }
    >
      <LogOut className="size-4" />
      {!soloIcono && (ocupado ? "Cerrando…" : "Cerrar sesión")}
    </Button>
  );
}
