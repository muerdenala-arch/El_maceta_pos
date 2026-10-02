import { expect, test } from "@playwright/test";
import { ADMIN, CAJERO, agregarProducto, ingresarAdmin, ingresarCajero } from "./ayudas";

/**
 * Cupones y descuentos en el navegador: el administrador configura el máximo de descuento manual y crea cupones
 * (código escrito o generado, mínimo de compra, vencimiento); el cajero ve al instante por qué un cupón no vale
 * (no existe, vencido, mínimo no alcanzado), lo aplica, da un descuento manual con motivo y el comprobante lo
 * muestra; el administrador lo ve en la lista de cupones, en el reporte y en la auditoría.
 */
test.describe.configure({ mode: "serial" });
test.skip(!ADMIN.pin || !CAJERO.pin, "Faltan SEED_* en .env.local");

const N = String(Date.now()).slice(-5);
const CUPON = `E2E${N}`;
const VENCIDO = `VENCIDO${N}`;
const ayer = () => new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/La_Paz" });

test("administrador: máximo de descuento manual y cupones", async ({ page }) => {
  await ingresarAdmin(page);
  await page.goto("/admin/configuracion");
  await page.getByLabel("Máximo que puede descontar el cajero").fill("5");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();

  await page.goto("/admin/promociones");
  await page.getByRole("link", { name: /^Cupones/ }).click();
  await page.getByRole("button", { name: "Nuevo cupón" }).click();
  const d = page.getByRole("dialog");
  // El código se puede generar…
  await d.getByRole("button", { name: "Generar" }).click();
  await expect(d.getByLabel("Código")).toHaveValue(/^[A-HJ-NP-Z2-9]{8}$/);
  // …o escribir.
  await d.getByLabel("Código").fill(CUPON.toLowerCase());
  await expect(d.getByLabel("Código")).toHaveValue(CUPON);
  await d.getByLabel("Descripción").fill("Cupón de prueba");
  await d.getByRole("button", { name: "Crear cupón" }).click();
  await expect(d.getByText("Entre 0,01 y 100 %")).toBeVisible();
  await d.getByLabel("Porcentaje", { exact: true }).fill("10");
  await d.getByLabel("Compra mínima (Bs)").fill("200");
  await d.screenshot({ path: "test-results/cupones-1-formulario.png" });
  await d.getByRole("button", { name: "Crear cupón" }).click();
  await expect(d).toBeHidden();

  await page.getByRole("button", { name: "Nuevo cupón" }).click();
  await d.getByLabel("Código").fill(VENCIDO);
  await d.getByLabel("Porcentaje", { exact: true }).fill("50");
  await d.getByLabel("Vale hasta").fill(ayer());
  await d.getByRole("button", { name: "Crear cupón" }).click();
  await expect(d).toBeHidden();

  // Lista con estado y buscador en tiempo real.
  const tarjeta = (codigo: string) => page.locator("main li").filter({ hasText: codigo });
  await expect(tarjeta(CUPON).getByText("Activo", { exact: true })).toBeVisible();
  await expect(tarjeta(CUPON)).toContainText("0 usos");
  await expect(tarjeta(CUPON)).toContainText("Compra mínima: Bs 200,00");
  await expect(tarjeta(VENCIDO).getByText("Vencido", { exact: true })).toBeVisible();
  await page.getByRole("searchbox", { name: "Buscar cupones" }).fill("vencido");
  await expect(tarjeta(CUPON)).toHaveCount(0);
  await expect(tarjeta(VENCIDO)).toHaveCount(1);
  await page.screenshot({ path: "test-results/cupones-2-lista.png" });
});

