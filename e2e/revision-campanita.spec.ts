import { expect, test } from "@playwright/test";
import { ADMIN, CAJERO, ingresarAdmin } from "./ayudas";

/**
 * Campanita: al tocar una alerta de stock se llega al producto (aunque un filtro lo oculte), la fila parpadea 5 veces
 * y queda con borde hasta hacer clic en otro lugar, la cantidad se marca en rojo, la alerta queda leída y todo
 * funciona también al recargar (?resaltar=ID). Con "reducir movimiento": resaltada sin parpadear.
 */
test.skip(!ADMIN.pin || !CAJERO.pin, "Faltan SEED_* en .env.local");

test("alerta de stock → producto resaltado, cantidad en rojo, sin filtros y leída", async ({ page }) => {
  await ingresarAdmin(page);
  const campanita = page.getByRole("button", { name: /^Alertas:/ });
  const sinLeer = async () => Number((await campanita.getAttribute("aria-label"))!.match(/\d+/)![0]);
  const fila = page.locator("tr.fila-resaltada");
  const abrirAlerta = async () => {
    await campanita.click();
    await page.getByRole("dialog").getByRole("button", { name: /Creatina E2E/ }).first().click();
  };

  const antes = await sinLeer();
  expect(antes).toBeGreaterThan(0);
  await abrirAlerta();
  await expect(page).toHaveURL(/\/admin\/inventario\?resaltar=\d+&sucursal=\d+/);
  await expect(fila).toHaveCount(1);
  await expect(fila).toContainText("Creatina E2E");
  await expect(fila).toBeInViewport();
  // Parpadea 5 veces y queda con borde; la cantidad de esa sucursal va en rojo.
  expect(await fila.evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el).animationIterationCount, getComputedStyle(el).outlineStyle])).toEqual([
    "parpadeo-alerta",
    "5",
    "solid",
  ]);
  await expect(fila.locator("[data-en-alerta]")).toHaveCount(1);
  await page.screenshot({ path: "test-results/campanita-1-resaltado.png" });
  // La alerta quedó leída.
  await expect.poll(sinLeer).toBe(antes - 1);

  // Con un filtro que oculta el producto: al tocar la alerta de nuevo se limpia el filtro y vuelve a resaltarse.
  const buscador = page.getByRole("searchbox", { name: "Buscar producto" });
  await buscador.fill("whey");
  await expect(page.getByText("Creatina E2E")).toHaveCount(0);
  await abrirAlerta();
  await expect(buscador).toHaveValue("");
  await expect(fila).toContainText("Creatina E2E");

  // Clic en otro lugar: deja de estar resaltada. Al recargar (la dirección conserva ?resaltar) vuelve a marcarse.
  await page.waitForTimeout(500);
  await page.getByRole("heading", { name: "Inventario" }).click();
  await expect(fila).toHaveCount(0);
  await page.reload();
  await expect(fila).toContainText("Creatina E2E");

  // "Reducir movimiento": resaltada, sin parpadeo.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(fila).toContainText("Creatina E2E");
  expect(await fila.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  expect(await fila.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");

  // En el celular y en modo oscuro.
  await page.emulateMedia({ reducedMotion: "no-preference", colorScheme: "dark" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.reload();
  await expect(fila).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/campanita-2-celular-oscuro.png" });
});
