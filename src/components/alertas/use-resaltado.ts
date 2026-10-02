"use client";

import { useEffect, useRef, useState } from "react";

/** La campanita lo emite al tocar una alerta: vuelve a resaltar aunque la dirección no haya cambiado. */
export const EVENTO_RESALTAR = "maseta:resaltar";

/**
 * Fila o tarjeta a la que se llega desde una alerta (`?resaltar=ID`): se desplaza hasta ella, parpadea (clase
 * `fila-resaltada`) y queda marcada hasta que se hace clic en otro lugar. Devuelve también `clave`, que cambia
 * con cada llegada: sirve para quitar filtros que la oculten y para reiniciar el parpadeo.
 */
export function useResaltado<T extends HTMLElement>(id: number | null) {
  const ref = useRef<T>(null);
  const [descartado, setDescartado] = useState<number | null>(null);
  const [vez, setVez] = useState(0);
  const activo = id !== null && descartado !== id;

  useEffect(() => {
    const otraVez = () => {
      setDescartado(null);
      setVez((v) => v + 1);
    };
    window.addEventListener(EVENTO_RESALTAR, otraVez);
    return () => window.removeEventListener(EVENTO_RESALTAR, otraVez);
  }, []);

  useEffect(() => {
    if (!activo) return;
    const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Con llaves: scrollIntoView devuelve una promesa en Chrome y React la tomaría como limpieza.
    ref.current?.scrollIntoView({ behavior: sinMovimiento ? "auto" : "smooth", block: "center" });

    const fuera = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setDescartado(id);
    };
    // Un instante después: el clic que trajo hasta aquí no cuenta como "clic en otro lugar".
    const t = setTimeout(() => document.addEventListener("pointerdown", fuera), 400);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", fuera);
    };
  }, [activo, id, vez]);

  return { ref, activo, clave: `${id ?? ""}:${vez}` };
}
