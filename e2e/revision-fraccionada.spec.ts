import { expect, test } from "@playwright/test";
import { ADMIN, CAJERO, agregarProducto, cobrar, ingresarAdmin, ingresarCajero } from "./ayudas";

/**
 * Venta fraccionada en el navegador: el administrador crea un producto que se vende por frasco o por cápsulas y le
 * ingresa stock en frascos; el cajero vende un frasco y cápsulas sueltas en la misma venta; el comprobante lo
 * muestra claro y el inventario queda en "frascos + cápsulas".
 */
test.describe.configure({ mode: "serial" });
test.skip(!ADMIN.pin || !CAJERO.pin, "Faltan SEED_* en .env.local");

test("administrador: producto fraccionado e ingreso en frascos", async ({ page }) => {
  await ingresarAdmin(page);
  await page.goto("/admin/catalogo");
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Nombre").fill("Omega E2E");
  await d.getByLabel("Precio de venta (Bs)").fill("100");
  await d.getByLabel("Precio de costo (Bs)").fill("50");

  // Activado sin completar: pide los datos de la fracción.
  await d.getByRole("switch", { name: "Se vende fraccionado" }).click();
  await d.getByRole("button", { name: "Guardar" }).click();
  await expect(d.getByText("Indica cuántas unidades trae el envase")).toBeVisible();
  await d.getByLabel("Cápsulas por frasco").fill("120");
  await d.getByLabel("Precio por cápsula (Bs)").fill("1,50");
  await expect(d.getByText(/un frasco rinde/)).toContainText("Bs 180,00");
  await d.getByLabel(/Stock mínimo \(frascos\)/).fill("1");
  await d.screenshot({ path: "test-results/fraccionada-1-catalogo.png" });
  await d.getByRole("button", { name: "Guardar" }).click();
  await expect(d).toBeHidden();

  // Ingreso en frascos: el sistema lo guarda en cápsulas.
  await page.goto("/admin/inventario");
  await page.getByRole("button", { name: "Ingreso de mercadería" }).click();
  const i = page.getByRole("dialog");
  await i.getByLabel("Destino").click();
  await page.getByRole("option", { name: "Sucursal principal" }).click();
  await i.getByRole("combobox").filter({ hasText: /Buscar producto/ }).click();
  await page.getByPlaceholder("Nombre, marca o código de barras").fill("omega");
  await page.getByRole("option", { name: /Omega E2E/ }).click();
  await i.getByLabel("Cantidad").fill("2");
  await expect(i.getByText("Cantidad en frascos completos: entran 240 cápsulas")).toBeVisible();
  await i.getByRole("button", { name: "Registrar 2 unidades" }).click();
  await expect(i).toBeHidden();
  await expect(page.locator("tr").filter({ hasText: "Omega E2E" })).toContainText("mín. 1 frasco");
});

test("cajero: frasco completo y cápsulas sueltas en la misma venta", async ({ page }) => {
  await ingresarCajero(page);
  const dialogo = page.getByRole("dialog");

  await test.step("por cápsulas", async () => {
    await agregarProducto(page, /Omega E2E/);
    await expect(dialogo.getByText("Disponible: 2 frascos (240 cápsulas en total)")).toBeVisible();
    await dialogo.getByRole("radio", { name: /Por cápsulas/ }).click();
    await dialogo.getByLabel("Cantidad").fill("500");
    await expect(dialogo.getByRole("alert")).toContainText("Solo hay 240 cápsulas");
    await expect(dialogo.getByRole("button", { name: /^Agregar/ })).toBeDisabled();
    await dialogo.getByLabel("Cantidad").fill("30");
    await expect(dialogo.getByRole("button", { name: /^Agregar/ })).toContainText("Bs 45,00");
    await page.screenshot({ path: "test-results/fraccionada-2-dialogo.png" });
    await dialogo.getByRole("button", { name: /^Agregar/ }).click();
    await expect(dialogo).toBeHidden();
  });

  await test.step("frasco completo: ya solo alcanza para uno", async () => {
    await agregarProducto(page, /Omega E2E/);
    await expect(dialogo.getByText("Disponible: 1 frasco + 90 cápsulas (210 cápsulas en total)")).toBeVisible();
    await expect(dialogo.getByRole("radio", { name: /Frasco completo/ })).toHaveAttribute("aria-checked", "true");
    await expect(dialogo.getByRole("button", { name: "Más" })).toBeDisabled();
    await dialogo.getByRole("button", { name: /^Agregar/ }).click();
    await expect(dialogo).toBeHidden();
  });

  await test.step("carrito con las dos líneas y cobro", async () => {
    const carrito = page.locator("aside");
    await expect(carrito.getByText("Bs 1,50 por cápsula")).toBeVisible();
    await expect(carrito.getByText("Bs 100,00 por frasco")).toBeVisible();
    await expect(carrito.getByText("Bs 145,00").last()).toBeVisible();
    await page.screenshot({ path: "test-results/fraccionada-3-carrito.png" });
    await cobrar(page, "Efectivo");
    await expect(page.getByText(/Venta realizada|Venta registrada/).first()).toBeVisible();
  });

  await test.step("el comprobante muestra las cápsulas y el stock quedó en 90 cápsulas", async () => {
    await page.goto("/cajero/ventas");
    await page.locator("main ul button").first().click();
    await expect(dialogo.getByText("30 cápsulas x Bs 1,50")).toBeVisible();
    await expect(dialogo.getByText("1 x Bs 100,00")).toBeVisible();
    await page.screenshot({ path: "test-results/fraccionada-4-comprobante.png" });

    await page.goto("/cajero/venta");
    await agregarProducto(page, /Omega E2E/);
    await expect(dialogo.getByText("Disponible: 90 cápsulas")).toBeVisible();
    await expect(dialogo.getByRole("radio", { name: /Frasco completo/ })).toBeDisabled();
  });
});

test("administrador: el inventario y el reporte muestran frascos y cápsulas", async ({ page }) => {
  await ingresarAdmin(page);
  await page.goto("/admin/inventario");
  const fila = page.locator("tr").filter({ hasText: "Omega E2E" });
  await expect(fila).toContainText("+90 cápsulas");
  await page.goto("/admin/reportes?vista=productos");
  await expect(page.locator("tr").filter({ hasText: "Omega E2E" })).toContainText("+ 30 cápsulas · Bs 45,00");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/admin/inventario");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
