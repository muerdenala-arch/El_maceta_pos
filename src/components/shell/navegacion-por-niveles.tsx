"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { padreDe } from "@/lib/navegacion/niveles";

/**
 * Botón atrás por niveles (lib/navegacion/niveles.ts): al retroceder desde una pantalla, se llega a su
 * pantalla "padre" (el reto → la lista de retos → Eventos → Inicio), no a cada apartado visitado antes.
 * Si el historial del navegador lleva a otro lado, se corrige reemplazando esa entrada por el padre.
 */
export function NavegacionPorNiveles() {
  const router = useRouter();
  const pathname = usePathname();
  const anterior = useRef(pathname);

  useEffect(() => {
    anterior.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const alRetroceder = () => {
      const destino = window.location.pathname;
      // Al volver a mostrar una página el navegador puede emitir otro "popstate" sin cambiar de pantalla: se ignora.
      if (destino === anterior.current) return;
      const padre = padreDe(anterior.current);
      if (padre && destino !== padre) router.replace(padre);
    };
    window.addEventListener("popstate", alRetroceder);
    return () => window.removeEventListener("popstate", alRetroceder);
  }, [router]);

  return null;
}
