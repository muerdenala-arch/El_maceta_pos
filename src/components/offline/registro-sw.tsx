"use client";

import { useEffect } from "react";

/**
 * Registra el service worker (public/sw.js). Solo en producción: en desarrollo los archivos cambian
 * en cada edición y la caché serviría código viejo. Para probarlo en desarrollo: NEXT_PUBLIC_SW=1.
 */
export function RegistroServiceWorker() {
  useEffect(() => {
    const activo = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_SW === "1";
    if (!activo || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Sin service worker la app funciona igual, solo que no abre sin internet.
    });
  }, []);
  return null;
}
