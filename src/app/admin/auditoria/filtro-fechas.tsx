"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Rango de fechas por parámetros de la URL (?desde=&hasta=), conservando los demás filtros. */
export function FiltroFechas({ desde, hasta, hoy }: { desde: string; hasta: string; hoy: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [cargando, iniciar] = useTransition();

  const ir = (cambios: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) p.set(k, v);
    p.delete("pagina");
    p.delete("caja");
    iniciar(() => router.replace(`${pathname}?${p}`, { scroll: false }));
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2 text-sm", cargando && "opacity-60")}>
      <label className="flex items-center gap-2">
        Desde
        <Input type="date" value={desde} max={hasta} onChange={(e) => e.target.value && ir({ desde: e.target.value })} className="h-10 w-auto" />
      </label>
      <label className="flex items-center gap-2">
        Hasta
        <Input type="date" value={hasta} min={desde} max={hoy} onChange={(e) => e.target.value && ir({ hasta: e.target.value })} className="h-10 w-auto" />
      </label>
    </div>
  );
}
