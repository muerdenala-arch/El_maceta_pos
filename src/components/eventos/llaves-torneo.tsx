"use client";

import { Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { nombreRonda, type Combate, type Fase, type Formato } from "@/lib/eventos/pulseada";
import { cn } from "@/lib/utils";

/** Llaves por rondas (eliminación) o fechas (todos contra todos). Solo nombres y marcadores: también en la página pública. */
export function Llaves({ llaves, formato, nombres }: { llaves: Combate[]; formato: Formato; nombres: Map<number, string> }) {
  const rondasG = Math.max(0, ...llaves.filter((c) => c.fase === "ganadores").map((c) => c.ronda));
  const titulo = (c: Combate) => nombreRonda(c, rondasG, formato);
  const columnas = (fase: Fase) =>
    [...new Set(llaves.filter((c) => c.fase === fase).map((c) => c.ronda))].sort((a, b) => a - b).map((r) => llaves.filter((c) => c.fase === fase && c.ronda === r).sort((a, b) => a.orden - b.orden));

  if (formato === "todos_contra_todos") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {columnas("liga").map((fecha) => (
          <section key={fecha[0].ronda} className="space-y-2 rounded-3xl border bg-card p-4 shadow-sm">
            <h3 className="text-sm font-extrabold">{titulo(fecha[0])}</h3>
            {fecha.map((c) => (
              <Tarjeta key={c.clave} c={c} nombres={nombres} />
            ))}
          </section>
        ))}
      </div>
    );
  }

  const finales = llaves.filter((c) => ["tercer_lugar", "gran_final", "desempate"].includes(c.fase) && !(c.fase === "desempate" && c.paseLibre));
  return (
    <div className="space-y-6">
      <Bloque titulo={formato === "doble_eliminacion" ? "Llave de ganadores" : null} rondas={columnas("ganadores")} tituloRonda={titulo} nombres={nombres} />
      {formato === "doble_eliminacion" && columnas("perdedores").length > 0 && <Bloque titulo="Llave de perdedores" rondas={columnas("perdedores")} tituloRonda={titulo} nombres={nombres} />}
      {finales.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-extrabold">{formato === "doble_eliminacion" ? "Finales" : "Por el 3.er lugar"}</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {finales.map((c) => (
              <div key={c.clave} className="space-y-1">
                {formato === "doble_eliminacion" && <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{titulo(c)}</p>}
                <Tarjeta c={c} nombres={nombres} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Bloque({ titulo, rondas, tituloRonda, nombres }: { titulo: string | null; rondas: Combate[][]; tituloRonda: (c: Combate) => string; nombres: Map<number, string> }) {
  return (
    <section className="space-y-2">
      {titulo && <h3 className="text-sm font-extrabold">{titulo}</h3>}
      <div className="sin-barra -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {rondas.map((ronda) => (
          <div key={ronda[0].clave} className="flex w-56 shrink-0 flex-col justify-around gap-3">
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{tituloRonda(ronda[0])}</p>
            {ronda.map((c) => (
              <Tarjeta key={c.clave} c={c} nombres={nombres} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function Tarjeta({ c, nombres }: { c: Combate; nombres: Map<number, string> }) {
  const listo = !c.terminado && c.a !== null && c.b !== null;
  const fila = (id: number | null, vacio: boolean, asaltos: number) => {
    const gano = c.terminado && id !== null && c.ganador === id;
    return (
      <div className={cn("flex items-center gap-2 px-3 py-2", gano && "font-extrabold")}>
        <span className={cn("min-w-0 flex-1 truncate text-sm", id === null && "text-muted-foreground italic")}>
          {gano && <Trophy className="mr-1 inline size-3.5 text-primary" />}
          {id !== null ? (nombres.get(id) ?? "—") : vacio ? "Pase libre" : "Por definir"}
        </span>
        {c.terminado && !c.paseLibre && <span className="cifras font-display text-base font-extrabold">{asaltos}</span>}
      </div>
    );
  };
  return (
    <div className={cn("divide-y overflow-hidden rounded-2xl border bg-card shadow-sm", listo && "border-primary", c.paseLibre && "opacity-60")}>
      {fila(c.a, c.aVacio, c.asaltosA)}
      {fila(c.b, c.bVacio, c.asaltosB)}
      {(c.walkover || listo) && (
        <div className="px-3 py-1 text-right">
          {c.walkover && <Badge className="bg-aviso text-aviso-foreground">W.O.</Badge>}
          {listo && <Badge className="bg-primary text-primary-foreground">Listo para jugar</Badge>}
        </div>
      )}
    </div>
  );
}
