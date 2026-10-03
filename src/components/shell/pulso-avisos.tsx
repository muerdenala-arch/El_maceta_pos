"use client";

import { useEffect } from "react";

const CADA_MS = 60_000;

/**
 * Mientras la app está abierta en cualquier equipo, cada minuto pide al servidor que envíe los avisos cuya hora ya
 * llegó (recordatorios). Es el respaldo del cron: con la app cerrada en todos lados, el aviso sale apenas alguien la abre.
 */
export function PulsoAvisos() {
  useEffect(() => {
    const pulso = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      fetch("/api/recordatorios/despachar", { cache: "no-store" }).catch(() => {});
    };
    pulso();
    const intervalo = window.setInterval(pulso, CADA_MS);
    document.addEventListener("visibilitychange", pulso);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", pulso);
    };
  }, []);
  return null;
}
