import type { LucideIcon } from "lucide-react";
import { SoloEdicion } from "@/components/permisos/zona-modulo";

/** Título de pantalla con ícono naranja, subtítulo y acciones a la derecha (crear, guardar: no salen en un apartado con candado). */
export function EncabezadoPagina({
  icono: Icono,
  titulo,
  descripcion,
  children,
}: {
  icono: LucideIcon;
  titulo: string;
  descripcion?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2.5 text-2xl font-extrabold sm:text-3xl">
          <Icono className="size-7 shrink-0 text-primary" />
          {titulo}
        </h1>
        {descripcion && <p className="mt-1 text-muted-foreground">{descripcion}</p>}
      </div>
      {children && (
        <SoloEdicion>
          <div className="flex flex-wrap items-center gap-2">{children}</div>
        </SoloEdicion>
      )}
    </header>
  );
}
