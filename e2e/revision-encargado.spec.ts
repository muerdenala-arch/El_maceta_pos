import { expect, test, type Page } from "@playwright/test";
import { ADMIN, agregarProducto, CAJERO, ENCARGADO, escribirPin, ingresarAdmin, ingresarCajero, ingresarEncargado } from "./ayudas";

/**
 * Rol Encargado en el navegador: el administrador lo crea desde Personal y fija los dos máximos de descuento. El encargado
 * tiene los mismos apartados que el administrador, pero solo le aparecen los que este le deja con el candado abierto
 * (cerrados no abren ni escribiendo la dirección). No vende: en la pantalla del cajero autoriza con su PIN un descuento
 * mayor al permitido y una anulación.
 */
test.skip(!ADMIN.pin || !CAJERO.pin || !ENCARGADO.pin, "Faltan SEED_* (incluido SEED_ENCARGADO_PIN) en .env.local");

const N = Date.now().toString().slice(-6);

/** Escribe el PIN del encargado en el diálogo de autorización (teclado físico) y confirma. */
async function autorizarConPin(page: Page, titulo: string) {
  const dialogo = page.getByRole("dialog").filter({ hasText: titulo });
  await expect(dialogo).toBeVisible();
  await dialogo.getByText("PIN del encargado de la sucursal").click(); // saca el foco de los campos de texto
  await escribirPin(page, ENCARGADO.pin);
  await dialogo.getByRole("button", { name: "Autorizar", exact: true }).click();
  await expect(dialogo).toBeHidden();
}

