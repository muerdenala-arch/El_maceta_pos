import { expect, type Page } from "@playwright/test";

/** Credenciales de prueba: vienen de .env.local (SEED_*) a través de playwright.config.ts. */
export const CAJERO = { usuario: process.env.E2E_CAJERO_USUARIO ?? "", pin: process.env.E2E_CAJERO_PIN ?? "" };
export const ADMIN = { usuario: process.env.E2E_ADMIN_USUARIO ?? "", pin: process.env.E2E_ADMIN_PIN ?? "" };

/** Escribe el PIN con el teclado físico (el teclado en pantalla escucha keydown en la ventana). */
export async function escribirPin(page: Page, pin: string) {
  await page.keyboard.type(pin);
}

/** Desbloquea la pantalla de PIN (el PIN puede tener 4 a 6 dígitos: se confirma con Enter). */
export async function desbloquear(page: Page, pin: string) {
  await escribirPin(page, pin);
  await page.keyboard.press("Enter");
}

/** Ingreso solo con el PIN (el sistema reconoce al usuario). */
async function login(page: Page, { pin }: { pin: string }) {
  await page.goto("/login");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await escribirPin(page, pin);
  if (pin.length < 6) await page.keyboard.press("Enter"); // con 6 dígitos entra solo
}

/** Cajero en el punto de venta; si no tiene caja abierta y `abrirSiHaceFalta`, la abre con Bs 100. */
export async function ingresarCajero(page: Page, { abrirSiHaceFalta = true } = {}) {
  await login(page, CAJERO);
  const buscador = page.getByPlaceholder(/Buscar por nombre/);
  const apertura = page.getByRole("heading", { name: "Abrir caja" });
  await expect(buscador.or(apertura)).toBeVisible({ timeout: 30_000 });
  if (abrirSiHaceFalta && (await apertura.isVisible())) {
    await page.getByRole("button", { name: "Bs 100,00" }).click();
    await page.getByRole("button", { name: "Abrir caja", exact: true }).click();
    await expect(buscador).toBeVisible();
  }
}

export async function ingresarAdmin(page: Page) {
  await login(page, ADMIN);
  await page.waitForURL("**/admin/dashboard");
}

/** Agrega al carrito el primer producto con stock (botón principal de la tarjeta). */
export async function agregarProducto(page: Page, nombre?: RegExp) {
  const tarjetas = page.locator("main li").filter({ hasText: nombre ?? /Bs/ });
  await tarjetas.locator("button:not([disabled])").filter({ hasText: /Bs/ }).first().click();
}

/** Cobra el carrito actual. */
export async function cobrar(page: Page, metodo: "Efectivo" | "QR") {
  await page.getByRole("button", { name: "Cobrar", exact: true }).click();
  await page.getByRole("radio", { name: metodo }).click();
  if (metodo === "Efectivo") await page.getByRole("button", { name: "Exacto" }).click();
  await page.getByRole("dialog").locator("form button[type=submit]").click();
}
