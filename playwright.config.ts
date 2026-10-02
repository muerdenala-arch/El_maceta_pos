import { config } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

config({ path: ".env.local", quiet: true });

/**
 * Pruebas de punta a punta (Fase 9 del plan) contra una compilación de producción (el service worker
 * solo funciona ahí). `npm run e2e` compila, crea una base nueva (.pglite-e2e, ver e2e/preparar-base.ts),
 * levanta `next start` en el puerto 3100 y corre las pruebas. Con E2E_URL se usa un servidor ya levantado.
 * Usuario y PIN de prueba: SEED_* de .env.local, nunca en el código.
 */
process.env.E2E_CAJERO_USUARIO ??= process.env.SEED_CAJERO_USUARIO;
process.env.E2E_CAJERO_PIN ??= process.env.SEED_CAJERO_PIN;
process.env.E2E_ADMIN_USUARIO ??= process.env.SEED_ADMIN_USUARIO;
process.env.E2E_ADMIN_PIN ??= process.env.SEED_ADMIN_PIN;
process.env.E2E_ENCARGADO_USUARIO ??= process.env.SEED_ENCARGADO_USUARIO;
process.env.E2E_ENCARGADO_PIN ??= process.env.SEED_ENCARGADO_PIN;

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_URL ?? "http://localhost:3100",
    trace: "retain-on-failure",
    locale: "es-BO",
    timezoneId: "America/La_Paz",
  },
  webServer: process.env.E2E_URL
    ? undefined
    : {
        command: "npx tsx e2e/preparar-base.ts && npx next start -p 3100",
        url: "http://localhost:3100/login",
        env: { DATABASE_URL: "pglite:./.pglite-e2e" },
        reuseExistingServer: false,
        timeout: 120_000,
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } } }],
});
