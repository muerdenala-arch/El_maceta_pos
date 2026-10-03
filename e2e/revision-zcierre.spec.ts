import { expect, test } from "@playwright/test";
import { ADMIN, CAJERO, ingresarAdmin, ingresarCajero } from "./ayudas";

/**
 * Una caja que quedó abierta la cierra el administrador desde Auditoría → Cajas (con motivo). Corre al final:
 * deja al cajero de prueba sin caja abierta.
 */
test.skip(!ADMIN.pin || !CAJERO.pin, "Faltan SEED_* en .env.local");

test("administrador: cierra desde Auditoría una caja que quedó abierta", async ({ page, browser }) => {
  // El cajero deja su caja abierta.
  const cajero = await (await browser.newContext()).newPage();
  await ingresarCajero(cajero);
  await cajero.context().close();

  await ingresarAdmin(page);
  await page.goto("/admin/auditoria");
  const fila = page.locator("tbody tr").filter({ has: page.getByRole("button", { name: /^Cerrar la caja de/ }) }).first();
  await expect(fila).toContainText("Abierta");
  await fila.getByRole("button", { name: /^Cerrar la caja de/ }).click();

  const d = page.getByRole("dialog");
  await expect(d.getByText("Efectivo esperado en la caja:")).toBeVisible();
  // Sin motivo no se cierra.
  await d.getByLabel("Efectivo contado (Bs)").fill("0");
  await d.getByRole("button", { name: "Cerrar caja" }).click();
  await expect(d.getByText("El motivo es obligatorio")).toBeVisible();
  await d.getByLabel("Motivo").fill("Prueba: el cajero se retiró sin cerrar");
  await page.screenshot({ path: "test-results/cierre-auditoria-1-dialogo.png" });
  await d.getByRole("button", { name: "Cerrar caja" }).click();
  await expect(d).toBeHidden();

  // Ya no queda ninguna caja abierta y el cierre aparece entre las acciones sensibles.
  await expect(page.getByRole("button", { name: /^Cerrar la caja de/ })).toHaveCount(0);
  await page.screenshot({ path: "test-results/cierre-auditoria-2-lista.png", fullPage: true });
  await page.goto("/admin/auditoria?vista=acciones");
  await expect(page.getByText("Caja cerrada desde Auditoría").first()).toBeVisible();

  // El cajero vuelve a entrar: le toca abrir una caja nueva.
  const otra = await (await browser.newContext()).newPage();
  await ingresarCajero(otra, { abrirSiHaceFalta: false });
  await expect(otra.getByRole("heading", { name: "Abrir caja" })).toBeVisible();
  await otra.context().close();
});
