import { expect, test } from "@playwright/test";
import { ADMIN, CAJERO, ENCARGADO, escribirPin, ingresarAdmin, ingresarEncargado } from "./ayudas";

/**
 * Ingreso automático al completar el PIN (sin tocar "Ingresar"), gastos sin caja del administrador y del encargado,
 * y el apartado Sueldos del administrador.
 */
test.skip(!ADMIN.pin || !CAJERO.pin || !ENCARGADO.pin, "Faltan SEED_* en .env.local");

test("ingreso: con un PIN válido entra solo, sin tocar Ingresar ni Enter; uno incompleto no da error", async ({ page }) => {
  await page.goto("/login");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  // Los primeros dígitos de un PIN válido no son un error: la pantalla espera a que se termine de escribir.
  await escribirPin(page, CAJERO.pin.slice(0, 3));
  await page.waitForTimeout(900);
  await expect(page.getByRole("alert").filter({ hasText: /incorrecto|Demasiados/ })).toHaveCount(0);
  await escribirPin(page, CAJERO.pin.slice(3));
  await expect(page).toHaveURL(/\/cajero\/(venta|apertura)/, { timeout: 30_000 });
});

test("administrador: agrega un gasto sin caja desde Gastos diarios", async ({ page }) => {
  await ingresarAdmin(page);
  await page.goto("/admin/gastos");
  await page.getByRole("button", { name: "Agregar gasto" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByRole("combobox", { name: "Sucursal" }).click();
  await page.getByRole("option", { name: "Sucursal principal" }).click();
  await dialogo.getByRole("combobox", { name: "Categoría" }).click();
  await page.getByRole("option", { name: "Servicios" }).click();
  await dialogo.getByLabel("Monto (Bs)").fill("123,40");
  await dialogo.getByLabel("Descripción").fill("Luz del mes (prueba)");
  await dialogo.getByRole("button", { name: "Registrar gasto" }).click();
  const fila = page.locator("main li").filter({ hasText: "Luz del mes (prueba)" });
  await expect(fila).toContainText("Bs 123,40");
  await expect(fila).toContainText("Sin caja");
  await expect(fila).toContainText("Sucursal principal");
  await page.screenshot({ path: "test-results/mejoras-1-gasto-admin.png", fullPage: true });
});

test("encargado: ve los gastos de su sucursal y agrega uno (sin elegir sucursal)", async ({ page }) => {
  await ingresarEncargado(page);
  await page.goto("/encargado/gastos");
  await expect(page.locator("main li").filter({ hasText: "Luz del mes (prueba)" })).toBeVisible();
  await page.getByRole("button", { name: "Agregar gasto" }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByRole("combobox", { name: "Sucursal" })).toHaveCount(0);
  await dialogo.getByRole("combobox", { name: "Categoría" }).click();
  await page.getByRole("option", { name: "Limpieza" }).click();
  await dialogo.getByLabel("Monto (Bs)").fill("35");
  await dialogo.getByLabel("Descripción").fill("Detergente (prueba)");
  await dialogo.getByRole("button", { name: "Registrar gasto" }).click();
  await expect(page.locator("main li").filter({ hasText: "Detergente (prueba)" })).toContainText("Bs 35,00");
  // Anular sigue siendo del administrador.
  await expect(page.getByRole("button", { name: /Anular/ })).toHaveCount(0);
});

test("administrador: sueldos del personal con adelanto, descuento y pago", async ({ page }) => {
  await ingresarAdmin(page);
  await page.locator("aside nav").getByRole("link", { name: "Sueldos" }).click();
  await expect(page.getByRole("heading", { name: "Sueldos" })).toBeVisible();
  const persona = page.locator("main li").filter({ hasText: "Cajero de prueba" });
  const dialogo = page.getByRole("dialog");

  await persona.getByRole("button", { name: "Editar sueldo de Cajero de prueba" }).click();
  await dialogo.getByLabel("Sueldo mensual (Bs)").fill("2500");
  await dialogo.getByRole("button", { name: "Guardar" }).click();
  await expect(persona).toContainText("Bs 2.500,00");

  await persona.getByRole("button", { name: "Adelanto", exact: true }).click();
  await dialogo.getByLabel("Monto (Bs)").fill("500");
  await dialogo.getByRole("button", { name: "Registrar" }).click();
  await persona.getByRole("button", { name: "Descuento", exact: true }).click();
  await dialogo.getByLabel("Monto (Bs)").fill("100");
  await dialogo.getByRole("button", { name: "Registrar" }).click();
  await expect(dialogo.getByText("Escribe el motivo del descuento")).toBeVisible(); // motivo obligatorio
  await dialogo.getByLabel("Motivo").fill("Falta del lunes");
  await dialogo.getByRole("button", { name: "Registrar" }).click();
  // 2500 − 100 − 500 = 1900 por pagar.
  await expect(persona).toContainText("Falta pagar");
  await expect(persona).toContainText("Bs 1.900,00");
  await page.screenshot({ path: "test-results/mejoras-2-sueldos.png", fullPage: true });

  // "Pagar" propone todo lo que falta.
  await persona.getByRole("button", { name: "Pagar", exact: true }).click();
  await expect(dialogo.getByLabel("Monto (Bs)")).toHaveValue("1900.00");
  await dialogo.getByRole("button", { name: "Registrar" }).click();
  await expect(persona.getByText("Pagado", { exact: true }).first()).toBeVisible();
  await expect(persona.getByRole("button", { name: "Pagar", exact: true })).toBeDisabled();

  // Los movimientos se anulan con motivo (no se borran).
  await persona.getByRole("button", { name: /3 movimientos/ }).click();
  await persona.locator("li").filter({ hasText: "Adelanto" }).getByRole("button", { name: "Anular" }).click();
  await dialogo.getByLabel("Motivo").fill("Registrado por error");
  await dialogo.getByRole("button", { name: "Anular", exact: true }).click();
  // Sin el adelanto anulado vuelven a faltar esos Bs 500.
  await expect(persona).toContainText("Falta pagar");
  await expect(persona).toContainText("Bs 500,00");
  await expect(persona.locator("li").filter({ hasText: "Adelanto" })).toContainText("Motivo: Registrado por error");

  // Mes anterior: sin movimientos.
  await page.getByRole("link", { name: "Mes anterior" }).click();
  await expect(page).toHaveURL(/mes=\d{4}-\d{2}/);
  await expect(page.locator("main li").filter({ hasText: "Cajero de prueba" })).toContainText("Falta pagar");

  // El encargado y el cajero no entran a Sueldos.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/admin/sueldos");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/mejoras-3-sueldos-celular.png", fullPage: true });
});

test("sueldos es solo del administrador", async ({ page }) => {
  await ingresarEncargado(page);
  await page.goto("/admin/sueldos");
  await expect(page).toHaveURL(/\/cajero\/(venta|apertura)/);
});
