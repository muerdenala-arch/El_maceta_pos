"use client";

import { useState, useSyncExternalStore } from "react";
import { sincronizarAhora, usePendientes } from "@/lib/offline/sincronizar";
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
 * Estado de conexión: En línea / Sin conexión / N pendientes de sincronizar (sección 8.5 del plan).
 * Tocarlo con pendientes y conexión fuerza la sincronización.
 */
export function IndicadorConexion() {
  const enLinea = useSyncExternalStore(suscribir, () => navigator.onLine, () => true);
  const { pendientes, conError } = usePendientes();
  const [enviando, setEnviando] = useState(false);

  const texto = enviando
    ? "Sincronizando…"
    : !enLinea
      ? pendientes > 0
        ? `Sin conexión · ${pendientes} pendiente${pendientes === 1 ? "" : "s"}`
        : "Sin conexión"
      : pendientes > 0
        ? `${pendientes} pendiente${pendientes === 1 ? "" : "s"}`
        : conError > 0
          ? `${conError} con error`
          : "En línea";

  return (
    <button
      type="button"
      role="status"
      aria-live="polite"
      title={pendientes > 0 && enLinea ? "Sincronizar ahora" : texto}
      disabled={!enLinea || pendientes === 0 || enviando}
      onClick={async () => {
        setEnviando(true);
        await sincronizarAhora().catch(() => {});
        setEnviando(false);
      }}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold disabled:cursor-default",
        !enLinea && "border-destructive/40 bg-destructive/10 text-destructive",
        enLinea && (pendientes > 0 || conError > 0) && "border-aviso/50 bg-aviso/15 text-foreground",
        enLinea && pendientes === 0 && conError === 0 && "text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "size-2 rounded-full",
          !enLinea ? "bg-destructive" : pendientes > 0 || conError > 0 ? "bg-aviso" : "bg-exito",
          enviando && "animate-pulse",
        )}
      />
      {texto}
    </button>
  );
}
