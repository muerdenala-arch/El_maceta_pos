"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string; campos?: Record<string, string> };

/**
 * Ejecuta una server action de formulario: estado "guardando", errores por campo
 * y aviso (toast) de éxito o error general.
 */
export function useAccion<E, T>(
  accion: (entrada: E) => Promise<Resultado<T>>,
  opciones: { mensajeExito?: string; alExito?: (datos: T) => void } = {},
) {
  const [pendiente, iniciar] = useTransition();
  const [campos, setCampos] = useState<Record<string, string>>({});

  const ejecutar = (entrada: E) =>
    iniciar(async () => {
      try {
        const r = await accion(entrada);
        if (r.ok) {
          setCampos({});
          if (opciones.mensajeExito) toast.success(opciones.mensajeExito);
          opciones.alExito?.(r.datos);
        } else {
          setCampos(r.campos ?? {});
          toast.error(r.error);
        }
      } catch {
        toast.error("No se pudo completar. Revisa tu conexión e intenta de nuevo.");
      }
    });

  const limpiarCampo = (nombre: string) =>
    setCampos((c) => {
      if (!(nombre in c)) return c;
      const resto = { ...c };
      delete resto[nombre];
      return resto;
    });

  return { ejecutar, pendiente, campos, limpiarCampo, reiniciar: () => setCampos({}) };
}