test("cajero: validación al instante, cupón aplicado y descuento manual con motivo", async ({ page }) => {
  await ingresarCajero(page);
  const dialogo = page.getByRole("dialog");
  const codigo = dialogo.getByLabel("Código de cupón");
  const confirmar = dialogo.getByRole("button", { name: "Confirmar venta" });

  await agregarProducto(page, /Creatina E2E/);
  await page.getByRole("button", { name: "Cobrar", exact: true }).click();
  await dialogo.getByRole("button", { name: /^Cupón/ }).click();

  await codigo.fill("NOEXISTE1");
  await dialogo.getByRole("button", { name: "Aplicar" }).click();
  await expect(dialogo.getByRole("alert")).toHaveText("Ese cupón no existe");
  await codigo.fill(VENCIDO);
  await codigo.press("Enter");
  await expect(dialogo.getByRole("alert")).toContainText("Cupón vencido");

  // Una creatina (Bs 120) no llega al mínimo de Bs 200: lo dice y no deja cobrar.
  await codigo.fill(CUPON);
  await codigo.press("Enter");
  await expect(dialogo.getByRole("status")).toContainText("Monto mínimo no alcanzado: faltan Bs 80,00");
  await dialogo.getByRole("button", { name: "Exacto" }).click();
  await expect(confirmar).toBeDisabled();
  await page.screenshot({ path: "test-results/cupones-3-minimo.png" });
  await page.keyboard.press("Escape");

  // Con dos creatinas (Bs 240) el cupón vale: 10 % = Bs 24.
  await agregarProducto(page, /Creatina E2E/);
  await page.getByRole("button", { name: "Cobrar", exact: true }).click();
  await dialogo.getByRole("button", { name: /^Cupón/ }).click();
  await codigo.fill(CUPON);
  await codigo.press("Enter");
  await expect(dialogo.getByRole("status")).toContainText("Cupón válido: descuenta Bs 24,00");
  await expect(dialogo.getByText("Bs 216,00").first()).toBeVisible();

  // Descuento manual: no deja pasar del 5 % y exige motivo.
  await dialogo.getByRole("button", { name: /^Descuento manual/ }).click();
  const porcentaje = dialogo.getByLabel("Porcentaje de descuento manual");
  await porcentaje.fill("10");
  await expect(dialogo.getByText(/este descuento necesita el PIN de un administrador/)).toBeVisible();
  await porcentaje.fill("5");
  await dialogo.getByRole("button", { name: "Exacto" }).click();
  await expect(confirmar).toBeDisabled(); // falta el motivo
  await dialogo.getByLabel("Motivo del descuento manual").fill("Cliente frecuente");
  // 216 − 5 % (10,80) = 205,20.
  await expect(dialogo.getByText("Bs 205,20").first()).toBeVisible();
  await page.screenshot({ path: "test-results/cupones-4-cobro.png" });
  await dialogo.getByRole("button", { name: "Exacto" }).click();
  await confirmar.click();
  await expect(page.getByText(/Venta realizada|Venta registrada/).first()).toBeVisible();

  await page.goto("/cajero/ventas");
  await page.getByRole("button", { name: /Bs 205,20/ }).first().click();
  await expect(dialogo.getByText(`Cupón ${CUPON}`)).toBeVisible();
  await expect(dialogo.getByText("Descuento (5 %)")).toBeVisible();
  await expect(dialogo.getByText("−Bs 10,80")).toBeVisible();
  await page.screenshot({ path: "test-results/cupones-5-comprobante.png" });
});

test("administrador: usos del cupón, reporte de descuentos y auditoría", async ({ page }) => {
  await ingresarAdmin(page);
  await page.goto("/admin/promociones?vista=cupones");
  await expect(page.locator("main li").filter({ hasText: CUPON })).toContainText("1 uso");

  await page.goto("/admin/reportes?vista=descuentos");
  await expect(page.locator("tr").filter({ hasText: CUPON })).toContainText("Bs 24,00");
  await expect(page.locator("tr").filter({ hasText: "Cliente frecuente" })).toContainText("Bs 10,80");
  await page.screenshot({ path: "test-results/cupones-6-reporte.png", fullPage: true });

  await page.goto("/admin/auditoria?vista=acciones");
  await expect(page.getByText("Descuento manual", { exact: true }).first()).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/admin/promociones?vista=cupones");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
