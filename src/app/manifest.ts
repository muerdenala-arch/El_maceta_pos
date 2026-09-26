import type { MetadataRoute } from "next";

/** App instalable en celular y PC (sección 1 del plan). Abre directo en el punto de venta. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "El Maseta — Punto de venta",
    short_name: "El Maseta",
    description: "Gestión y punto de venta de suplementos",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0e0e10",
    theme_color: "#0e0e10",
    lang: "es-BO",
    icons: [
      { src: "/icono/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icono/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icono/512?maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
