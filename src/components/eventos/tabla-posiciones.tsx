"use client";

import { ArrowDown, ArrowUp, Minus, Sparkles } from "lucide-react";
import { PodioMedallas } from "./podio";
import { textoKilos, textoPorcentaje, type FilaPosicion } from "@/lib/eventos/calculos";
import { cn } from "@/lib/utils";

/**
 * Podio y tabla de posiciones del Reto Transformación. Solo nombres y resultados: la cédula y el teléfono
 * nunca llegan a este componente (se usa también en la página pública de resultados).
 */

export function Podio({ filas, criterio }: { filas: FilaPosicion[]; criterio: "porcentaje" | "kilos" }) {
  return (
    <PodioMedallas
      lugares={filas
        .filter((f) => f.posicion !== null && f.posicion <= 3)
        .map((f) => ({
          id: f.participanteId,
          posicion: f.posicion!,
          nombre: f.nombre,
          valor: criterio === "porcentaje" ? textoPorcentaje(f.porcentaje!) : textoKilos(f.kilos!),
          detalle: `${criterio === "porcentaje" ? textoKilos(f.kilos!) : textoPorcentaje(f.porcentaje!)} perdido${criterio === "porcentaje" ? "s" : ""}`,
        }))}
    />
  );
}

function Flecha({ f }: { f: FilaPosicion }) {
  if (f.movimiento === "sube")
    return (
      <span className="inline-flex items-center text-exito" title={`Subió ${f.cambioPuestos} puesto${f.cambioPuestos === 1 ? "" : "s"}`}>
        <ArrowUp className="size-4" />
        <span className="cifras text-xs font-bold">{f.cambioPuestos}</span>
      </span>
    );
  if (f.movimiento === "baja")
    return (
      <span className="inline-flex items-center text-destructive" title={`Bajó ${-f.cambioPuestos} puesto${f.cambioPuestos === -1 ? "" : "s"}`}>
        <ArrowDown className="size-4" />
        <span className="cifras text-xs font-bold">{-f.cambioPuestos}</span>
      </span>
    );
  if (f.movimiento === "nuevo") return <Sparkles className="size-4 text-primary" aria-label="Nuevo en la tabla" />;
  if (f.movimiento === "igual") return <Minus className="size-4 text-muted-foreground" aria-label="Sin cambios" />;
  return null;
}

const th = "px-3 py-3 text-right first:pl-4 first:text-left";
const td = "cifras px-3 py-2.5 text-right whitespace-nowrap";

/** `publica`: sin pesos (inicial/actual), para el enlace de WhatsApp: solo nombre, kilos y porcentaje. */
export function TablaPosiciones({ filas, criterio, publica = false }: { filas: FilaPosicion[]; criterio: "porcentaje" | "kilos"; publica?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-3xl border bg-card shadow-sm">
      <table className={cn("w-full text-sm", publica ? "min-w-[22rem]" : "min-w-[40rem]")}>
        <thead>
          <tr className="border-b text-xs font-bold tracking-wide text-muted-foreground uppercase">
            <th className={th}>#</th>
            <th className="px-3 py-3 text-left">Participante</th>
            {!publica && <th className={th}>Inicial</th>}
            {!publica && <th className={th}>Actual</th>}
            <th className={cn(th, criterio === "kilos" && "text-foreground")}>Kilos</th>
            <th className={cn(th, criterio === "porcentaje" && "text-foreground")}>%</th>
            <th className="px-3 py-3 pr-4 text-center" aria-label="Movimiento" />
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.participanteId} className={cn("border-b last:border-0", f.posicion === null && "text-muted-foreground")}>
              <td className="cifras py-2.5 pl-4 font-display text-lg font-extrabold">{f.posicion ?? "—"}</td>
              <td className="px-3 py-2.5 font-semibold">{f.nombre}</td>
              {!publica && <td className={td}>{textoKilos(f.pesoInicial)}</td>}
              {f.pesoActual === null ? (
                <td colSpan={publica ? 2 : 3} className="px-3 py-2.5 text-right text-xs font-bold uppercase">
                  {f.estado === "no_completo" ? "No completó" : "Sin pesaje"}
                </td>
              ) : (
                <>
                  {!publica && <td className={td}>{textoKilos(f.pesoActual)}</td>}
                  <td className={cn(td, criterio === "kilos" && "font-extrabold", f.kilos! < 0 && "text-destructive")}>{textoKilos(f.kilos!)}</td>
                  <td className={cn(td, criterio === "porcentaje" && "font-extrabold", f.porcentaje! < 0 && "text-destructive")}>{textoPorcentaje(f.porcentaje!)}</td>
                </>
              )}
              <td className="px-3 py-2.5 pr-4 text-center">
                <Flecha f={f} />
              </td>
            </tr>
          ))}
          {filas.length === 0 && (
            <tr>
              <td colSpan={7} className="p-10 text-center text-muted-foreground">
                No hay participantes activos.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
