"use client";

import { Medal } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/** Una tarjeta del podio: puesto (1–3), nombre, cifra principal y detalle. */
export type LugarPodio = { id: number; posicion: number; nombre: string; valor: string; detalle?: string };

const MEDALLA = {
  // En celular: 1.º, 2.º, 3.º hacia abajo. En pantallas anchas: 2.º – 1.º – 3.º (el primero al centro y más alto).
  1: { clase: "bg-medalla-oro", texto: "1.er lugar", lugar: "sm:order-2 sm:pb-8" },
  2: { clase: "bg-medalla-plata", texto: "2.º lugar", lugar: "sm:order-1 sm:pb-4" },
  3: { clase: "bg-medalla-bronce", texto: "3.er lugar", lugar: "sm:order-3" },
} as const;

/** Podio oro/plata/bronce con una animación corta al cargar (reto y torneo). */
export function PodioMedallas({ lugares }: { lugares: LugarPodio[] }) {
  const podio = lugares.filter((l) => l.posicion >= 1 && l.posicion <= 3);
  if (podio.length === 0) return null;
  return (
    <ol className="grid gap-3 sm:grid-cols-3 sm:items-end" aria-label="Podio">
      {podio.map((l) => {
        const m = MEDALLA[l.posicion as 1 | 2 | 3];
        return (
          <motion.li
            key={l.id}
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.22, delay: (l.posicion - 1) * 0.08, ease: "easeOut" }}
            className={m.lugar}
          >
            <div className={cn("rounded-3xl p-5 text-medalla-foreground shadow-sm", m.clase, l.posicion === 1 && "sm:py-8")}>
              <p className="flex items-center gap-2 text-sm font-extrabold tracking-wide uppercase">
                <Medal className="size-5" /> {m.texto}
              </p>
              <p className="mt-3 truncate font-display text-xl font-extrabold">{l.nombre}</p>
              <p className="cifras mt-1 font-display text-3xl font-extrabold">{l.valor}</p>
              {l.detalle && <p className="cifras text-sm font-semibold opacity-80">{l.detalle}</p>}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
