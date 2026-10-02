import { expect, test, type Page } from "@playwright/test";
import { ADMIN, agregarProducto, CAJERO, ENCARGADO, escribirPin, ingresarAdmin, ingresarCajero, ingresarEncargado } from "./ayudas";

/**
 * Rol Encargado en el navegador: el administrador lo crea desde Personal y fija los dos máximos de descuento; el
 * encargado entra a su panel, no llega a nada del administrador ni escribiendo la dirección, ve reportes sin costos,
 * su campanita lo lleva al producto, vende y anula; y en la pantalla del cajero autoriza con su PIN un descuento
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

test("encargado: su panel y su menú; lo que es solo del administrador no abre, ni escribiendo la dirección ni por el API", async ({ page }) => {
  // Sin pantalla de inicio: entra directo a vender (o a abrir su caja), como un cajero.
  await ingresarEncargado(page);
  await expect(page).toHaveURL(/\/cajero\/(venta|apertura)/);
  const menu = page.locator("aside nav");
  await expect(menu.getByRole("link", { name: /^Inicio/ })).toHaveCount(0);
  const propios = ["Venta", "Reportes de venta", "Gastos de la sucursal", "Stock y pedidos", "Transferencias", "Cierre de caja"];
  const compartidos = ["Catálogo", "Inventario de sucursales", "Bodega central", "Promociones y cupones", "Combos", "Eventos", "QR de cobro", "Sucursales", "Auditoría de caja", "Configuración"];
  for (const item of propios) {
    await expect(menu.getByRole("link", { name: new RegExp(`^${item}`) })).toBeVisible(); // algunos llevan el número de alertas
  }
  // Por defecto todos los candados están cerrados: ningún apartado del administrador aparece en su menú.
  for (const item of [...compartidos, "Personal", "Sueldos"]) await expect(menu.getByRole("link", { name: new RegExp(`^${item}`) })).toHaveCount(0);
  await page.screenshot({ path: "test-results/encargado-2-panel.png", fullPage: true });

  for (const ruta of ["/admin/dashboard", "/admin/personal", "/admin/reportes", "/admin/gastos"]) {
    // El servidor redirige dos veces (a la venta y de ahí a abrir caja): la navegación original puede darse por "abortada".
    await page.goto(ruta).catch(() => {});
    await expect(page, ruta).toHaveURL(/\/cajero\/(venta|apertura)/);
    await page.waitForLoadState("load");
  }
  expect((await page.request.get("/encargado/panel")).status()).toBe(404); // el panel de inicio ya no existe
  expect((await page.request.get("/api/admin/exportar?reporte=ventas&formato=xlsx")).status()).toBe(403);
  expect((await page.request.get("/api/admin/plantilla-productos")).status()).toBe(403);
});

test("candados: cerrado, el apartado no le aparece al encargado ni abre por la dirección; el administrador lo abre y entonces aparece, sin costos", async ({ page, browser }) => {
  const destinoCerrado = /\/cajero\/(venta|apertura)/;
  const menu = page.locator("aside nav");
  await ingresarEncargado(page);
  // Candado cerrado: ni en el menú ni escribiendo la dirección.
  for (const ruta of ["/admin/catalogo", "/admin/inventario", "/admin/bodega", "/admin/promociones", "/admin/combos", "/admin/eventos", "/admin/qr", "/admin/sucursales", "/admin/auditoria", "/admin/configuracion"]) {
    await page.goto(ruta).catch(() => {});
    await expect(page, ruta).toHaveURL(destinoCerrado);
    await page.waitForLoadState("load");
  }
  await expect(menu.getByRole("link", { name: /^Catálogo/ })).toHaveCount(0);

  // Administrador: abre los candados de Catálogo y Auditoría desde su menú.
  const admin = await (await browser.newContext()).newPage();
  await ingresarAdmin(admin);
  const candado = (apartado: string) => admin.locator("aside").getByRole("switch", { name: new RegExp(`Candado de ${apartado}`) });
  await expect(admin.locator("aside").getByRole("switch", { name: /Candado de/ })).toHaveCount(10);
  for (const apartado of ["Catálogo", "Auditoría de caja"]) {
    await expect(candado(apartado)).toHaveAttribute("aria-checked", "false");
    await candado(apartado).click();
    await expect(candado(apartado)).toHaveAttribute("aria-checked", "true");
  }
  await admin.screenshot({ path: "test-results/encargado-9-candado-admin.png" });

  // Encargado: ahora le aparecen esos dos (y solo esos) y puede crear un producto, sin ver costos.
  await page.reload();
  await expect(menu.getByRole("link", { name: /^Catálogo/ })).toBeVisible();
  await expect(menu.getByRole("link", { name: /^Auditoría de caja/ })).toBeVisible();
  await expect(menu.getByRole("link", { name: /^QR de cobro/ })).toHaveCount(0);
  await page.screenshot({ path: "test-results/encargado-8-menu-con-candado-abierto.png", fullPage: true });
  await menu.getByRole("link", { name: /^Catálogo/ }).click();
  await expect(page.getByRole("heading", { name: "Catálogo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Importar Excel" })).toHaveCount(0);
  expect(await page.content()).not.toContain("280.00"); // el costo no viaja al navegador
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  const ficha = page.getByRole("dialog");
  await ficha.getByLabel("Nombre").fill(`Producto encargado ${N}`);
  await ficha.getByLabel("Precio de venta (Bs)").fill("45");
  await expect(ficha.getByText("Precio de costo")).toHaveCount(0);
  await ficha.getByRole("button", { name: /Guardar|Crear/ }).click();
  await expect(page.locator("main li").filter({ hasText: `Producto encargado ${N}` })).toBeVisible();
  // Auditoría: solo las cajas de su sucursal, sin las acciones sensibles.
  await page.goto("/admin/auditoria?vista=acciones");
  await expect(page.getByRole("heading", { name: "Auditoría" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Acciones sensibles" })).toHaveCount(0);
  await page.goto("/admin/qr").catch(() => {});
  await expect(page).toHaveURL(destinoCerrado);

  // El administrador los cierra de nuevo: desaparecen otra vez.
  for (const apartado of ["Catálogo", "Auditoría de caja"]) {
    await candado(apartado).click();
    await expect(candado(apartado)).toHaveAttribute("aria-checked", "false");
  }
  await page.goto("/admin/catalogo").catch(() => {});
  await expect(page).toHaveURL(destinoCerrado);
  await expect(menu.getByRole("link", { name: /^Catálogo/ })).toHaveCount(0);
  await admin.context().close();
});

test("encargado: reportes y gastos solo de su sucursal, sin costos ni exportación; cajas y transferencias", async ({ page }) => {
  await ingresarEncargado(page);
  // Aunque pida "todas" u otra sucursal en la dirección, ve la suya.
  await page.goto("/encargado/reportes?sucursal=todas&vista=productos");
  await expect(page.getByRole("heading", { name: "Reporte de ventas" })).toBeVisible();
  await expect(page.getByText(/Sucursal principal ·/)).toBeVisible();
  await expect(page.getByText("Total vendido")).toBeVisible();
  for (const oculto of ["Ganancia", "Costo", "Margen", "Excel", "PDF"]) await expect(page.locator("main").getByText(oculto)).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Sucursal" })).toHaveCount(0);
  // Los costos tampoco viajan escondidos en la página.
  expect(await page.content()).not.toContain("280.00");
  await page.screenshot({ path: "test-results/encargado-3-reportes.png", fullPage: true });

  await page.goto("/encargado/reportes?sucursal=999");
  await expect(page.getByText(/Sucursal principal ·/)).toBeVisible();

  await page.goto("/encargado/gastos");
  await expect(page.getByRole("heading", { name: "Gastos de la sucursal" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Anular/ })).toHaveCount(0);

  await page.goto("/encargado/cajas");
  await expect(page.getByRole("heading", { name: "Cajas" })).toBeVisible();
  await page.goto("/encargado/transferencias");
  await expect(page.getByRole("heading", { name: "Transferencias" })).toBeVisible();
});

test("encargado: la campanita lo lleva al producto en su inventario, resaltado", async ({ page }) => {
  await ingresarEncargado(page);
  const campanita = page.getByRole("button", { name: /^Alertas:/ });
  await campanita.click();
  await page.getByRole("dialog").getByRole("button", { name: /Creatina E2E/ }).first().click();
  await expect(page).toHaveURL(/\/cajero\/bodega\?resaltar=\d+/);
  const fila = page.locator("li.fila-resaltada");
  await expect(fila).toHaveCount(1);
  await expect(fila).toContainText("Creatina E2E");
  await expect(fila).toBeInViewport();
  await expect(fila.getByRole("button", { name: /Pedir|Solicitado/ }).or(fila.getByText("Solicitado"))).toBeVisible();
  await page.screenshot({ path: "test-results/encargado-4-campanita.png" });
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

test("encargado: abre caja, vende con su propio máximo de descuento y anula sin pedir PIN", async ({ page }) => {
  await ingresarEncargado(page);
  await page.goto("/cajero/venta");
  const buscador = page.getByPlaceholder(/Buscar por nombre/);
  const apertura = page.getByRole("heading", { name: "Abrir caja" });
  await expect(buscador.or(apertura)).toBeVisible({ timeout: 30_000 });
  if (await apertura.isVisible()) {
    await page.getByRole("button", { name: "Bs 100,00" }).click();
    await page.getByRole("button", { name: "Abrir caja", exact: true }).click();
    await expect(buscador).toBeVisible();
  }
  await agregarProducto(page, /Whey E2E/);
  await page.getByRole("button", { name: "Cobrar", exact: true }).click();
  const dialogo = page.getByRole("dialog").filter({ hasText: "Descuento manual" });
  await dialogo.getByRole("button", { name: /^Descuento manual/ }).click();
  await dialogo.getByLabel("Porcentaje de descuento manual").fill("15");
  await dialogo.getByLabel("Motivo del descuento manual").fill("Cliente mayorista");
  await expect(dialogo.getByRole("button", { name: "Autorizar con PIN" })).toHaveCount(0);
  // 350 − 15 % = 297,50.
  await expect(dialogo.getByText("Bs 297,50").first()).toBeVisible();
  await dialogo.getByRole("button", { name: "Exacto" }).click();
  await dialogo.locator("form button[type=submit]").click();
  await expect(page.getByText(/Venta realizada|Venta registrada/).first()).toBeVisible();

  // En el reporte de su sucursal ve la venta (y la del cajero, anulada) y la anula directamente.
  await page.goto("/encargado/reportes");
  await expect(page.locator("main li").filter({ hasText: "Bs 315,00" }).first()).toContainText("Anulada");
  await page.getByRole("button", { name: /Bs 297,50/ }).first().click();
  const comprobante = page.getByRole("dialog").filter({ hasText: "Comprobante N.º" });
  await comprobante.getByRole("button", { name: "Anular venta" }).click();
  await comprobante.getByLabel("Motivo").fill("Prueba de anulación del encargado");
  await comprobante.getByRole("button", { name: "Anular venta" }).click();
  await expect(page.getByText("Venta anulada: el stock volvió a la sucursal")).toBeVisible();

  await page.goto("/encargado/cajas");
  await expect(page.locator("tr").filter({ hasText: "Encargada de prueba" }).first()).toContainText("Abierta");

  // En celular: pestañas inferiores y sin desborde horizontal.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/encargado/reportes");
  await expect(page.locator("nav.fixed").getByRole("link", { name: "Venta", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/encargado-7-celular.png", fullPage: true });
});
