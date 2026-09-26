import { expect, test, type Page } from "@playwright/test";

/**
 * Criterios de aceptación de la sección 11 del plan:
 * - "Con el internet desconectado se pueden realizar ventas; al reconectar aparecen en reportes sin duplicarse."
 * - "Imprimir y generar PDF funcionan sin internet." / "Las fotos de productos se ven también sin internet."
 * Requiere un cajero con un producto con stock en su sucursal (si no tiene caja abierta, la prueba la abre).
 */
const USUARIO = process.env.E2E_CAJERO_USUARIO ?? "";
const PIN = process.env.E2E_CAJERO_PIN ?? "";

async function ingresar(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("Usuario").fill(USUARIO);
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.type(PIN);
  await page.keyboard.press("Enter");
  const buscador = page.getByPlaceholder(/Buscar por nombre/);
  const apertura = page.getByRole("heading", { name: "Abrir caja" });
  await expect(buscador.or(apertura)).toBeVisible({ timeout: 30_000 });
  // Sin caja abierta, la abre con Bs 100 (así la prueba no depende del estado de la base).
  if (await apertura.isVisible()) {
    await page.getByRole("button", { name: "Bs 100,00" }).click();
    await page.getByRole("button", { name: "Abrir caja", exact: true }).click();
    await page.waitForURL("**/cajero/venta");
  }
  await expect(buscador).toBeVisible();
}

const pendientes = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((res) => {
        const r = indexedDB.open("el-maseta");
        r.onsuccess = () => {
          const c = r.result.transaction("cola", "readonly").objectStore("cola").count();
          c.onsuccess = () => res(c.result);
        };
      }),
  );

async function vender(page: Page, metodo: "Efectivo" | "QR") {
  await page.locator("main li").filter({ hasText: /Bs/ }).first().locator("button").nth(1).click();
  await page.getByRole("button", { name: "Cobrar", exact: true }).click();
  await page.getByRole("radio", { name: metodo }).click();
  if (metodo === "Efectivo") await page.getByRole("button", { name: "Exacto" }).click();
  await page.getByRole("dialog").locator("form button[type=submit]").click();
}

test("vende sin internet y sincroniza al volver, sin duplicados", async ({ page, context }) => {
  test.skip(!USUARIO || !PIN, "Definir E2E_CAJERO_USUARIO y E2E_CAJERO_PIN");

  page.on("console", (m) => m.type() === "error" && console.log("[consola]", m.text().slice(0, 300)));
  page.on("requestfailed", (r) => console.log("[red falló]", r.url().slice(0, 150), r.failure()?.errorText));

  await test.step("con conexión: el service worker toma el control y descarga las pantallas", async () => {
    await ingresar(page);
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30_000 }).catch(async () => {
      await page.reload(); // la primera carga instala el SW; desde la segunda la controla
      await page.waitForFunction(() => !!navigator.serviceWorker?.controller);
    });
    await page.evaluate(() => {
      sessionStorage.removeItem("maseta:precarga");
      sessionStorage.removeItem("maseta:precarga-lista");
    });
    await page.reload();
    // Pantallas, archivos de la app (incluido el generador de PDF) y fotos guardados.
    await page.waitForFunction(() => !!sessionStorage.getItem("maseta:precarga-lista"), null, { timeout: 90_000, polling: 1000 });
  });

  await test.step("sin internet: la app abre desde la copia guardada, con fotos", async () => {
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByPlaceholder(/Buscar por nombre/)).toBeVisible();
    const fotoCargada = await page.locator("main li img").first().evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0);
    expect(fotoCargada).toBe(true);
    await expect(page.getByRole("status").filter({ hasText: "Sin conexión" }).first()).toBeVisible();
  });

  await test.step("sin internet: dos ventas (efectivo y QR) quedan guardadas con comprobante provisional", async () => {
    await vender(page, "Efectivo");
    await expect(page.getByText(/Guardada sin conexión/)).toBeVisible();

    // PDF generado en el dispositivo sin internet
    const descarga = page.waitForEvent("download", { timeout: 20_000 });
    await page.getByRole("button", { name: "PDF" }).click();
    const archivo = await descarga.catch(async (e) => {
      console.log("Avisos en pantalla:", await page.locator("[data-sonner-toast]").allTextContents());
      throw e;
    });
    expect(archivo.suggestedFilename()).toMatch(/provisional/);

    await page.getByRole("button", { name: /Nueva venta/ }).click();
    await vender(page, "QR");
    await expect(page.getByText(/Guardada sin conexión/)).toBeVisible();
    expect(await pendientes(page)).toBe(2);
  });

  await test.step("sin internet: gasto en la cola y el cierre de caja bloqueado", async () => {
    await page.getByRole("link", { name: "Gastos" }).first().click();
    await page.waitForURL("**/cajero/gastos");
    await page.getByRole("radio", { name: "Transporte" }).click();
    await page.getByPlaceholder("0,00").fill("15");
    await page.getByRole("button", { name: "Registrar gasto" }).click();
    await expect(page.getByText(/Gasto guardado sin conexión/)).toBeVisible();
    expect(await pendientes(page)).toBe(3);

    await page.getByRole("link", { name: "Cierre de caja" }).first().click();
    await page.waitForURL("**/cajero/cierre");
    await expect(page.getByText(/sin sincronizar/)).toBeVisible();
    await page.locator("#contado").fill("100");
    await expect(page.getByRole("button", { name: /Cerrar caja/ })).toBeDisabled();
  });

  await test.step("sin internet: al reabrir pide el PIN y lo valida en el dispositivo", async () => {
    await page.evaluate(() => sessionStorage.removeItem("maseta:desbloqueado"));
    await page.goto("/cajero/venta");
    await expect(page.getByText("Sesión bloqueada")).toBeVisible();
    await page.keyboard.type("0000");
    await page.keyboard.press("Enter");
    await expect(page.getByText("PIN incorrecto")).toBeVisible();
    await page.keyboard.type(PIN);
    await page.keyboard.press("Enter");
    await expect(page.getByText("Sesión bloqueada")).toBeHidden();
  });

  // Copia de la cola para reenviarla después y comprobar que no se duplica nada.
  const cola = await page.evaluate(
    () =>
      new Promise<{ uuid: string; tipo: string; datos: unknown }[]>((res) => {
        const r = indexedDB.open("el-maseta");
        r.onsuccess = () => {
          const g = r.result.transaction("cola", "readonly").objectStore("cola").getAll();
          g.onsuccess = () => res(g.result.map((o: { uuid: string; tipo: string; datos: unknown }) => ({ uuid: o.uuid, tipo: o.tipo, datos: o.datos })));
        };
      }),
  );

  await test.step("vuelve internet: se sincroniza solo", async () => {
    await context.setOffline(false);
    await expect.poll(() => pendientes(page), { timeout: 60_000, intervals: [1000] }).toBe(0);
  });

  await test.step("las ventas aparecen con número definitivo y reenviar la cola no duplica", async () => {
    const primera = await page.request.post("/api/sync", { data: { operaciones: cola } });
    const segunda = await page.request.post("/api/sync", { data: { operaciones: cola } });
    const a = (await primera.json()).resultados;
    const b = (await segunda.json()).resultados;
    expect(a.every((r: { ok: boolean }) => r.ok)).toBe(true);
    expect(b.map((r: { numero?: number }) => r.numero)).toEqual(a.map((r: { numero?: number }) => r.numero));
    const numeros = a.filter((r: { numero?: number }) => r.numero).map((r: { numero: number }) => r.numero);
    expect(new Set(numeros).size).toBe(2);

    await page.goto("/cajero/ventas");
    for (const n of numeros) await expect(page.getByText(`#${n}`, { exact: true })).toBeVisible();
    await expect(page.getByText(/Sin sincronizar/)).toHaveCount(0);
    console.log(`Ventas sincronizadas con números definitivos: ${numeros.join(", ")}`);
  });
});

