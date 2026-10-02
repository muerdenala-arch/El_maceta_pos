import { expect, test, type Locator } from "@playwright/test";
import { ADMIN, CAJERO, ingresarAdmin, ingresarCajero } from "./ayudas";

/**
 * Nombres largos: si no entran, se desplazan de lado (marquesina) con degradado en los bordes; si entran, quedan
 * quietos. En el punto de venta se mueven solos; en las tablas del administrador, al pasar el mouse. Con
 * "reducir movimiento" no se animan: se muestran en dos líneas.
 */
test.describe.configure({ mode: "serial" });
test.skip(!ADMIN.pin || !CAJERO.pin, "Faltan SEED_* en .env.local");

const LARGO = "Proteína Aislada Hidrolizada Ultra Premium Sabor Chocolate Belga Edición Limitada 5 libras";

/** Desplazamiento horizontal actual del texto (0 = quieto en el inicio). */
const corrimiento = (marquesina: Locator) =>
  marquesina.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el.firstElementChild!).transform).m41);

test("administrador: el nombre largo se mueve al pasar el mouse; el corto queda quieto", async ({ page }) => {
  await ingresarAdmin(page);
  await page.goto("/admin/catalogo");
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Nombre").fill(LARGO);
  await d.getByLabel("Precio de venta (Bs)").fill("450");
  await d.getByLabel("Precio de costo (Bs)").fill("300");
  await d.getByRole("button", { name: "Guardar" }).click();
  await expect(d).toBeHidden();

  const tarjeta = page.getByRole("button", { name: /Hidrolizada/ });
  const largo = tarjeta.locator(".marquesina");
  await expect(largo).toHaveAttribute("data-desborda", "true");
  await expect(largo).not.toHaveAttribute("data-moviendo", "true");
  expect(await corrimiento(largo)).toBe(0);
  // El corto entra completo: sin degradado ni movimiento.
  const corto = page.getByRole("button", { name: /Creatina E2E/ }).locator(".marquesina");
  await expect(corto).not.toHaveAttribute("data-desborda", "true");

  await tarjeta.hover();
  await expect(largo).toHaveAttribute("data-moviendo", "true");
  expect(await corrimiento(largo)).toBe(0); // pausa inicial de 1,5 s
  await expect.poll(() => corrimiento(largo), { timeout: 6_000 }).toBeLessThan(-20);
  await page.screenshot({ path: "test-results/marquesina-1-catalogo.png" });
  await page.mouse.move(5, 5);
  await expect(largo).not.toHaveAttribute("data-moviendo", "true");
  expect(await corrimiento(largo)).toBe(0);

  // Todo el nombre termina mostrándose: llega hasta el final exacto y no se pasa.
  const sobra = await largo.evaluate((el) => el.firstElementChild!.scrollWidth - el.clientWidth);
  await tarjeta.hover();
  await expect.poll(() => corrimiento(largo), { timeout: 1_500 + (sobra / 40) * 1_000 + 3_000 }).toBeCloseTo(-sobra, 0);
});

test("punto de venta: se mueve solo, también en celular y modo oscuro; con 'reducir movimiento' va en dos líneas", async ({ page }) => {
  await ingresarCajero(page);
  const largo = page.locator("main li").filter({ hasText: "Hidrolizada" }).locator(".marquesina").first();
  await expect(largo).toHaveAttribute("data-moviendo", "true");
  await expect.poll(() => corrimiento(largo), { timeout: 6_000 }).toBeLessThan(-20);
  const altoUnaLinea = (await largo.boundingBox())!.height;
  await page.screenshot({ path: "test-results/marquesina-2-pos.png" });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await expect(largo).toHaveAttribute("data-moviendo", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/marquesina-3-celular-oscuro.png" });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(largo).not.toHaveAttribute("data-moviendo", "true");
  await expect(largo).not.toHaveAttribute("data-desborda", "true");
  expect(await corrimiento(largo)).toBe(0);
  expect((await largo.boundingBox())!.height).toBeGreaterThan(altoUnaLinea * 1.6);
  await page.screenshot({ path: "test-results/marquesina-4-reducir-movimiento.png" });
});
