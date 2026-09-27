import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (BD local de desarrollo) carga archivos WASM: no debe empaquetarse.
  serverExternalPackages: ["@electric-sql/pglite"],
  // El service worker nunca se guarda en caché del navegador: así cada versión nueva se instala enseguida.
  async headers() {
    return [
      {
        // Seguridad básica: la app no se incrusta en otros sitios, sin adivinar tipos de archivo,
        // sin enviar la URL completa a otros sitios y sin acceso a micrófono ni ubicación.
        source: "/:ruta*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
  experimental: {
    // Las imágenes llegan comprimidas (máx. 2 MB); margen para el formato multipart.
    serverActions: { bodySizeLimit: "2.5mb" },
  },
};

export default nextConfig;
