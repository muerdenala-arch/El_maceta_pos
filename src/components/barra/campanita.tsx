"use client";

import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Campanita de notificaciones (solo administrador). La lógica de alertas llega en la Fase 7. */
export function Campanita({ noLeidas = 0 }: { noLeidas?: number }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Alertas: ${noLeidas} sin leer`}>
          <Bell className="size-5" />
          {noLeidas > 0 && (
            <span className="cifras absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] leading-5 font-semibold text-white">
              {noLeidas > 99 ? "99+" : noLeidas}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Alertas</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <p className="px-2 py-6 text-center text-sm text-muted-foreground">No hay alertas.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
