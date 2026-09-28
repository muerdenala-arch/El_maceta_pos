"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";

const CADA_MS = 15_000;

/**
 * Actualiza los datos de la pantalla cada 15 s sin que se note: router.refresh() vuelve a pedir los datos
 * al servidor y React los cambia en el lugar, sin recargar la página ni perder lo escrito o el carrito.
 * No lo hace con la pestaña oculta, sin internet, con un diálogo abierto ni con la pantalla bloqueada.
 */
export function RefrescoAutomatico() {
  const router = useRouter();

  useEffect(() => {
    let ultimo = Date.now();
    const refrescar = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [aria-busy="true"]')) return;
      ultimo = Date.now();
      startTransition(() => router.refresh());
    };
    const intervalo = window.setInterval(refrescar, CADA_MS);
    // Al volver a la app después de un rato, se actualiza enseguida.
    const alVolver = () => {
      if (document.visibilityState === "visible" && Date.now() - ultimo > CADA_MS) refrescar();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", refrescar);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("online", refrescar);
    };
  }, [router]);

  return null;
}
