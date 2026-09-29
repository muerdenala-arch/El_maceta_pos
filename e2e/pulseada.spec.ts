import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { ADMIN, CAJERO, ingresarAdmin, ingresarCajero } from "./ayudas";

/**
 * Torneo de Pulseada en el navegador: crear (eliminación directa, al mejor de 3), inscribir 4, sortear,
 * mesa del juez (2 faltas = asalto al rival, deshacer), W.O., llaves, finalizar, PDF/Excel y página pública.
 * Capturas en test-results/pulseada-*.png (escritorio, celular y modo oscuro).
 */
test.describe.configure({ mode: "serial" });
test.skip(!ADMIN.pin || !CAJERO.pin, "Faltan SEED_* en .env.local");

const sufijo = String(Date.now()).slice(-6);

async function inscribir(page: Page, nombre: string, ci: string, peso = "") {
  await page.getByRole("button", { name: "Inscribir competidor" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Nombre completo").fill(nombre);
  await d.getByLabel("Cédula de identidad").fill(ci);
  await d.getByLabel("Celular").fill(`7${ci.slice(-7).padStart(7, "1")}`);
  if (peso) await d.getByLabel(/Peso/).fill(peso);
  await d.getByRole("checkbox").check();
  await d.getByRole("button", { name: "Inscribir", exact: true }).click();
  await expect(d).toBeHidden();
}

/** Abre la primera mesa lista para jugar. */
async function abrirMesa(page: Page) {
  await page.getByRole("button", { name: /Abrir mesa/ }).first().click();
  return page.getByRole("dialog");
}

/** Gana el competidor de la izquierda 2–0. */
async function ganaIzquierda(page: Page) {
  const d = await abrirMesa(page);
  const mas = d.getByRole("button", { name: "+1 asalto" }).first();
  await mas.click();
  await mas.click();
  await d.getByRole("button", { name: "Confirmar resultado" }).click();
  await expect(d).toBeHidden();
}

test("el administrador arma un torneo de pulseada de punta a punta", async ({ page }) => {
  await ingresarAdmin(page);

  await test.step("catálogo → nuevo torneo", async () => {
    await page.getByRole("link", { name: "Eventos" }).first().click();
    await page.getByRole("link", { name: /Torneo de Pulseada/ }).click();
    await page.getByRole("button", { name: "Nuevo torneo" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Nombre").fill(`Pulseada E2E ${sufijo}`);
    await expect(d.getByRole("radio", { name: /Eliminación directa/ })).toBeChecked();
    await d.getByRole("radio", { name: /Todos contra todos/ }).check();
    await expect(d.getByRole("spinbutton", { name: "Puntos por victoria" })).toBeVisible();
    await d.getByRole("radio", { name: /Eliminación directa/ }).check();
    await page.screenshot({ path: "test-results/pulseada-1-nuevo.png" });
    await d.getByRole("button", { name: "Crear torneo" }).click();
    await expect(page.getByRole("heading", { name: new RegExp(`Pulseada E2E ${sufijo}`) })).toBeVisible();
  });

  await test.step("inscripción (peso opcional)", async () => {
    await inscribir(page, "Tito Brazo", `81${sufijo}`, "82,5");
    await inscribir(page, "Lalo Fuerte", `82${sufijo}`);
    await inscribir(page, "Rene Roca", `83${sufijo}`);
    await inscribir(page, "Juan Mano", `84${sufijo}`);
    await expect(page.getByText(/82,50 kg/)).toBeVisible();
    await page.screenshot({ path: "test-results/pulseada-2-competidores.png" });
  });

  await test.step("sortear y volver a sortear", async () => {
    await page.getByRole("button", { name: "Sortear llaves" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Sí, sortear" }).click();
    await expect(page.getByText("En curso").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Inscribir competidor" })).toHaveCount(0);
    await page.getByRole("button", { name: "Volver a sortear" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Sí, sortear" }).click();
    await page.getByRole("link", { name: "Combates" }).click();
    await expect(page.getByRole("button", { name: /Abrir mesa/ })).toHaveCount(2);
  });

  await test.step("mesa: 2 faltas le dan el asalto al rival; deshacer; gana 2–1", async () => {
    const d = await abrirMesa(page);
    await expect(d.getByText(/Al mejor de 3/)).toBeVisible();
    const asaltos = d.locator('[aria-label^="Asaltos de"]');
    const falta = d.getByRole("button", { name: "Falta", exact: true }).first();
    await falta.click();
    await expect(asaltos.nth(1)).toHaveText("0");
    await falta.click();
    await expect(asaltos.nth(1)).toHaveText("1"); // segunda falta: asalto para el rival
    await d.getByRole("button", { name: "Deshacer" }).click();
    await expect(asaltos.nth(1)).toHaveText("0");
    await falta.click();
    const mas = d.getByRole("button", { name: "+1 asalto" }).first();
    await mas.click();
    await expect(d.getByRole("button", { name: "Confirmar resultado" })).toHaveCount(0);
    await mas.click();
    await expect(d.getByRole("status")).toContainText("(2–1)");
    await page.screenshot({ path: "test-results/pulseada-3-mesa.png" });
    await d.getByRole("button", { name: "Confirmar resultado" }).click();
    await expect(d).toBeHidden();
    await expect(page.getByText("Faltas 2 – 0")).toBeVisible();
  });

  await test.step("W.O.: el de la derecha no se presentó", async () => {
    const d = await abrirMesa(page);
    await d.getByRole("button", { name: "No se presentó" }).click();
    await d.getByRole("button", { name: /^No vino/ }).nth(1).click();
    await expect(d).toBeHidden();
    await expect(page.getByText("W.O.").first()).toBeVisible();
  });

  await test.step("final y 3.er lugar; llaves", async () => {
    await expect(page.getByRole("button", { name: /Abrir mesa/ })).toHaveCount(2);
    await ganaIzquierda(page);
    await ganaIzquierda(page);
    await page.getByRole("link", { name: "Llaves" }).click();
    await expect(page.getByText("Por el 3.er lugar")).toBeVisible();
    await page.screenshot({ path: "test-results/pulseada-4-llaves.png", fullPage: true });
  });

  await test.step("finalizar, resultados, PDF y Excel", async () => {
    await page.getByRole("button", { name: "Finalizar torneo" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Sí, finalizar" }).click();
    await expect(page.getByRole("heading", { name: "Resultados finales" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Podio" })).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(4);

    const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "PDF" }).click()]);
    expect(pdf.suggestedFilename()).toBe(`resultados-pulseada-e2e-${sufijo}.pdf`);
    expect((await readFile((await pdf.path())!)).subarray(0, 5).toString()).toBe("%PDF-");
    const [xlsx] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Excel" }).click()]);
    expect(xlsx.suggestedFilename()).toBe(`torneo-pulseada-e2e-${sufijo}.xlsx`);
    await page.screenshot({ path: "test-results/pulseada-5-resultados.png", fullPage: true });

    await page.getByRole("link", { name: "Combates" }).click();
    await expect(page.getByRole("button", { name: "Corregir" })).toHaveCount(0);
  });

  await test.step("página pública del enlace de WhatsApp: sin cédula ni teléfono", async () => {
    await page.getByRole("link", { name: "Resultados" }).click();
    await page.evaluate(() => {
      window.open = ((url: string) => {
        (window as unknown as { abierto: string }).abierto = url;
        return null;
      }) as typeof window.open;
    });
    await page.getByRole("button", { name: "Compartir por WhatsApp" }).click();
    await page.getByLabel("O enviar el enlace a un celular").fill("71234567");
    await page.getByRole("button", { name: "Abrir WhatsApp con el enlace" }).click();
    const wa = await page.evaluate(() => (window as unknown as { abierto: string }).abierto);
    const enlace = decodeURIComponent(new URL(wa).searchParams.get("text")!).match(/https?:\/\/\S+\/eventos\/[\w-]+/)![0];

    const publica = await page.context().newPage();
    await publica.goto(enlace);
    await expect(publica.getByRole("heading", { name: "Resultados finales" })).toBeVisible();
    await expect(publica.getByText("Por el 3.er lugar")).toBeVisible();
    const texto = await publica.locator("body").innerText();
    expect(texto).toContain("Tito Brazo");
    expect(texto).not.toContain(`81${sufijo}`);
    expect(texto).not.toMatch(/Cédula|Celular/);
    await publica.close();
  });

  await test.step("en el celular y en modo oscuro", async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.reload();
    await expect(page.getByRole("list", { name: "Podio" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/pulseada-6-celular-oscuro.png", fullPage: true });
    await page.getByRole("link", { name: "Llaves" }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/pulseada-7-llaves-celular.png", fullPage: true });
  });
});

test("un cajero no entra al torneo ni por URL ni por el API", async ({ page }) => {
  await ingresarCajero(page);
  for (const ruta of ["/admin/eventos/torneo-pulseada", "/admin/eventos/torneo-pulseada/1"]) {
    await page.goto(ruta);
    await expect(page).toHaveURL(/\/cajero\//);
  }
  expect((await page.request.get("/api/admin/eventos/1/excel")).status()).toBe(403);
});
