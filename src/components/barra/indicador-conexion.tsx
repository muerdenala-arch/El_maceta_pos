"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

function suscribir(avisar: () => void) {
  window.addEventListener("online", avisar);
  window.addEventListener("offline", avisar);
  return () => {
    window.removeEventListener("online", avisar);
    window.removeEventListener("offline", avisar);
  };
}

/**
 * Estado de conexión: En línea / Sin conexión.
 * En la Fase 6 se sumará la cantidad de operaciones pendientes de sincronizar.
 */
export function IndicadorConexion({ pendientes = 0 }: { pendientes?: number }) {
  const enLinea = useSyncExternalStore(
    suscribir,
    () => navigator.onLine,
    () => true,
  );

  const texto = !enLinea
    ? "Sin conexión"
    : pendientes > 0
      ? `${pendientes} pendiente${pendientes === 1 ? "" : "s"}`
      : "En línea";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
        !enLinea && "border-destructive/40 bg-destructive/10 text-destructive",
        enLinea && pendientes > 0 && "border-aviso/50 bg-aviso/15 text-foreground",
        enLinea && pendientes === 0 && "text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "size-2 rounded-full",
          !enLinea ? "bg-destructive" : pendientes > 0 ? "bg-aviso" : "bg-exito",
        )}
      />
      <span className="hidden sm:inline">{texto}</span>
    </div>
  );
}
