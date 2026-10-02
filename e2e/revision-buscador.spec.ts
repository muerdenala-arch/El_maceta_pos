import { expect, test } from "@playwright/test";
import { ADMIN, CAJERO, ingresarAdmin, ingresarCajero } from "./ayudas";

/**
 * Buscador único: filtra mientras se escribe (sin Enter), ignora mayúsculas y tildes, resalta la coincidencia,
 * avisa cuando no hay resultados (con botón para limpiar) y en el punto de venta funciona sin internet.
 * El archivo se llama "revision-…" para correr después de criterios.spec.ts (que necesita al cajero sin caja abierta).
 */
test.skip(!ADMIN.pin || !CAJERO.pin, "Faltan SEED_* en .env.local");

test("catálogo: en tiempo real, sin tildes, resaltado y sin resultados", async ({ page }) => {
  await ingresarAdmin(page);
  await page.goto("/admin/catalogo");
  const buscador = page.getByRole("searchbox", { name: "Buscar producto" });
  const whey = page.getByRole("button", { name: /Whey E2E/ });
  const creatina = page.getByRole("button", { name: /Creatina E2E/ });
  await expect(whey).toBeVisible();
  await expect(creatina).toBeVisible();

  // "PROTEINAS" (sin tilde, mayúsculas) encuentra la categoría "Proteínas" sin presionar Enter.
  await buscador.pressSequentially("PROTEINAS");
  await expect(page.locator("mark").first()).toHaveText("Proteínas");
  await expect(whey).toBeVisible();
  await expect(creatina).toBeVisible();

  await buscador.fill("whey e2e");
  await expect(creatina).toBeHidden();
  await expect(whey.locator("mark").first()).toHaveText("Whey");
  await page.screenshot({ path: "test-results/buscador-1-resaltado.png" });

  await buscador.fill("no existe zzz");
  await expect(page.getByText("No se encontraron resultados para “no existe zzz”")).toBeVisible();
  await expect(whey).toBeHidden();
  await page.screenshot({ path: "test-results/buscador-2-sin-resultados.png" });
  await page.getByRole("button", { name: "Limpiar búsqueda" }).last().click();
  await expect(buscador).toHaveValue("");
  await expect(whey).toBeVisible();
  await expect(creatina).toBeVisible();
});

test("listas paginadas: la búsqueda va en la dirección sin presionar Enter y se puede limpiar", async ({ page }) => {
  await ingresarAdmin(page);
  await page.goto("/admin/inventario?vista=movimientos");
  const buscador = page.getByRole("searchbox", { name: "Buscar movimientos" });
  await buscador.pressSequentially("zzz no existe");
  await expect(page).toHaveURL(/producto=zzz\+no\+existe/);
  await expect(page.getByText("No se encontraron resultados para “zzz no existe”")).toBeVisible();
  await page.getByRole("button", { name: "Limpiar búsqueda" }).last().click();
  await expect(page).not.toHaveURL(/producto=/);
  await expect(buscador).toHaveValue("");

  // Las pantallas que no tenían buscador ahora lo tienen.
  for (const [ruta, nombre] of [
    ["/admin/sucursales", "Buscar sucursales"],
    ["/admin/qr", "Buscar QR"],
    ["/admin/auditoria", "Buscar cajas"],
    ["/admin/auditoria?vista=acciones", "Buscar acciones"],
    ["/admin/reportes", "Buscar ventas"],
  ] as const) {
    await page.goto(ruta);
    await expect(page.getByRole("searchbox", { name: nombre })).toBeVisible();
  }
  await page.goto("/admin/sucursales");
  await page.getByRole("searchbox", { name: "Buscar sucursales" }).fill("bodega");
  await expect(page.locator("article")).toHaveCount(1);
  await expect(page.locator("mark")).toHaveText(["Bodega"]);
});

test("punto de venta: busca sin internet y Enter agrega el único resultado", async ({ page, context }) => {
  await ingresarCajero(page);
  const buscador = page.getByRole("searchbox", { name: "Buscar producto" });
  const whey = page.getByRole("button", { name: "Ver foto de Whey E2E" });
  const creatina = page.getByRole("button", { name: "Ver foto de Creatina E2E" });
  await expect(whey).toBeVisible();
  await expect(creatina).toBeVisible();

  await context.setOffline(true);
  await buscador.pressSequentially("creatina e2e");
  await expect(whey).toBeHidden();
  await expect(creatina).toBeVisible();
  await expect(page.locator("mark").first()).toHaveText("Creatina");

  await buscador.fill("no hay");
  await expect(page.getByText("No se encontraron resultados para “no hay”")).toBeVisible();

  // Enter con un único resultado: se elige ese producto y el campo queda limpio (igual que al escanear un código).
  await buscador.fill("whey e2e");
  await buscador.press("Enter");
  await expect(buscador).toHaveValue("");
  await expect(creatina).toBeVisible(); // el filtro se quitó: vuelve a verse todo
  await context.setOffline(false);
});
