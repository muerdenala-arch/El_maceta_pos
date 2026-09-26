"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Actualiza los datos del servidor sin recargar la página ni cerrar sesión.
 * En la Fase 6 también disparará la sincronización de la cola offline.
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
          onClick={() => iniciar(() => router.refresh())}
        >
          <RefreshCw className={cn("size-5", cargando && "animate-spin")} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Actualizar datos</TooltipContent>
    </Tooltip>
  );
}
