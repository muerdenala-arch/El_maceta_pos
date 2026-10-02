"use client";

import { Delete } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const PIN_MIN = 4;
export const PIN_MAX = 6;

type Props = {
  valor: string;
  onCambiar: (valor: string) => void;
  onEnviar: () => void;
  ocupado?: boolean;
  /** Mensaje de error; cambiar `intentoError` dispara la animación de sacudida. */
  error?: string | null;
  intentoError?: number;
  textoBoton?: string;
  /** Sin botón de confirmar: la pantalla prueba el PIN sola al completarse (Enter sigue funcionando). */
  sinBoton?: boolean;
};

/**
 * Teclado numérico para el PIN (4 a 6 dígitos). También acepta el teclado físico:
 * dígitos, Retroceso, Escape (borrar todo) y Enter, salvo cuando el foco está en un campo de texto.
 */
export function TecladoPin({
  valor,
  onCambiar,
  onEnviar,
  ocupado,
  error,
  intentoError = 0,
  textoBoton = "Ingresar",
  sinBoton = false,
}: Props) {
  const completo = valor.length >= PIN_MIN;
  // Refs para que el listener del teclado físico siempre vea el estado actual.
  const estado = useRef({ valor, ocupado, completo, onCambiar, onEnviar });
  useEffect(() => {
    estado.current = { valor, ocupado, completo, onCambiar, onEnviar };
  });

  useEffect(() => {
    function alPresionar(e: KeyboardEvent) {
      const destino = e.target instanceof Element ? e.target : null;
      if (destino?.closest("input, textarea, select, [contenteditable]")) return;
      const { valor, ocupado, completo, onCambiar, onEnviar } = estado.current;
      if (ocupado) return;
      if (/^\d$/.test(e.key) && valor.length < PIN_MAX) onCambiar(valor + e.key);
      else if (e.key === "Backspace") onCambiar(valor.slice(0, -1));
      else if (e.key === "Escape" || e.key === "Delete") onCambiar("");
      else if (e.key === "Enter" && completo) onEnviar();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, []);

  const pulsar = (digito: string) => {
    if (!ocupado && valor.length < PIN_MAX) onCambiar(valor + digito);
  };
  const puntos = Math.max(PIN_MIN, valor.length);

  return (
    <div className="flex flex-col items-center">
      <motion.div
        key={intentoError}
        animate={intentoError ? { x: [0, -10, 10, -7, 7, -3, 0] } : undefined}
        transition={{ duration: 0.4 }}
        className="flex h-6 items-center gap-4"
        aria-label={`${valor.length} dígitos ingresados`}
        role="status"
      >
        {Array.from({ length: puntos }, (_, i) => (
          <span
            key={i}
            className={cn(
              "size-4 rounded-full border-2 transition-colors duration-150",
              error ? "border-destructive" : "border-primary",
              i < valor.length && (error ? "bg-destructive" : "bg-primary"),
            )}
          />
        ))}
      </motion.div>

      <p role="alert" className="mt-3 min-h-5 text-center text-sm font-medium text-destructive">
        {error}
      </p>

      <div className="mt-3 grid w-full grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Tecla key={d} onClick={() => pulsar(d)} disabled={ocupado}>
            {d}
          </Tecla>
        ))}
        <Tecla variante="accion" onClick={() => onCambiar("")} disabled={ocupado} aria-label="Borrar todo">
          C
        </Tecla>
        <Tecla onClick={() => pulsar("0")} disabled={ocupado}>
          0
        </Tecla>
        <Tecla
          variante="accion"
          onClick={() => onCambiar(valor.slice(0, -1))}
          disabled={ocupado}
          aria-label="Borrar un dígito"
        >
          <Delete className="size-6" />
        </Tecla>
      </div>

      {sinBoton ? (
        <p className="mt-4 h-5 text-center text-sm font-semibold text-muted-foreground" aria-live="polite">
          {ocupado ? "Verificando…" : ""}
        </p>
      ) : (
        <Button
          type="button"
          size="lg"
          className="mt-5 h-12 w-full rounded-xl text-base font-bold"
          disabled={!completo || ocupado}
          onClick={onEnviar}
        >
          {ocupado ? "Verificando…" : textoBoton}
        </Button>
      )}
    </div>
  );
}

function Tecla({
  variante = "digito",
  className,
  ...props
}: React.ComponentProps<"button"> & { variante?: "digito" | "accion" }) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-14 items-center justify-center rounded-2xl [@media(min-height:800px)]:h-16 font-display text-2xl font-bold shadow-sm transition-[transform,background-color] duration-100 select-none active:scale-95 disabled:opacity-50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        variante === "digito"
          ? "bg-secondary text-foreground hover:bg-accent"
          : "bg-muted-foreground/25 text-muted-foreground hover:bg-muted-foreground/35",
        className,
      )}
      {...props}
    />
  );
}
