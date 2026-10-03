import { expect, test, type Locator, type Page } from "@playwright/test";
import { ADMIN, ingresarAdmin } from "./ayudas";

/**
 * Tablet: los formularios entran en la pantalla aunque haya nombres muy largos; "Tomar foto" donde se sube una imagen;
 * descuentos automáticos con varios productos; combos como pestaña de Promociones y cupones; y Recordatorios.
 */
test.describe.configure({ mode: "serial" });
test.skip(!ADMIN.pin, "Faltan SEED_* en .env.local");

const LARGO = "Pre Entreno Explosivo Ultra Concentrado Sabor Frutas Tropicales Con Cafeína Y Beta Alanina 60 servicios";
const TABLET = { width: 800, height: 1180 };

/** El diálogo y todo lo que tiene adentro quedan dentro de la pantalla (nada cortado a la derecha). */
async function entraEnPantalla(page: Page, dialogo: Locator) {
  const ancho = page.viewportSize()!.width;
  const caja = (await dialogo.boundingBox())!;
  expect(caja.x).toBeGreaterThanOrEqual(0);
  expect(caja.x + caja.width).toBeLessThanOrEqual(ancho);
  const salidos = await dialogo.evaluate((el) => {
    const limite = el.getBoundingClientRect();
    return [...el.querySelectorAll("button, input, [role=checkbox], [role=combobox]")]
      .map((h) => h.getBoundingClientRect())
      .filter((r) => r.width > 0 && (r.right > limite.right + 1 || r.left < limite.left - 1)).length;
  });
  expect(salidos).toBe(0);
  await expect(dialogo.getByRole("button", { name: "Cancelar" })).toBeInViewport({ ratio: 1 });
}

test("donde se sube una imagen también se puede tomar la foto con la cámara", async ({ page }) => {
  await ingresarAdmin(page);
  await page.goto("/admin/catalogo");
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  const d = page.getByRole("dialog");
  await expect(d.getByRole("button", { name: "Tomar foto" })).toBeVisible();
  await expect(d.locator("input[data-camara]")).toHaveAttribute("capture", "environment");
  await expect(d.locator("input[data-camara]")).toHaveAttribute("accept", "image/*");
  // El producto de nombre larguísimo de las pruebas siguientes.
  await d.getByLabel("Nombre").fill(LARGO);
  await d.getByLabel("Precio de venta (Bs)").fill("200");
  await d.getByLabel("Precio de costo (Bs)").fill("120");
  await d.getByRole("button", { name: "Guardar" }).click();
  await expect(d).toBeHidden();

  await page.goto("/admin/qr");
  await page.getByRole("button", { name: "Nuevo QR" }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Tomar foto" })).toBeVisible();
});

test("tablet: cupón, combo y descuento automático entran en la pantalla; el descuento admite varios productos", async ({ page }) => {
  await page.setViewportSize(TABLET);
  await ingresarAdmin(page);

  // Cupón con la lista de productos (era lo que se cortaba).
  await page.goto("/admin/promociones?vista=cupones");
  await page.getByRole("button", { name: "Nuevo cupón" }).click();
  const d = page.getByRole("dialog");
  await d.getByRole("radio", { name: "Productos específicos" }).click();
  await expect(d.getByRole("group", { name: "Productos del cupón" }).getByRole("checkbox", { name: /Pre Entreno Explosivo/ })).toBeVisible();
  await entraEnPantalla(page, d);
  await page.screenshot({ path: "test-results/tablet-1-cupon.png" });
  await d.getByRole("button", { name: "Cancelar" }).click();

  // Los combos son una pestaña de este mismo apartado; ya no hay "Combos" en el menú.
  await page.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: /^Combos/ }).click();
  await expect(page).toHaveURL(/vista=combos/);
  await page.getByRole("button", { name: "Nuevo combo" }).click();
  await d.getByRole("group", { name: "Agregar productos" }).getByRole("checkbox", { name: /Pre Entreno Explosivo/ }).click();
  await entraEnPantalla(page, d);
  await page.screenshot({ path: "test-results/tablet-2-combo.png" });
  await d.getByRole("button", { name: "Cancelar" }).click();
  await page.goto("/admin/combos"); // la dirección antigua lleva a la pestaña
  await expect(page).toHaveURL(/\/admin\/promociones\?vista=combos/);

  // Descuento automático para varios productos.
  await page.goto("/admin/promociones");
  await page.getByRole("button", { name: "Nuevo descuento automático" }).click();
  await d.getByLabel("Nombre").fill("Semana del pre entreno");
  await d.getByLabel("Porcentaje de descuento").fill("15");
  await d.getByRole("combobox", { name: "Aplica a" }).click();
  await page.getByRole("option", { name: "Productos que elijas" }).click();
  const lista = d.getByRole("group", { name: "Productos con descuento" });
  await lista.getByRole("checkbox", { name: /Pre Entreno Explosivo/ }).click();
  await lista.getByRole("checkbox", { name: /Creatina E2E/ }).click();
  await lista.getByRole("checkbox", { name: /Whey E2E/ }).click();
  await expect(d.getByRole("list", { name: "Productos elegidos" }).getByRole("button")).toHaveCount(3);
  await d.getByRole("list", { name: "Productos elegidos" }).getByRole("button", { name: /Whey E2E/ }).click(); // se quita con un toque
  await expect(lista.getByRole("checkbox", { name: /Whey E2E/ })).toHaveAttribute("aria-checked", "false");
  await entraEnPantalla(page, d);
  await page.screenshot({ path: "test-results/tablet-3-descuento.png" });
  await d.getByRole("button", { name: "Guardar" }).click();
  await expect(d).toBeHidden();
  const tarjeta = page.locator("main li").filter({ hasText: "Semana del pre entreno" });
  await expect(tarjeta).toContainText("Productos:");
  await expect(tarjeta).toContainText("Creatina E2E");
  await expect(tarjeta).toContainText("Pre Entreno Explosivo");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Se desactiva para no cambiar los precios de otras pruebas.
  await tarjeta.getByRole("button", { name: /Editar/ }).click();
  await d.getByRole("switch").last().click();
  await d.getByRole("button", { name: "Guardar" }).click();
  await expect(d).toBeHidden();
  await expect(tarjeta).toContainText("Inactiva");
});

