/* eslint-disable @next/next/no-img-element -- el logo viene de Vercel Blob y es pequeño */
import { cn } from "@/lib/utils";

const ARTICULOS = new Set(["el", "la", "los", "las", "the"]);

/** "El Maseta" → "M": inicial de la primera palabra que no sea un artículo. */
function inicial(nombre: string) {
  const palabras = nombre.trim().split(/\s+/);
  const principal = palabras.find((p) => !ARTICULOS.has(p.toLowerCase())) ?? palabras[0] ?? "";
  return principal.charAt(0).toUpperCase();
}

/**
 * Logo circular con aro de colores. Si todavía no hay logo cargado en Configuración (Fase 2),
 * muestra la inicial del nombre comercial.
 */
export function Logo({
  nombre,
  url,
  className,
}: {
  nombre: string;
  url?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex size-10 shrink-0 rounded-full bg-[conic-gradient(from_200deg,var(--chart-1),var(--chart-2),var(--chart-3),var(--chart-1))] p-[3px]",
        className,
      )}
    >
      <span className="flex size-full items-center justify-center overflow-hidden rounded-full bg-card [container-type:size]">
        {url ? (
          <img src={url} alt={nombre} className="size-full object-cover" />
        ) : (
          <span className="font-display text-[50cqw] leading-none font-extrabold text-primary">
            {inicial(nombre)}
          </span>
        )}
      </span>
    </span>
  );
}
