import { expect, test } from "@playwright/test";
import { ADMIN, CAJERO, ingresarAdmin, ingresarCajero } from "./ayudas";

/**
 * Botón atrás por niveles: las pestañas, filtros y saltos entre apartados del menú no suman pasos;
 * atrás sube de nivel (reto → lista → Eventos → Inicio) en vez de repetir todo el recorrido.
 */
test.skip(!ADMIN.pin || !CAJERO.pin, "Faltan SEED_* en .env.local");

/** Enlace del menú lateral (su nombre puede llevar el número de alertas: "Inventario de sucursales 1 alertas"). */
const menu = (page: import("@playwright/test").Page, nombre: string) =>
  page.locator("aside nav").getByRole("link", { name: new RegExp(`^${nombre}`) }).first();

test("admin: atrás sube de nivel y no repite pestañas, filtros ni apartados", async ({ page }) => {
  await ingresarAdmin(page);

  // Salta entre varios apartados del menú y usa pestañas y filtros.
  await menu(page, "Catálogo").click();
  await expect(page).toHaveURL(/\/admin\/catalogo/);
  await menu(page, "Inventario de sucursales").click();
  await expect(page).toHaveURL(/\/admin\/inventario/);
  await menu(page, "Reportes de venta").click();
  await expect(page).toHaveURL(/\/admin\/reportes/);
  await page.getByRole("button", { name: "Este mes" }).click();
  await expect(page).toHaveURL(/desde=/);
  await page.getByRole("link", { name: "Productos" }).click();
  await expect(page).toHaveURL(/vista=productos/);
  await page.getByRole("link", { name: "Por día" }).click();
  await expect(page).toHaveURL(/vista=dias/);

  // Un solo atrás: vuelve al Inicio (no a "Productos", "Este mes", Inventario ni Catálogo).
  await page.goBack();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);

  // Niveles dentro de Eventos: Inicio → Eventos → Reto Transformación → un reto (+ pestañas).
  await menu(page, "Eventos").click();
  await page.getByRole("link", { name: /Reto Transformación/ }).click();
  await page.getByRole("button", { name: "Nuevo reto" }).click();
  await page.getByRole("dialog").getByLabel("Nombre").fill("Reto navegación");
  await page.getByRole("dialog").getByRole("button", { name: "Crear reto" }).click();
  await expect(page).toHaveURL(/\/admin\/eventos\/reto-transformacion\/\d+$/);
  await page.getByRole("link", { name: "Pesajes" }).click();
  await page.getByRole("link", { name: "Tabla de posiciones" }).click();
  await expect(page).toHaveURL(/vista=posiciones/);

  await page.goBack();
  await expect(page).toHaveURL(/\/admin\/eventos\/reto-transformacion$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/admin\/eventos$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
});

test("cajero: desde cualquier apartado, atrás vuelve a la venta", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await ingresarCajero(page);
  const barra = page.locator("nav").last();
  await barra.getByRole("link", { name: "Bodega" }).click();
  await expect(page).toHaveURL(/\/cajero\/bodega/);
  await barra.getByRole("link", { name: "Gastos" }).click();
  await expect(page).toHaveURL(/\/cajero\/gastos/);
  await barra.getByRole("link", { name: "Cierre de caja" }).click();
  await expect(page).toHaveURL(/\/cajero\/cierre/);
  await page.goBack();
  await expect(page).toHaveURL(/\/cajero\/venta$/);
});