test("recordatorios: se crean con día, hora y repetición, se editan y se borran", async ({ page, request }) => {
  await ingresarAdmin(page);
  await expect(page.getByRole("link", { name: /^Combos/ })).toHaveCount(0); // ya no es un apartado del menú
  await page.getByRole("link", { name: /^Recordatorios/ }).first().click();
  await expect(page.getByRole("heading", { name: "Recordatorios" })).toBeVisible();

  const manana = new Date(Date.now() + 86_400_000 - 4 * 3_600_000).toISOString().slice(0, 10);
  await page.getByRole("button", { name: "Nuevo recordatorio" }).click();
  const d = page.getByRole("dialog");
  await d.getByRole("button", { name: "Guardar" }).click();
  await expect(d.getByText("Escribe qué quieres recordar")).toBeVisible();
  await d.getByLabel("¿Qué quieres recordar?").fill("Pagar al proveedor de proteínas");
  await d.getByLabel("Nota").fill("Transferencia al Banco Unión");
  await d.getByLabel("Día").fill(manana);
  await d.getByLabel("Hora").fill("08:30");
  await d.getByRole("combobox", { name: "Se repite" }).click();
  await page.getByRole("option", { name: "Cada mes" }).click();
  await d.getByRole("button", { name: "Guardar" }).click();
  await expect(d).toBeHidden();

  const fila = page.locator("main li").filter({ hasText: "Pagar al proveedor de proteínas" });
  await expect(fila).toContainText("08:30");
  await expect(fila).toContainText("Cada mes");
  await expect(fila).toContainText("Pendiente");
  await expect(fila).toContainText("Transferencia al Banco Unión");
  await page.screenshot({ path: "test-results/recordatorios-1-lista.png", fullPage: true });

  await fila.getByRole("button", { name: /^Editar/ }).click();
  await d.getByLabel("Hora").fill("19:45");
  await d.getByRole("button", { name: "Guardar" }).click();
  await expect(d).toBeHidden();
  await expect(fila).toContainText("19:45");

  // El disparador de avisos responde sin sesión y sin datos.
  const r = await request.get("/api/recordatorios/despachar");
  expect(r.status()).toBe(200);
  expect(await r.json()).toEqual({ ok: true });
  await page.reload();
  await expect(fila).toContainText("Pendiente"); // todavía no es su hora

  // En el celular y en modo oscuro.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await expect(fila).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/recordatorios-2-celular.png", fullPage: true });

  await fila.getByRole("button", { name: /^Eliminar/ }).click();
  await fila.getByRole("button", { name: "Eliminar", exact: true }).click();
  await expect(fila).toHaveCount(0);
});
