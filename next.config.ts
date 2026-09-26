import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (BD local de desarrollo) carga archivos WASM: no debe empaquetarse.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
