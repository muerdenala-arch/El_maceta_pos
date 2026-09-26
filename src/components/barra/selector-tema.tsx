"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const sinSuscripcion = () => () => {};

/**
 * Interruptor tipo píldora sol/luna; next-themes guarda la preferencia en localStorage.
 * La posición de la perilla depende solo de la clase `.dark` (CSS), así no hay parpadeo al hidratar.
 */
export function SelectorTema({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  // El servidor no conoce el tema: aria-checked se define recién después de hidratar.
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={montado ? resolvedTheme === "dark" : undefined}
      aria-label="Modo oscuro"
      title="Modo claro / oscuro"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className={cn(
        "relative flex h-9 w-[4.25rem] shrink-0 items-center justify-between rounded-full border bg-muted px-2 transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        className,
      )}
    >
      <Sun className="size-4 text-aviso" />
      <Moon className="size-4 text-muted-foreground" />
      <span
        aria-hidden
        className="absolute top-1 left-1 flex size-7 items-center justify-center rounded-full bg-white shadow-md transition-transform duration-200 ease-out dark:translate-x-8"
      >
        <Sun className="size-4 text-primary dark:hidden" />
        <Moon className="hidden size-4 text-indigo-500 dark:block" />
      </span>
    </button>
  );
}
