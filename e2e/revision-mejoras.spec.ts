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

test("ingreso y regreso a la app: solo el teclado del PIN, sin botón; al completar el PIN se entra", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("Ingresa tu PIN")).toBeVisible();
  await expect(page.getByRole("button", { name: /Ingresar|Desbloquear/ })).toHaveCount(0);
  await ingresarAdmin(page);
  // Como al reabrir la app: se pide el PIN encima de la pantalla, sin mensajes ni botón.
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  const pantalla = page.getByRole("dialog", { name: "Pantalla bloqueada" });
  await expect(pantalla.getByText("Ingresa tu PIN")).toBeVisible();
  await expect(pantalla.getByText(/Sesión bloqueada/i)).toHaveCount(0);
  await expect(pantalla.getByRole("button", { name: /Ingresar|Desbloquear/ })).toHaveCount(0);
  await page.screenshot({ path: "test-results/mejoras-0-pin-al-volver.png" });
  await pantalla.getByText("Ingresa tu PIN").click();
  await escribirPin(page, ADMIN.pin); // sin Enter
  await expect(pantalla).toBeHidden({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/admin\/dashboard/);
});

test("inventario: tocar el producto abre directo el ajuste de stock", async ({ page }) => {
  await ingresarAdmin(page);
  await page.goto("/admin/inventario");
  await page.getByRole("searchbox", { name: "Buscar producto" }).fill("creatina");
  await page.getByRole("button", { name: "Ajustar stock de Creatina E2E" }).click();
  const dialogo = page.getByRole("dialog");
  // Ya viene con el producto y la sucursal elegidos: solo falta la cantidad y el motivo.
  await expect(dialogo).toContainText("Creatina E2E");
  await expect(dialogo).toContainText("Sucursal principal");
  await page.screenshot({ path: "test-results/mejoras-4-ajuste-directo.png" });
});

test("administrador: trabajadores y sueldos (ingreso, día de pago, adelanto, descuento, pago y baja con historial)", async ({ page }) => {
  await ingresarAdmin(page);
  await page.locator("aside nav").getByRole("link", { name: "Sueldos" }).click();
  await expect(page.getByRole("heading", { name: "Sueldos" })).toBeVisible();
  const dialogo = page.getByRole("dialog");

  // Nuevo trabajador sin usuario en el sistema, con desde cuándo trabaja.
  await page.getByRole("button", { name: "Nuevo trabajador" }).click();
  await dialogo.getByLabel("Nombre completo").fill("Rosa Limpieza E2E");
  await dialogo.getByLabel("Cargo").fill("Limpieza");
  await dialogo.getByLabel("Trabaja desde").fill("2026-03-15");
  await dialogo.getByLabel("Sueldo mensual (Bs)").fill("1200");
  await dialogo.getByRole("button", { name: "Agregar trabajador" }).click();
  const rosa = page.locator("main > div > ul > li").filter({ hasText: "Rosa Limpieza E2E" });
  await expect(rosa).toContainText("Trabaja desde el 15/03/2026");
  await expect(rosa).toContainText(/Cumple su mes el 15\/\d{2}\/\d{4}|Hoy cumple su mes/);
  await expect(rosa).toContainText("Bs 1.200,00");

  // A quien ya trabajaba (el cajero) se le pone su fecha de ingreso y su sueldo.
  const persona = page.locator("main > div > ul > li").filter({ hasText: "Cajero de prueba" });
  await persona.getByRole("button", { name: "Poner desde cuándo trabaja" }).click();
  await dialogo.getByLabel("Trabaja desde").fill("2025-06-20");
  await dialogo.getByLabel("Sueldo mensual (Bs)").fill("2500");
  await dialogo.getByRole("button", { name: "Guardar" }).click();
  await expect(persona).toContainText("Trabaja desde el 20/06/2025");
  await expect(persona).toContainText(/Cumple su mes el 20\//);
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
  await expect(persona).toContainText("Bs 1.900,00");
  await page.screenshot({ path: "test-results/mejoras-2-sueldos.png", fullPage: true });

  // "Pagar" propone todo lo que falta.
  await persona.getByRole("button", { name: "Pagar", exact: true }).click();
  await expect(dialogo.getByLabel("Monto (Bs)")).toHaveValue("1900.00");
  await dialogo.getByRole("button", { name: "Registrar" }).click();
  await expect(persona.getByRole("button", { name: "Pagar", exact: true })).toBeDisabled();

  // Los movimientos se anulan con motivo (no se borran).
  await persona.getByRole("button", { name: /3 movimientos/ }).click();
  await persona.locator("li").filter({ hasText: "Adelanto" }).getByRole("button", { name: "Anular" }).click();
  await dialogo.getByLabel("Motivo").fill("Registrado por error");
  await dialogo.getByRole("button", { name: "Anular", exact: true }).click();
  await expect(persona).toContainText("Bs 500,00");
  await expect(persona.locator("li").filter({ hasText: "Adelanto" })).toContainText("Motivo: Registrado por error");

  // Baja con fecha y motivo: queda marcada y en el historial; se puede reincorporar.
  await rosa.getByRole("button", { name: "Dar de baja" }).click();
  await dialogo.getByLabel("Motivo").fill("Despido por faltas reiteradas");
  await dialogo.getByRole("button", { name: "Dar de baja" }).click();
  await expect(rosa).toContainText("De baja");
  await expect(rosa).toContainText("Motivo: Despido por faltas reiteradas");
  await rosa.getByRole("button", { name: /Historial/ }).click();
  const historial = rosa.getByRole("list", { name: "Historial de Rosa Limpieza E2E" });
  await expect(historial.locator("li").first()).toContainText("Baja");
  await expect(historial.locator("li").first()).toContainText("Despido por faltas reiteradas");
  await expect(historial.locator("li").last()).toContainText("Entró a trabajar");
  await page.screenshot({ path: "test-results/mejoras-5-baja.png", fullPage: true });

  // El mes siguiente ya no aparece, salvo con "Ver dados de baja".
  await page.getByRole("link", { name: "Mes siguiente" }).click();
  await expect(page).toHaveURL(/mes=\d{4}-\d{2}/);
  await expect(page.locator("main > div > ul > li").filter({ hasText: "Cajero de prueba" })).toBeVisible();
  await expect(page.locator("main > div > ul > li").filter({ hasText: "Rosa Limpieza E2E" })).toHaveCount(0);
  await page.getByRole("link", { name: "Ver dados de baja" }).click();
  const deBaja = page.locator("main > div > ul > li").filter({ hasText: "Rosa Limpieza E2E" });
  await expect(deBaja).toContainText("De baja");
  await deBaja.getByRole("button", { name: "Reincorporar" }).click();
  await dialogo.getByRole("button", { name: "Reincorporar" }).click();
  await expect(deBaja.getByText("De baja", { exact: true })).toHaveCount(0);

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
