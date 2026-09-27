import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { ADMIN, agregarProducto, CAJERO, cobrar, desbloquear, ingresarAdmin, ingresarCajero } from "./ayudas";

/**
 * Criterios de aceptación de la sección 11 del plan que se comprueban en el navegador
 * (los de venta sin internet están en offline.spec.ts). Corren en orden sobre la base nueva de
 * e2e/preparar-base.ts: el cajero empieza sin caja abierta y hay un producto con stock bajo.
 */
test.describe.configure({ mode: "serial" });
test.skip(!CAJERO.usuario || !CAJERO.pin || !ADMIN.usuario || !ADMIN.pin, "Faltan SEED_* en .env.local");

const bloqueo = (page: import("@playwright/test").Page) => page.getByRole("dialog", { name: "Pantalla bloqueada" }).or(page.getByLabel("Pantalla bloqueada"));

test("un cajero no puede vender sin haber abierto caja", async ({ page }) => {
  await ingresarCajero(page, { abrirSiHaceFalta: false });
  await expect(page.getByRole("heading", { name: "Abrir caja" })).toBeVisible();
  for (const ruta of ["/cajero/venta", "/cajero/gastos", "/cajero/cierre"]) {
    await page.goto(ruta);
    await expect(page.getByRole("heading", { name: "Abrir caja" })).toBeVisible();
  }
});

test("un cajero no entra a pantallas ni API de administrador", async ({ page }) => {
  await ingresarCajero(page);
  for (const ruta of ["/admin/dashboard", "/admin/reportes", "/admin/personal", "/admin/configuracion", "/admin/inventario"]) {
    await page.goto(ruta);
    await expect(page).toHaveURL(/\/cajero\//);
  }
  expect((await page.request.get("/api/admin/exportar?reporte=ventas&formato=xlsx")).status()).toBe(403);
});

test("tras una venta se imprime, se descarga el PDF y se envía por WhatsApp", async ({ page }) => {
  await ingresarCajero(page);
  await agregarProducto(page, /Whey E2E/);
  await cobrar(page, "Efectivo");
  await expect(page.getByRole("heading", { name: "Venta realizada" })).toBeVisible();

  await page.evaluate(() => {
    const w = window as unknown as { __impresiones: number; __abiertas: string[] };
    w.__impresiones = 0;
    w.__abiertas = [];
    window.print = () => void w.__impresiones++;
    window.open = ((url: string) => void w.__abiertas.push(url)) as unknown as typeof window.open;
  });

  await page.getByRole("button", { name: "Imprimir", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __impresiones: number }).__impresiones)).toBe(1);

  const [descarga] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "PDF" }).click()]);
  expect(descarga.suggestedFilename()).toMatch(/\.pdf$/);
  expect((await readFile((await descarga.path())!)).subarray(0, 5).toString()).toBe("%PDF-");

  await page.getByRole("button", { name: "WhatsApp" }).click();
  await page.getByLabel("Celular del cliente").fill("71234567");
  await page.getByRole("button", { name: "Abrir WhatsApp con el enlace" }).click();
  const [url] = await page.evaluate(() => (window as unknown as { __abiertas: string[] }).__abiertas);
  expect(url).toMatch(/^https:\/\/wa\.me\/59171234567\?text=/);
  const enlace = decodeURIComponent(url).match(/https?:\/\/\S+\/comprobante\/[\w-]+/)?.[0];
  expect(enlace).toBeTruthy();

  // El enlace del cliente abre el comprobante sin iniciar sesión.
  const publica = await page.context().browser()!.newPage();
  await publica.goto(enlace!);
  await expect(publica.getByText("Whey E2E").first()).toBeVisible();
  await publica.close();
});

