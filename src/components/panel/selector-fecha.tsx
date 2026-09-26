"use client";

import { CalendarDays } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { cn } from "@/lib/utils";

/** Botones "Hoy" y "Elegir fecha": cambian el parámetro ?fecha=AAAA-MM-DD de la página. */
export function SelectorFecha({ fecha, hoy }: { fecha: string; hoy: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const entrada = useRef<HTMLInputElement>(null);
  const [cargando, iniciar] = useTransition();
  const esHoy = fecha === hoy;

  const ir = (nueva: string) =>
    iniciar(() => router.push(nueva === hoy ? pathname : `${pathname}?fecha=${nueva}`, { scroll: false }));

  return (
    <div className={cn("flex items-center gap-2", cargando && "opacity-70")}>
      <button
        type="button"
        onClick={() => ir(hoy)}
        className={cn(
          "h-11 rounded-full border px-5 text-sm font-bold transition-colors",
          esHoy ? "border-foreground/70 bg-card shadow-sm" : "text-muted-foreground hover:bg-accent",
        )}
      >
        Hoy
      </button>
      <label
        className={cn(
          "relative flex h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors hover:bg-accent",
          !esHoy && "border-foreground/70 bg-card shadow-sm",
        )}
      >
        <CalendarDays className="size-4 text-primary" />
        <span className="cifras">{esHoy ? "Elegir fecha" : fecha.split("-").reverse().join("/")}</span>
        <input
          ref={entrada}
          type="date"
          value={fecha}
          max={hoy}
          onChange={(e) => e.target.value && ir(e.target.value)}
          onClick={() => entrada.current?.showPicker?.()}
          aria-label="Elegir fecha"
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}
