import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas de flujos completos (Fase 9 del plan). Se corren contra una compilación de producción
 * (el service worker solo funciona ahí), por ejemplo:
 *   npm run build && DATABASE_URL=pglite:./.pglite-prueba npx next start -p 3100
 *   E2E_URL=http://localhost:3100 E2E_CAJERO_USUARIO=... E2E_CAJERO_PIN=... npx playwright test
 * Las credenciales son de prueba y se pasan por variables de entorno, nunca en el código.
 */
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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } } }],
});
