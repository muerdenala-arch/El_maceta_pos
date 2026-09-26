import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (BD local de desarrollo) carga archivos WASM: no debe empaquetarse.
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    // Las imágenes llegan comprimidas (máx. 2 MB); margen para el formato multipart.
    serverActions: { bodySizeLimit: "2.5mb" },
  },
};

export default nextConfig;
