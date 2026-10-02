"use client";

import { Search, SearchX, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tramos } from "@/lib/busqueda";
import { cn } from "@/lib/utils";

const ESPERA_MS = 200;

type Props = {
  /** Consulta vigente (ya aplicada). Si cambia desde afuera (p. ej. "Limpiar búsqueda"), el campo se actualiza. */
  valor: string;
  /** Se llama ~200 ms después de dejar de escribir (al instante al limpiar o presionar Enter). */
  onCambiar: (consulta: string) => void;
  placeholder?: string;
  /** Nombre accesible del campo. */
  etiqueta?: string;
  className?: string;
  grande?: boolean;
  /** Para atajos (el punto de venta enfoca el campo al teclear o escanear). */
  refCampo?: React.Ref<HTMLInputElement>;
  /** Enter con el texto tal como está escrito (sin esperar). Si devuelve true, el campo se limpia (p. ej. código escaneado). */
  onEnter?: (texto: string) => boolean;
  autoFocus?: boolean;
};

/**
 * Buscador único del sistema: filtra mientras se escribe (con una espera corta), sin Enter ni botón, y con ✕ para
 * limpiar. Quien lo usa filtra con `coincide()` y pinta con `<Resaltar>` y `<SinResultados>`.
 */
export function Buscador({ valor, onCambiar, placeholder = "Buscar…", etiqueta = "Buscar", className, grande, refCampo, onEnter, autoFocus }: Props) {
  const [texto, setTexto] = useState(valor);
  const [aplicado, setAplicado] = useState(valor);
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Cambio desde afuera (limpiar, navegación): se refleja en el campo.
  if (valor !== aplicado) {
    setAplicado(valor);
    setTexto(valor);
  }
  useEffect(() => () => clearTimeout(espera.current), []);

  const aplicar = (t: string) => {
    clearTimeout(espera.current);
    setAplicado(t);
    onCambiar(t);
  };
  const escribir = (t: string) => {
    setTexto(t);
    clearTimeout(espera.current);
    if (t.trim() === "") aplicar("");
    else espera.current = setTimeout(() => aplicar(t), ESPERA_MS);
  };

  return (
    <label className={cn("relative block w-full max-w-sm", className)}>
      <span className="sr-only">{etiqueta}</span>
      <Search className={cn("pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground", grande ? "left-4 size-5" : "left-3.5 size-4")} />
      <Input
        ref={refCampo}
        type="text"
        role="searchbox"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        value={texto}
        onChange={(e) => escribir(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (onEnter?.(texto)) escribir("");
            else aplicar(texto);
          }
          if (e.key === "Escape" && texto) {
            e.preventDefault();
            escribir("");
          }
        }}
        placeholder={placeholder}
        className={cn("rounded-full", grande ? "h-13 pr-12 pl-12 text-base" : "h-11 pr-10 pl-10")}
      />
      {texto && (
        <button
          type="button"
          aria-label="Limpiar búsqueda"
          onClick={() => escribir("")}
          className={cn(
            "absolute top-1/2 grid -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            grande ? "right-2.5 size-8" : "right-2 size-7",
          )}
        >
          <X className="size-4" />
        </button>
      )}
    </label>
  );
}

/** Texto con las coincidencias de la búsqueda resaltadas. */
export function Resaltar({ texto, consulta }: { texto: string | null | undefined; consulta: string }) {
  if (!texto) return null;
  if (!consulta.trim()) return <>{texto}</>;
  return (
    <>
      {tramos(texto, consulta).map((t, i) =>
        t.resaltado ? (
          <mark key={i} className="rounded-[0.2em] bg-primary/25 text-inherit">
            {t.texto}
          </mark>
        ) : (
          t.texto
        ),
      )}
    </>
  );
}

/** Mensaje cuando la búsqueda no encuentra nada, con botón para limpiarla. */
export function SinResultados({ consulta, onLimpiar, className }: { consulta: string; onLimpiar: () => void; className?: string }) {
  return (
    <div role="status" className={cn("flex flex-col items-center gap-3 rounded-3xl border border-dashed p-8 text-center", className)}>
      <SearchX className="size-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        No se encontraron resultados para <strong className="break-all text-foreground">“{consulta.trim()}”</strong>
      </p>
      <Button variant="outline" size="sm" className="rounded-full" onClick={onLimpiar}>
        <X className="size-4" /> Limpiar búsqueda
      </Button>
    </div>
  );
}

/**
 * Para listas que consulta el servidor (paginadas): la consulta vive en `?q=` y se cambia con `replace`
 * (no suma pasos al botón atrás), volviendo a la primera página.
 */
export function useBusquedaUrl(parametro = "q", reiniciar: string[] = ["pagina"]) {
  const router = useRouter();
  const ruta = usePathname();
  const parametros = useSearchParams();
  const valor = parametros.get(parametro) ?? "";
  const cambiar = (consulta: string) => {
    const p = new URLSearchParams(parametros);
    if (consulta.trim()) p.set(parametro, consulta.trim());
    else p.delete(parametro);
    for (const r of reiniciar) p.delete(r);
    const q = p.toString();
    router.replace(q ? `${ruta}?${q}` : ruta, { scroll: false });
  };
  return { valor, cambiar };
}