test("administrador: crea un encargado desde Personal y fija los dos máximos de descuento", async ({ page }) => {
  await ingresarAdmin(page);
  await page.goto("/admin/personal");
  await page.getByRole("button", { name: "Nuevo usuario" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Nombre completo").fill(`Encargado ${N}`);
  await dialogo.getByLabel("Usuario").fill(`enc${N}`);
  await dialogo.getByRole("radio", { name: /Encargado/ }).click();
  // Sin sucursal no se puede: con una sola sucursal ya viene elegida.
  await expect(dialogo.getByRole("combobox", { name: "Sucursal" })).toContainText("Sucursal principal");
  let pin = "";
  do pin = String(Math.floor(100000 + Math.random() * 900000));
  while ([ADMIN.pin, CAJERO.pin, ENCARGADO.pin].includes(pin));
  await dialogo.getByLabel("PIN inicial").fill(pin);
  await dialogo.getByRole("button", { name: "Crear usuario" }).click();
  const fila = page.locator("main li").filter({ hasText: `Encargado ${N}` });
  await expect(fila).toContainText("Encargado");
  await expect(fila).toContainText("Sucursal principal");
  await page.screenshot({ path: "test-results/encargado-1-personal.png" });

  await page.goto("/admin/configuracion");
  // Se repite hasta que el formulario ya responde (si se escribe antes de que cargue del todo, se pierde lo escrito).
  await expect(async () => {
    await page.getByLabel("Máximo que puede descontar el cajero").fill("5");
    await page.getByLabel("Máximo que puede dar o autorizar el encargado").fill("15");
    await expect(page.getByRole("button", { name: "Guardar cambios" })).toBeEnabled({ timeout: 1500 });
  }).toPass();
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
});

test("encargado con todos los candados cerrados: no le aparece ningún apartado ni abre ninguno por la dirección", async ({ page }) => {
  await ingresarEncargado(page);
  await expect(page.getByRole("heading", { name: "Todavía no tienes apartados" })).toBeVisible();
  await expect(page.locator("aside nav").getByRole("link")).toHaveCount(0);
  await page.screenshot({ path: "test-results/encargado-2-sin-apartados.png", fullPage: true });
  for (const ruta of ["/admin/dashboard", "/admin/catalogo", "/admin/personal", "/admin/sueldos", "/admin/reportes", "/cajero/venta"]) {
    await page.goto(ruta).catch(() => {});
    await expect(page, ruta).toHaveURL(/\/admin\/inicio/);
    await page.waitForLoadState("load");
  }
  expect((await page.request.get("/api/admin/exportar?reporte=ventas&formato=xlsx")).status()).toBe(403);
  expect((await page.request.get("/api/admin/plantilla-productos")).status()).toBe(403);
});

test("candados: los mismos apartados que el administrador; abiertos le aparecen y trabaja como el administrador, cerrados desaparecen", async ({ page, browser }) => {
  const menu = page.locator("aside nav");
  const admin = await (await browser.newContext()).newPage();
  await ingresarAdmin(admin);
  const candados = admin.locator("aside").getByRole("switch", { name: /Candado de/ });
  // Un candado en cada apartado del menú del administrador.
  await expect(candados).toHaveCount(15);
  const candado = (apartado: string) => admin.locator("aside").getByRole("switch", { name: new RegExp(`Candado de ${apartado} `) });
  for (const apartado of ["Inicio", "Catálogo", "Personal / Cajeros"]) {
    await expect(candado(apartado)).toHaveAttribute("aria-checked", "false");
    await candado(apartado).click();
    await expect(candado(apartado)).toHaveAttribute("aria-checked", "true");
  }
  await admin.screenshot({ path: "test-results/encargado-9-candados-admin.png" });

  // El encargado entra a su primer apartado abierto (Inicio) y solo ve esos tres.
  await ingresarEncargado(page);
  await expect(page).toHaveURL(/\/admin\/dashboard/);
  await expect(menu.getByRole("link")).toHaveCount(3);
  for (const item of ["Inicio", "Catálogo", "Personal / Cajeros"]) await expect(menu.getByRole("link", { name: new RegExp(`^${item}`) })).toBeVisible();
  await page.screenshot({ path: "test-results/encargado-8-menu-con-candados-abiertos.png", fullPage: true });

  // Trabaja igual que el administrador: catálogo con costos e importación.
  await menu.getByRole("link", { name: /^Catálogo/ }).click();
  await expect(page.getByRole("button", { name: "Importar Excel" })).toBeVisible();
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  const ficha = page.getByRole("dialog");
  await ficha.getByLabel("Nombre").fill(`Producto encargado ${N}`);
  await ficha.getByLabel("Precio de venta (Bs)").fill("45");
  await ficha.getByLabel("Precio de costo (Bs)").fill("30");
  await ficha.getByRole("button", { name: /Guardar|Crear/ }).click();
  await expect(page.locator("main li").filter({ hasText: `Producto encargado ${N}` })).toBeVisible();
  // Lo cerrado no abre por la dirección.
  await page.goto("/admin/sueldos").catch(() => {});
  await expect(page).toHaveURL(/\/admin\/dashboard/);

  // El administrador cierra los tres: al encargado ya no le aparece nada.
  for (const apartado of ["Inicio", "Catálogo", "Personal / Cajeros"]) {
    await candado(apartado).click();
    await expect(candado(apartado)).toHaveAttribute("aria-checked", "false");
  }
  await page.goto("/admin/catalogo").catch(() => {});
  await expect(page).toHaveURL(/\/admin\/inicio/);
  await expect(menu.getByRole("link")).toHaveCount(0);
  await admin.context().close();
});

test("cajero: descuento mayor a su máximo y anulación, con el PIN del encargado en su pantalla", async ({ page }) => {
  await ingresarCajero(page);
  await agregarProducto(page, /Whey E2E/);
  await page.getByRole("button", { name: "Cobrar", exact: true }).click();
  const dialogo = page.getByRole("dialog").filter({ hasText: "Descuento manual" });
  const confirmar = dialogo.locator("form button[type=submit]");
  await dialogo.getByRole("button", { name: /^Descuento manual/ }).click();
  await dialogo.getByLabel("Porcentaje de descuento manual").fill("10");
  await dialogo.getByLabel("Motivo del descuento manual").fill("Autorizado en tienda");
  await expect(dialogo.getByText("Más de 5 % necesita el PIN del encargado o de un administrador.")).toBeVisible();
  await dialogo.getByRole("button", { name: "Exacto" }).click();
  await expect(confirmar).toBeDisabled(); // sin autorización no se cobra con ese descuento
  await page.screenshot({ path: "test-results/encargado-5-pide-pin.png" });

  await dialogo.getByRole("button", { name: "Autorizar con PIN" }).click();
  // Un PIN que no es de un encargado ni de un administrador no autoriza.
  const pinDialogo = page.getByRole("dialog").filter({ hasText: "Autorizar descuento" });
  await pinDialogo.getByText("PIN del encargado de la sucursal").click();
  await escribirPin(page, CAJERO.pin);
  await pinDialogo.getByRole("button", { name: "Autorizar", exact: true }).click();
  await expect(pinDialogo.getByText(/no es de un encargado de esta sucursal/)).toBeVisible();
  await autorizarConPin(page, "Autorizar descuento");

  await expect(dialogo.getByText(/Autorizado por Encargada de prueba/)).toBeVisible();
  // 350 − 10 % = 315.
  await expect(dialogo.getByText("Bs 315,00").first()).toBeVisible();
  await dialogo.getByRole("button", { name: "Exacto" }).click();
  await confirmar.click();
  await expect(page.getByText(/Venta realizada|Venta registrada/).first()).toBeVisible();

  // Anular esa venta: motivo + PIN del encargado.
  await page.goto("/cajero/ventas");
  await page.getByRole("button", { name: /Bs 315,00/ }).first().click();
  const comprobante = page.getByRole("dialog").filter({ hasText: "Comprobante N.º" });
  await comprobante.getByRole("button", { name: "Anular venta" }).click();
  await comprobante.getByLabel("Motivo").fill("El cliente se arrepintió");
  await comprobante.getByRole("button", { name: "Pedir autorización" }).click();
  await autorizarConPin(page, "Autorizar anulación");
  await expect(page.getByText("Venta anulada: el stock volvió a la sucursal")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("main li").filter({ hasText: "Bs 315,00" }).first()).toContainText("Anulada");
  await page.screenshot({ path: "test-results/encargado-6-anulada.png" });
});
