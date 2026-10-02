"use client";

import { Lock } from "lucide-react";
import { createContext, useContext } from "react";

const Contexto = createContext(false);

/** true dentro de un apartado que el encargado tiene con candado: se ve, pero no se cambia nada. */
export const useSoloLectura = () => useContext(Contexto);

/**
 * Envuelve la pantalla de un apartado compartido con el encargado. Modo "solo lectura" (hoy sin uso: con el candado
 * cerrado el encargado no entra al apartado; se conserva por si se quiere volver a un candado de solo consulta): avisa arriba, oculta los
 * botones de crear (`<SoloEdicion>`), deja los formularios sin guardar y `useAccion` no envía nada. El servidor
 * rechaza igual cualquier cambio (autorizarModulo): esto es solo la parte visible.
 */
export function ZonaModulo({ soloLectura, children }: { soloLectura: boolean; children: React.ReactNode }) {
  return (
    <Contexto.Provider value={soloLectura}>
      {soloLectura && (
        <p role="status" className="mx-auto mb-5 flex max-w-7xl items-center gap-2.5 rounded-2xl border border-aviso/50 bg-aviso/10 px-4 py-3 text-sm font-semibold">
          <Lock className="size-4 shrink-0" />
          Apartado con candado: puedes consultarlo, pero solo el administrador puede hacer cambios.
        </p>
      )}
      {children}
    </Contexto.Provider>
  );
}

/** Lo que solo tiene sentido si se puede editar (botones de crear, guardar…): desaparece con el candado cerrado. */
export function SoloEdicion({ children }: { children: React.ReactNode }) {
  return useSoloLectura() ? null : <>{children}</>;
}
