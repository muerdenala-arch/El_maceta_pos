import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto que se muestra al instante al tocar un enlace, mientras llegan los datos del servidor.
 * Además hace que Next prepare de antemano los enlaces del menú (rutas dinámicas con loading.js).
 */
export function CargandoPagina() {
  return (
    <div className="mx-auto max-w-6xl space-y-6" aria-busy="true" aria-label="Cargando">
      <div className="space-y-2">
        <Skeleton className="h-9 w-64 rounded-xl" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-3xl" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
