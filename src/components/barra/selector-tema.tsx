"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Cambia entre modo claro y oscuro; next-themes guarda la preferencia en localStorage. */
export function SelectorTema() {
  const { resolvedTheme, setTheme } = useTheme();
  const oscuro = resolvedTheme === "dark";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          // Etiqueta fija: el servidor no conoce el tema y una etiqueta variable rompe la hidratación
          aria-label="Cambiar modo claro / oscuro"
          onClick={() => setTheme(oscuro ? "light" : "dark")}
        >
          {/* Ambos íconos se renderizan; el CSS muestra el correcto y evita parpadeo al hidratar */}
          <Sun className="size-5 scale-100 rotate-0 transition-transform duration-200 dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute size-5 scale-0 rotate-90 transition-transform duration-200 dark:scale-100 dark:rotate-0" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Modo claro / oscuro</TooltipContent>
    </Tooltip>
  );
}
