"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { sincronizarAhora } from "@/lib/offline/sincronizar";
import { cn } from "@/lib/utils";

/**
 * Envía lo pendiente de la cola sin conexión y actualiza los datos del servidor
 * (productos, stock, alertas) sin recargar la página ni cerrar sesión (sección 7 del plan).
 */
export function BotonRecarga() {
  const router = useRouter();
  const [cargando, iniciar] = useTransition();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label="Actualizar datos"
          disabled={cargando}
          onClick={() =>
            iniciar(async () => {
              await sincronizarAhora().catch(() => {});
              if (navigator.onLine) router.refresh();
            })
          }
        >
          <RefreshCw className={cn("size-5", cargando && "animate-spin")} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Actualizar datos</TooltipContent>
    </Tooltip>
  );
}
