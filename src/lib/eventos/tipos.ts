/**
 * Catálogo de tipos de juego del módulo Eventos. Para agregar un tipo nuevo:
 * 1) su valor en `tipoJuegoEnum` (db/schema.ts) + migración, 2) una entrada aquí,
 * 3) su pantalla de detalle en app/admin/eventos/[tipo]/[id] (el listado y la ruta ya son genéricos).
 */
export type TipoJuego = "reto_transformacion";

export type DefinicionJuego = {
  tipo: TipoJuego;
  /** Segmento de la URL: /admin/eventos/<slug>. */
  slug: string;
  titulo: string;
  descripcion: string;
  /** Nombre del ícono de lucide-react (se resuelve en la interfaz). */
  icono: "Scale" | "Trophy";
  /** Nombre de cada evento de este tipo en singular/plural ("reto", "retos"). */
  singular: string;
  plural: string;
};

export const TIPOS_JUEGO: DefinicionJuego[] = [
  {
    tipo: "reto_transformacion",
    slug: "reto-transformacion",
    titulo: "Reto Transformación",
    descripcion: "Reto de pérdida de peso: inscribe participantes, registra sus pesajes y premia a quienes más bajan.",
    icono: "Scale",
    singular: "reto",
    plural: "retos",
  },
];

export const juegoPorSlug = (slug: string) => TIPOS_JUEGO.find((j) => j.slug === slug) ?? null;
export const juegoPorTipo = (tipo: TipoJuego) => TIPOS_JUEGO.find((j) => j.tipo === tipo)!;