test("al reabrir la app y tras 15 minutos sin uso se pide el PIN, y el carrito se conserva", async ({ page, context }) => {
  await ingresarCajero(page);
  await page.close();

  // "Reabrir la app": pestaña nueva (sin la marca de desbloqueo de la sesión del navegador).
  const nueva = await context.newPage();
  await nueva.goto("/cajero/venta");
  await expect(bloqueo(nueva)).toBeVisible();
  await desbloquear(nueva, CAJERO.pin);
  await expect(bloqueo(nueva)).toBeHidden();

  await agregarProducto(nueva, /Whey E2E/);
  const cobrarBoton = nueva.getByRole("button", { name: "Cobrar", exact: true });
  await expect(cobrarBoton).toBeEnabled();

  // 15 minutos sin uso: se adelanta la hora de la página (el guardia la revisa cada 15 s).
  // No se usa page.clock: congela las animaciones de salida de la capa de bloqueo.
  await nueva.evaluate(() => {
    const real = Date.now.bind(Date);
    Date.now = () => real() + 15 * 60_000 + 1000;
  });
  await expect(bloqueo(nueva)).toBeVisible({ timeout: 20_000 });
  await desbloquear(nueva, CAJERO.pin);
  await expect(bloqueo(nueva)).toBeHidden();
  await expect(cobrarBoton).toBeEnabled();
  // El producto sigue en el carrito (línea "Bs 350,00 c/u") después del bloqueo.
  await expect(nueva.locator("main li").filter({ hasText: /Whey E2E/ }).filter({ hasText: "c/u" })).toBeVisible();
});

test("el tema se mantiene al recargar y el botón de recarga no cierra la sesión", async ({ page }) => {
  await ingresarCajero(page);
  const oscuro = () => page.evaluate(() => document.documentElement.classList.contains("dark"));
  const antes = await oscuro();
  await page.getByRole("switch", { name: "Modo oscuro" }).first().click();
  await expect.poll(oscuro).toBe(!antes);
  await page.reload();
  await expect(bloqueo(page)).toBeHidden();
  expect(await oscuro()).toBe(!antes);

  await page.getByRole("button", { name: "Actualizar datos" }).first().click();
  await expect(page).toHaveURL(/\/cajero\/venta/);
  await expect(page.getByPlaceholder(/Buscar por nombre/)).toBeVisible();
});

test("el cierre calcula la diferencia y el admin recibe la alerta", async ({ page }) => {
  await ingresarCajero(page);
  await page.goto("/cajero/cierre");
  const esperado = await page.getByText("Efectivo esperado").locator("..").locator(".cifras").innerText();
  // Bs 100 de apertura + una venta de Bs 350 en efectivo.
  expect(esperado).toBe("Bs 450,00");
  await page.getByLabel("¿Cuánto efectivo contaste?").fill("440");
  const indicador = page.locator("[aria-live=polite]").filter({ hasText: "Faltante" });
  await expect(indicador).toContainText("Bs 10,00");
  await page.getByRole("button", { name: "Cerrar caja" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Sí, cerrar caja" }).click();
  await expect(page.getByRole("heading", { name: "Caja cerrada" })).toBeVisible();
  await expect(page.getByText("Se avisó al administrador de la diferencia.")).toBeVisible();
});

test("el admin ve las alertas: la de stock abre el inventario con el producto resaltado", async ({ page }) => {
  await ingresarAdmin(page);
  await page.getByRole("button", { name: /^Alertas:/ }).click();
  // En la campanita cada alerta es un botón (el panel de inicio también las muestra, como enlaces).
  const enCampanita = (texto: RegExp) => page.getByRole("button").filter({ hasText: texto });
  await expect(enCampanita(/Caja de Cajero de prueba .* cerrada con faltante de Bs 10,00/)).toBeVisible();
  await enCampanita(/Creatina E2E: quedan 2/).click();
  await expect(page).toHaveURL(/\/admin\/inventario\?resaltar=\d+/);
  await expect(page.locator(".fila-resaltada")).toContainText("Creatina E2E");
});

test("en el celular (375 px) las pantallas principales no se desbordan", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const sinDesborde = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  await ingresarAdmin(page);
  for (const ruta of ["/admin/dashboard", "/admin/reportes", "/admin/gastos", "/admin/inventario", "/admin/auditoria"]) {
    await page.goto(ruta);
    await expect(page.locator("main h1")).toBeVisible();
    expect(await sinDesborde(), ruta).toBe(true);
  }
});
