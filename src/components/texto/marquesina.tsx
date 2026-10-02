"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const VELOCIDAD = 40; // px por segundo
const PAUSA_MS = 1500; // quieto al inicio y al final antes de volver

function useMedia(consulta: string) {
  return useSyncExternalStore(
    (avisar) => {
      const m = window.matchMedia(consulta);
      m.addEventListener("change", avisar);
      return () => m.removeEventListener("change", avisar);
    },
    () => window.matchMedia(consulta).matches,
    () => false,
  );
}

type Props = {
  children: React.ReactNode;
  className?: string;
  /** Se mueve solo, sin esperar al mouse (tarjetas del punto de venta). En pantallas táctiles siempre es así. */
  siempre?: boolean;
  /** Texto completo para el `title` (cuando `children` no es texto simple). */
  titulo?: string;
};

/**
 * Nombre en una línea que, si no entra en su espacio, se desplaza despacio de lado para mostrarse completo
 * (ida, pausa, vuelta, pausa). Si entra, queda quieto. En PC se mueve al pasar el mouse por la fila o tarjeta
 * (el ancestro con `data-desplazar`, o el propio texto); en táctil, solo. Con "reducir movimiento" no se anima:
 * se muestra en dos líneas.
 */
export function Marquesina({ children, className, siempre = false, titulo }: Props) {
  const caja = useRef<HTMLSpanElement>(null);
  const texto = useRef<HTMLSpanElement>(null);
  const [sobra, setSobra] = useState(0);
  const [encima, setEncima] = useState(false);
  const sinMovimiento = useMedia("(prefers-reduced-motion: reduce)");
  const tactil = useMedia("(hover: none)");
  const activa = !sinMovimiento && sobra > 0 && (siempre || tactil || encima);

  // ¿Cuánto se desborda? Se vuelve a medir si cambia el ancho o el contenido.
  useEffect(() => {
    const c = caja.current;
    const t = texto.current;
    if (!c || !t) return;
    const medir = () => {
      const d = Math.ceil(t.scrollWidth - c.clientWidth);
      setSobra(d > 1 ? d : 0);
    };
    medir();
    const o = new ResizeObserver(medir);
    o.observe(c);
    o.observe(t);
    return () => o.disconnect();
  }, [children, sinMovimiento]);

  // En PC: al pasar el mouse por la fila o tarjeta.
  useEffect(() => {
    const zona = caja.current?.closest<HTMLElement>("[data-desplazar]") ?? caja.current;
    if (!zona || siempre) return;
    const entra = () => setEncima(true);
    const sale = () => setEncima(false);
    zona.addEventListener("pointerenter", entra);
    zona.addEventListener("pointerleave", sale);
    zona.addEventListener("focusin", entra);
    zona.addEventListener("focusout", sale);
    return () => {
      zona.removeEventListener("pointerenter", entra);
      zona.removeEventListener("pointerleave", sale);
      zona.removeEventListener("focusin", entra);
      zona.removeEventListener("focusout", sale);
    };
  }, [siempre]);

  useEffect(() => {
    const t = texto.current;
    if (!t || !activa) return;
    // Ida y vuelta: media pausa en cada extremo de cada tramo = 1,5 s quieto en cada punta.
    const recorrido = (sobra / VELOCIDAD) * 1000;
    const total = recorrido + PAUSA_MS;
    const quieto = PAUSA_MS / 2 / total;
    const fin = `translateX(${-sobra}px)`;
    const animacion = t.animate(
      [
        { transform: "translateX(0)", offset: 0 },
        { transform: "translateX(0)", offset: quieto },
        { transform: fin, offset: 1 - quieto },
        { transform: fin, offset: 1 },
      ],
      { duration: total, delay: PAUSA_MS / 2, iterations: Infinity, direction: "alternate", easing: "linear" }, // + media pausa: 1,5 s también al arrancar
    );
    return () => animacion.cancel();
  }, [activa, sobra]);

  return (
    <span
      ref={caja}
      title={titulo ?? (typeof children === "string" ? children : undefined)}
      data-desborda={sobra > 0 || undefined}
      data-moviendo={activa || undefined}
      className={cn("marquesina block min-w-0 overflow-hidden", className)}
    >
      <span ref={texto} className="inline-block whitespace-nowrap will-change-transform motion-reduce:line-clamp-2 motion-reduce:whitespace-normal">
        {children}
      </span>
    </span>
  );
}
