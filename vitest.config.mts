import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": src },
  },
  test: {
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: "unitarias",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
          exclude: ["src/**/*.integracion.test.ts"],
        },
      },
      {
        // Server actions y consultas reales contra PostgreSQL en memoria (PGlite): cada archivo arma
        // su propia base desde cero con las migraciones. Nunca toca datos reales.
        extends: true,
        resolve: {
          alias: { "server-only": fileURLToPath(new URL("./src/test/vacio.ts", import.meta.url)) },
        },
        test: {
          name: "integracion",
          include: ["src/**/*.integracion.test.ts"],
          setupFiles: ["src/test/entorno.ts"],
          testTimeout: 30_000,
          hookTimeout: 60_000,
          env: {
            DATABASE_URL: "pglite:memory://",
            JWT_SECRET: "clave-solo-para-pruebas-automaticas-0123456789",
            SESION_HORAS: "12",
          },
        },
      },
    ],
  },
});
