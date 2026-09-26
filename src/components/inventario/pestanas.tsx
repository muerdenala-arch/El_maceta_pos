import Link from "next/link";
import { cn } from "@/lib/utils";

/** Pestañas como enlaces (?vista=...): se pueden compartir y sobreviven a recargas. */
export function Pestanas({
  actual,
  opciones,
}: {
  actual: string;
  opciones: { valor: string; titulo: string; href: string; contador?: number }[];
}) {
  return (
    <nav className="sin-barra -mx-4 flex gap-1 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0" aria-label="Secciones">
      {opciones.map((o) => (
        <Link
          key={o.valor}
          href={o.href}
          scroll={false}
          aria-current={actual === o.valor ? "page" : undefined}
          className={cn(
            "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold whitespace-nowrap transition-colors",
            actual === o.valor ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {o.titulo}
          {!!o.contador && (
            <span className="cifras rounded-full bg-primary px-2 py-0.5 text-[11px] text-primary-foreground">{o.contador}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}