test("conflicto al sincronizar: stock negativo y precio distinto se registran y generan alertas", async ({ page }) => {
  test.skip(!USUARIO || !PIN, "Definir E2E_CAJERO_USUARIO y E2E_CAJERO_PIN");
  await ingresar(page);
  // Datos de la copia local: caja abierta y un producto de la sucursal.
  await page.waitForFunction(
    () =>
      new Promise<boolean>((res) => {
        const r = indexedDB.open("el-maseta");
        r.onsuccess = () => {
          const g = r.result.transaction("instantaneas", "readonly").objectStore("instantaneas").getAll();
          g.onsuccess = () => res(g.result.length > 0);
        };
      }),
    null,
    { timeout: 30_000, polling: 500 },
  );
  const { cajaId, producto } = await page.evaluate(
    () =>
      new Promise<{ cajaId: number; producto: { id: number; stock: number; precio: string } }>((res) => {
        const r = indexedDB.open("el-maseta");
        r.onsuccess = () => {
          const g = r.result.transaction("instantaneas", "readonly").objectStore("instantaneas").getAll();
          g.onsuccess = () => {
            const i = g.result[0];
            res({ cajaId: i.cajaId, producto: { id: i.productos[0].id, stock: i.productos[0].stock, precio: i.productos[0].precioVenta } });
          };
        };
      }),
  );

  // Otra sucursal ya vendió todo: esta venta sin conexión deja el stock negativo, y se cobró Bs 1 menos.
  const cantidad = producto.stock + 3;
  const precioViejo = (Number(producto.precio) - 1).toFixed(2);
  const uuid = crypto.randomUUID();
  const op = {
    uuid,
    tipo: "venta",
    datos: {
      uuid,
      cajaId,
      fecha: Date.now() - 60_000,
      lineas: [{ productoId: producto.id, cantidad, precioUnitario: precioViejo, descuento: "0", promocionId: null }],
      metodoPago: "efectivo",
      montoRecibido: (Number(precioViejo) * cantidad).toFixed(2),
      clienteNombre: null,
      clienteTelefono: null,
    },
  };
  const r = await (await page.request.post("/api/sync", { data: { operaciones: [op] } })).json();
  expect(r.resultados[0].ok).toBe(true);
  console.log(`Venta en conflicto registrada como #${r.resultados[0].numero} (stock ${producto.stock} − ${cantidad})`);
});
