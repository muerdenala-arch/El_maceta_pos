"use client";

import { Lock, LockOpen } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { cambiarCandado } from "@/lib/auth/modulo-acciones";
import type { ModuloEncargado } from "@/lib/auth/modulos";
import { cn } from "@/lib/utils";

/**
 * Candado de un apartado en el menú del administrador: cerrado = los encargados no tienen ese apartado (no les aparece);
 * abierto = les aparece y pueden trabajar en él. Un toque lo cambia (vale para todos los encargados y queda en auditoría).
 */
export function BotonCandado({ modulo, titulo, abierto }: { modulo: ModuloEncargado; titulo: string; abierto: boolean }) {
  const [ocupado, iniciar] = useTransition();
  const Icono = abierto ? LockOpen : Lock;
  const explicacion = abierto ? `${titulo}: los encargados lo tienen en su menú. Toca para cerrar el candado y quitárselo.` : `${titulo}: los encargados no lo ven. Toca para abrir el candado y dárselo.`;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={abierto}
      aria-label={`Candado de ${titulo} para encargados: ${abierto ? "abierto" : "cerrado"}`}
      title={explicacion}
      disabled={ocupado}
      onClick={() =>
        iniciar(async () => {
          try {
            const r = await cambiarCandado({ modulo, abierto: !abierto });
            if (r.ok) toast.success(abierto ? `${titulo}: candado cerrado. Ya no les aparece a los encargados.` : `${titulo}: candado abierto. Ahora les aparece a los encargados.`);
            else toast.error(r.error);
          } catch {
            toast.error("No se pudo cambiar el candado. Revisa tu conexión.");
          }
        })
      }
      className={cn(
        "absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50",
        abierto ? "bg-exito/15 text-exito hover:bg-exito/25" : "text-sidebar-foreground/45 hover:bg-sidebar-accent hover:text-sidebar-foreground",
      )}
    >
      <Icono className="size-4" strokeWidth={2.2} />
    </button>
  );
}
