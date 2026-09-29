import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { ADMIN, CAJERO, ingresarAdmin, ingresarCajero } from "./ayudas";

/**
 * Módulo Eventos en el navegador: crear un Reto Transformación, inscribir, iniciar, pesar (con aviso de
 * más de 10 %), podio, finalizar y exportar. Además: un cajero no entra ni por URL ni por el API.
 * Guarda capturas en test-results/eventos-*.png para revisar el diseño (escritorio, celular y modo oscuro).
 */
test.describe.configure({ mode: "serial" });
test.skip(!ADMIN.pin || !CAJERO.pin, "Faltan SEED_* en .env.local");

const hoyBolivia = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/La_Paz" });
const menosDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
const HOY = hoyBolivia();

async function inscribir(page: Page, nombre: string, ci: string, cel: string, peso: string) {
  await page.getByRole("button", { name: "Inscribir participante" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Nombre completo").fill(nombre);
  await d.getByLabel("Cédula de identidad").fill(ci);
  await d.getByLabel("Celular").fill(cel);
  await d.getByLabel("Peso inicial (kg)").fill(peso);
  await d.getByRole("checkbox").check();
  await d.getByRole("button", { name: "Inscribir", exact: true }).click();
  await expect(d).toBeHidden();
}

test("el administrador crea un reto, lo sigue y publica los resultados", async ({ page }) => {
  await ingresarAdmin(page);

  await test.step("menú Eventos → catálogo de juegos → nuevo reto", async () => {
    await page.getByRole("link", { name: "Eventos" }).first().click();
    await expect(page.getByRole("heading", { name: "Eventos" })).toBeVisible();
    await page.screenshot({ path: "test-results/eventos-1-catalogo.png" });
    await page.getByRole("link", { name: /Reto Transformación/ }).click();
    await page.getByRole("button", { name: "Nuevo reto" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Nombre").fill("Reto E2E");
    await d.getByLabel("Fecha de inicio").fill(menosDias(HOY, 20)); // hoy es el último día (21 días)
    await d.getByRole("button", { name: "21 días" }).click();
    await expect(d.getByText("Justo para todos")).toBeVisible();
    await page.screenshot({ path: "test-results/eventos-2-nuevo-reto.png" });
    await d.getByRole("button", { name: "Crear reto" }).click();
    await expect(page.getByRole("heading", { name: /Reto E2E/ })).toBeVisible();
  });

  await test.step("inscripción: casilla obligatoria, validaciones y cédula única", async () => {
    await page.getByRole("button", { name: "Inscribir participante" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Nombre completo").fill("Sin Casilla");
    await d.getByLabel("Cédula de identidad").fill("5555555");
    await d.getByLabel("Celular").fill("71111111");
    await d.getByLabel("Peso inicial (kg)").fill("25");
    await d.getByRole("button", { name: "Inscribir", exact: true }).click();
    await expect(d.getByText("El peso debe estar entre 30 y 300 kg")).toBeVisible();
    await expect(d.getByText(/debe aceptar participar/)).toBeVisible();
    await d.getByRole("button", { name: "Cancelar" }).click();

    await inscribir(page, "Ana E2E", "7000001", "71000001", "100");
    await inscribir(page, "Beto E2E", "7000002", "71000002", "80");
    await inscribir(page, "Carla E2E", "7000003", "71000003", "60");

    await page.getByRole("button", { name: "Inscribir participante" }).click();
    const d2 = page.getByRole("dialog");
    await d2.getByLabel("Nombre completo").fill("Repetida");
    await d2.getByLabel("Cédula de identidad").fill("7000001");
    await d2.getByLabel("Celular").fill("71000009");
    await d2.getByLabel("Peso inicial (kg)").fill("70");
    await d2.getByRole("checkbox").check();
    await d2.getByRole("button", { name: "Inscribir", exact: true }).click();
    await expect(d2.getByText("Ya hay un participante con esta cédula en este reto")).toBeVisible();
    await d2.getByRole("button", { name: "Cancelar" }).click();
    await page.screenshot({ path: "test-results/eventos-3-participantes.png" });
  });

  await test.step("iniciar con confirmación", async () => {
    await page.getByRole("button", { name: "Iniciar reto" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Sí, iniciar" }).click();
    await expect(page.getByText("En curso").first()).toBeVisible();
    await expect(page.getByText("Hoy es el último día")).toBeVisible();
    await expect(page.getByText(/El reto cumplió su duración/)).toBeVisible();
  });

  await test.step("jornada intermedia con aviso de más de 10 %", async () => {
    await page.getByRole("link", { name: "Pesajes" }).click();
    await page.getByLabel("Jornada de pesaje").fill(menosDias(HOY, 10));
    await page.getByRole("checkbox", { name: "Pesaje final" }).uncheck(); // viene marcado porque ya se cumplió el plazo
    await page.getByLabel("Peso de Ana E2E").fill("96");
    await page.getByLabel("Peso de Beto E2E").fill("70"); // −12,5 %: pide confirmación
    await page.getByLabel("Peso de Carla E2E").fill("57");
    await page.getByRole("button", { name: /Guardar 3 pesajes/ }).click();
    const aviso = page.getByRole("alertdialog");
    await expect(aviso.getByText("¿Seguro? Puede ser un error de digitación")).toBeVisible();
    await expect(aviso.getByText(/Beto E2E: 80,00 → 70,00 kg/)).toBeVisible();
    await aviso.getByRole("button", { name: "Sí, están bien" }).click();
    await expect(page.getByText("Pesajes guardados")).toBeVisible();
  });

  await test.step("pesaje final", async () => {
    await page.getByLabel("Jornada de pesaje").fill(HOY);
    await page.getByRole("checkbox", { name: "Pesaje final" }).check();
    await page.getByLabel("Peso de Ana E2E").fill("90"); // 10 %
    await page.getByLabel("Peso de Beto E2E").fill("69"); // 13,75 %
    await page.getByRole("button", { name: /Guardar 2 pesajes finales/ }).click();
    await expect(page.getByText("Pesajes guardados")).toBeVisible();
    await page.screenshot({ path: "test-results/eventos-4-pesajes.png", fullPage: true });
  });

  await test.step("tabla de posiciones parciales con podio y gráfico", async () => {
    await page.getByRole("link", { name: "Tabla de posiciones" }).click();
    await expect(page.getByRole("heading", { name: "Posiciones parciales" })).toBeVisible();
    const podio = page.getByRole("list", { name: "Podio" });
    await expect(podio.getByText("1.er lugar")).toBeVisible();
    await expect(podio.locator("li").first()).toContainText("Beto E2E");
    await expect(page.getByRole("img", { name: /Gráfico de líneas/ })).toBeVisible();
    await expect(page.locator("main")).not.toContainText("7000001"); // nunca la cédula en la tabla
    await page.screenshot({ path: "test-results/eventos-5-posiciones.png", fullPage: true });
  });

  await test.step("finalizar: Carla sin pesaje final queda como 'No completó'", async () => {
    await page.getByRole("button", { name: "Finalizar reto" }).click();
    const d = page.getByRole("alertdialog");
    await expect(d.getByText(/Sin pesaje final \(1\): Carla E2E/)).toBeVisible();
    await d.getByRole("button", { name: "Finalizar igual" }).click();
    await expect(page.getByRole("heading", { name: "Resultados finales" })).toBeVisible();
    await expect(page.locator("tr", { hasText: "Carla E2E" })).toContainText("No completó");
  });

  await test.step("resultados: PDF, Excel y pesajes bloqueados", async () => {
    const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "PDF" }).click()]);
    expect(pdf.suggestedFilename()).toBe("resultados-reto-e2e.pdf");
    expect((await readFile((await pdf.path())!)).subarray(0, 5).toString()).toBe("%PDF-");
    const [xlsx] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Excel" }).click()]);
    expect(xlsx.suggestedFilename()).toBe("reto-reto-e2e.xlsx");
    await page.screenshot({ path: "test-results/eventos-6-resultados.png", fullPage: true });

    await page.getByRole("link", { name: "Pesajes" }).click();
    await expect(page.getByText("El reto está finalizado: los pesajes quedaron bloqueados.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Corregir" })).toHaveCount(0);
  });

  await test.step("en el celular y en modo oscuro", async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.getByRole("link", { name: "Resultados" }).click();
    await expect(page.getByRole("list", { name: "Podio" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/eventos-7-celular-oscuro.png", fullPage: true });
  });
});

test("un cajero no entra al módulo Eventos ni por URL ni por el API", async ({ page }) => {
  await ingresarCajero(page);
  for (const ruta of ["/admin/eventos", "/admin/eventos/reto-transformacion", "/admin/eventos/reto-transformacion/1"]) {
    await page.goto(ruta);
    await expect(page).toHaveURL(/\/cajero\//);
  }
  expect((await page.request.get("/api/admin/eventos/1/excel")).status()).toBe(403);
  await expect(page.getByRole("link", { name: "Eventos" })).toHaveCount(0);
});
