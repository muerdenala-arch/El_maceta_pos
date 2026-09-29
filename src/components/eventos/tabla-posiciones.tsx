"use client";

import { ArrowDown, ArrowUp, Medal, Minus, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { textoKilos, textoPorcentaje, type FilaPosicion } from "@/lib/eventos/calculos";
import { cn } from "@/lib/utils";

/**
 * Podio y tabla de posiciones del Reto Transformación. Solo nombres y resultados: la cédula y el teléfono
 * nunca llegan a este componente (se usa también en la página pública de resultados).
 */

const MEDALLA = {
  // En celular: 1.º, 2.º, 3.º hacia abajo. En pantallas anchas: 2.º – 1.º – 3.º (el primero al centro y más alto).
  1: { clase: "bg-medalla-oro", texto: "1.er lugar", lugar: "sm:order-2 sm:pb-8" },
  2: { clase: "bg-medalla-plata", texto: "2.º lugar", lugar: "sm:order-1 sm:pb-4" },
  3: { clase: "bg-medalla-bronce", texto: "3.er lugar", lugar: "sm:order-3" },
} as const;

export function Podio({ filas, criterio }: { filas: FilaPosicion[]; criterio: "porcentaje" | "kilos" }) {
  const podio = filas.filter((f) => f.posicion !== null && f.posicion <= 3);
  if (podio.length === 0) return null;
  return (
    <ol className="grid gap-3 sm:grid-cols-3 sm:items-end" aria-label="Podio">
      {podio.map((f) => {
        const m = MEDALLA[f.posicion as 1 | 2 | 3];
        return (
          <motion.li
            key={f.participanteId}
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.22, delay: (f.posicion! - 1) * 0.08, ease: "easeOut" }}
            className={m.lugar}
          >
            <div className={cn("rounded-3xl p-5 text-medalla-foreground shadow-sm", m.clase, f.posicion === 1 && "sm:py-8")}>
              <p className="flex items-center gap-2 text-sm font-extrabold tracking-wide uppercase">
                <Medal className="size-5" /> {m.texto}
              </p>
              <p className="mt-3 truncate font-display text-xl font-extrabold">{f.nombre}</p>
              <p className="cifras mt-1 font-display text-3xl font-extrabold">
                {criterio === "porcentaje" ? textoPorcentaje(f.porcentaje!) : textoKilos(f.kilos!)}
              </p>
              <p className="cifras text-sm font-semibold opacity-80">
                {criterio === "porcentaje" ? textoKilos(f.kilos!) : textoPorcentaje(f.porcentaje!)} perdido{criterio === "porcentaje" ? "s" : ""}
              </p>
            </div>
          </motion.li>
        );
      })}
    </ol>
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
