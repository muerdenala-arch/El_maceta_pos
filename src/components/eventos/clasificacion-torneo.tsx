import type { FilaClasificacion } from "@/lib/eventos/pulseada";
import { cn } from "@/lib/utils";
import { PodioMedallas } from "./podio";

/** Podio y tabla de clasificación del torneo. Solo nombres y resultados deportivos (también en la página pública). */
export function ClasificacionTorneo({ filas, nombres, conPuntos }: { filas: FilaClasificacion[]; nombres: Map<number, string>; conPuntos: boolean }) {
  const th = "px-3 py-3 text-right";
  const td = "cifras px-3 py-2.5 text-right whitespace-nowrap";
  return (
    <div className="space-y-5">
      <PodioMedallas
        lugares={filas
          .filter((f) => f.posicion !== null && f.posicion <= 3)
          .map((f) => ({
            id: f.competidor,
            posicion: f.posicion!,
            nombre: nombres.get(f.competidor) ?? "—",
            valor: conPuntos ? `${f.puntos} pts` : `${f.victorias} victoria${f.victorias === 1 ? "" : "s"}`,
            detalle: `${f.victorias}V · ${f.derrotas}D · asaltos ${f.asaltosFavor}–${f.asaltosContra}`,
          }))}
      />
      <div className="overflow-x-auto rounded-3xl border bg-card shadow-sm">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b text-xs font-bold tracking-wide text-muted-foreground uppercase">
              <th className="py-3 pl-4 text-left">#</th>
              <th className="px-3 py-3 text-left">Competidor</th>
              <th className={th} title="Jugados">
                J
              </th>
              <th className={th} title="Victorias">
                V
              </th>
              <th className={th} title="Derrotas">
                D
              </th>
              <th className={th}>Asaltos</th>
              <th className={cn(th, !conPuntos && "pr-4")}>Faltas</th>
              {conPuntos && <th className={cn(th, "pr-4 text-foreground")}>Pts</th>}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.competidor} className={cn("border-b last:border-0", (f.eliminado || f.retirado) && f.posicion === null && "text-muted-foreground")}>
                <td className="cifras py-2.5 pl-4 font-display text-lg font-extrabold">{f.posicion ?? "—"}</td>
                <td className="px-3 py-2.5 font-semibold">
                  {nombres.get(f.competidor) ?? "—"}
                  {f.retirado && <span className="ml-2 text-xs font-bold text-destructive uppercase">Retirado</span>}
                  {!f.retirado && f.eliminado && f.posicion === null && <span className="ml-2 text-xs font-bold uppercase">Eliminado</span>}
                </td>
                <td className={td}>{f.jugados}</td>
                <td className={cn(td, "font-bold")}>{f.victorias}</td>
                <td className={td}>{f.derrotas}</td>
                <td className={td}>
                  {f.asaltosFavor}–{f.asaltosContra}
                </td>
                <td className={cn(td, !conPuntos && "pr-4")}>{f.faltas}</td>
                {conPuntos && <td className={cn(td, "pr-4 font-display font-extrabold")}>{f.puntos}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
