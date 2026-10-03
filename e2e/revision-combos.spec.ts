import { expect, test } from "@playwright/test";
import { ADMIN, CAJERO, cobrar, ingresarAdmin, ingresarCajero } from "./ayudas";

/**
 * Combos en el navegador: el administrador arma un combo con el buscador (precio normal, descuento y precio final
 * en vivo, aviso si queda bajo el costo); el cajero lo vende desde su sección; el comprobante muestra el combo con
 * sus productos; y se puede desactivar desde la lista.
 */
test.describe.configure({ mode: "serial" });
test.skip(!ADMIN.pin || !CAJERO.pin, "Faltan SEED_* en .env.local");

const NOMBRE = `Combo E2E ${String(Date.now()).slice(-5)}`;

test("administrador: nuevo combo con buscador, cantidades y descuento en vivo", async ({ page }) => {
  await ingresarAdmin(page);
  // Stock para poder venderlo: 5 Whey y 5 Creatina en la sucursal.
  await page.goto("/admin/inventario");
  for (const producto of ["Whey E2E", "Creatina E2E"]) {
    await page.getByRole("button", { name: "Ingreso de mercadería" }).click();
    const i = page.getByRole("dialog");
    await i.getByLabel("Destino").click();
    await page.getByRole("option", { name: "Sucursal principal" }).click();
    await i.getByRole("combobox").filter({ hasText: /Buscar producto/ }).click();
    await page.getByPlaceholder("Nombre, marca o código de barras").fill(producto);
    await page.getByRole("option", { name: new RegExp(producto) }).click();
    await i.getByLabel("Cantidad").fill("5");
    await i.getByRole("button", { name: "Registrar 5 unidades" }).click();
    await expect(i).toBeHidden();
  }

  await page.getByRole("link", { name: /^Combos/ }).first().click();
  await expect(page.getByRole("heading", { name: "Combos" })).toBeVisible();
  await page.getByRole("button", { name: "Nuevo combo" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Nombre").fill(NOMBRE);

  // Sin productos no se puede guardar.
  await d.getByRole("button", { name: "Crear combo" }).click();
  await expect(d.getByText("Agrega al menos un producto al combo")).toBeVisible();

  // Lista siempre a la vista: se filtra al escribir y cada toque marca o desmarca sin borrar lo escrito.
  const lista = d.getByRole("group", { name: "Agregar productos" });
  await expect(lista.getByRole("checkbox", { name: /Creatina E2E/ })).toBeVisible(); // sin escribir nada ya se ven
  const buscador = d.getByRole("searchbox", { name: "Buscar en agregar productos" });
  await buscador.pressSequentially("e2e");
  const whey = lista.getByRole("checkbox", { name: /Whey E2E/ });
  await expect(whey).toContainText("Proteínas"); // su categoría al lado
  await whey.click();
  await expect(whey).toHaveAttribute("aria-checked", "true");
  await expect(buscador).toHaveValue("e2e"); // lo escrito sigue ahí para seguir eligiendo
  await whey.click();
  await expect(d.getByText("Toca en la lista los productos que forman el combo")).toBeVisible();
  await whey.click();
  await lista.getByRole("checkbox", { name: /Creatina E2E/ }).click();
  await page.screenshot({ path: "test-results/combos-lista-seleccion.png" });
  await d.getByLabel("Cantidad de Creatina E2E").fill("2");

  // 350 + 2 × 120 = 590; 10 % → 59 de descuento, final 531.
  const precios = d.getByRole("region", { name: "Descuento y precio" });
  await expect(precios).toContainText("Bs 590,00");
  await d.getByLabel("Porcentaje", { exact: true }).fill("10");
  await expect(precios).toContainText("−Bs 59,00");
  await expect(precios).toContainText("Bs 531,00");
  await expect(precios).toContainText("(10 %)");
  // Monto fijo que deja el precio bajo el costo (costos: 280 + 2 × 80 = 440): avisa.
  await d.getByRole("radio", { name: "Monto fijo (Bs)" }).click();
  await d.getByLabel("Monto en Bs").fill("200");
  await expect(d.getByRole("alert")).toContainText("menor que el costo");
  await d.getByLabel("Monto en Bs").fill("40");
  await expect(d.getByRole("alert")).toHaveCount(0);
  await expect(precios).toContainText("Bs 550,00");
  await d.screenshot({ path: "test-results/combos-1-formulario.png" });
  await d.getByRole("button", { name: "Crear combo" }).click();
  await expect(d).toBeHidden();

  const tarjeta = page.locator("main li").filter({ hasText: NOMBRE });
  await expect(tarjeta).toContainText("Bs 550,00");
  await expect(tarjeta).toContainText("2 Creatina E2E");
  await expect(tarjeta.getByText("Activo", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/combos-2-lista.png" });
});

test("cajero: el combo aparece en su sección, se vende y descuenta sus productos", async ({ page }) => {
  await ingresarCajero(page);
  const seccion = page.getByRole("region", { name: "Combos" });
  const combo = seccion.getByRole("button", { name: new RegExp(NOMBRE) });
  await expect(combo).toContainText("Bs 550,00");
  await expect(combo).toContainText("Ahorras Bs 40,00");
  await page.screenshot({ path: "test-results/combos-3-pos.png" });

  // Se pueden agregar combos hasta que se acaba el stock de alguno de sus productos: ahí el botón se bloquea.
  let agregados = 0;
  while (agregados < 12 && (await combo.isEnabled())) {
    await combo.click();
    agregados++;
  }
  expect(agregados).toBeGreaterThanOrEqual(2);
  await expect(combo).toBeDisabled();
  const carrito = page.locator("aside");
  await expect(carrito.getByText(NOMBRE)).toBeVisible();
  await expect(carrito.getByRole("button", { name: new RegExp(`Agregar un combo ${NOMBRE}`) })).toBeDisabled();
  // Se deja un solo combo.
  for (let k = 1; k < agregados; k++) await carrito.getByRole("button", { name: new RegExp(`Quitar un combo ${NOMBRE}`) }).click();
  await expect(carrito.getByText("Bs 550,00").last()).toBeVisible();
  await expect(combo).toBeEnabled();

  await cobrar(page, "Efectivo");
  await expect(page.getByText(/Venta realizada|Venta registrada/).first()).toBeVisible();

  await page.goto("/cajero/ventas");
  await page.getByRole("button", { name: /Bs 550,00/ }).first().click();
  const comprobante = page.getByRole("dialog");
  await expect(comprobante.getByText(NOMBRE, { exact: true })).toBeVisible();
  await expect(comprobante.getByText("1 Whey E2E + 2 Creatina E2E")).toBeVisible();
  await expect(comprobante.getByText("Descuento del combo")).toBeVisible();
  await expect(comprobante.getByText("Bs 550,00").last()).toBeVisible();
  await page.screenshot({ path: "test-results/combos-4-comprobante.png" });
});

test("administrador: el stock bajó y un combo desactivado desaparece del punto de venta", async ({ page, browser }) => {
  await ingresarAdmin(page);
  await page.goto("/admin/combos");
  const tarjeta = page.locator("main li").filter({ hasText: NOMBRE });
  await tarjeta.getByRole("switch").click();
  await expect(tarjeta.getByText("Inactivo", { exact: true })).toBeVisible();

  const cajero = await (await browser.newContext()).newPage();
  await ingresarCajero(cajero);
  await expect(cajero.getByRole("button", { name: new RegExp(NOMBRE) })).toHaveCount(0);
  await cajero.context().close();

  // En el celular y en modo oscuro.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Combos" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
