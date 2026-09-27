/**
 * Base de datos de las pruebas de punta a punta (.pglite-e2e), creada desde cero en cada corrida:
 * nunca se prueba sobre datos reales (sección 10 del plan) y el resultado no depende de corridas anteriores.
 * Usuario y PIN de prueba: SEED_ADMIN_* y SEED_CAJERO_* de .env.local (nunca en el código).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { migrate } from "drizzle-orm/pglite/migrator";
import { crearConexion } from "../src/db/conexion";
import * as s from "../src/db/schema";

export const CARPETA_E2E = "./.pglite-e2e";

/** PNG de 1×1 (foto de producto para comprobar que se ve sin internet). */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function main() {
  const faltan = ["SEED_ADMIN_USUARIO", "SEED_ADMIN_PIN", "SEED_CAJERO_USUARIO", "SEED_CAJERO_PIN"].filter((k) => !process.env[k]);
  if (faltan.length) throw new Error(`Faltan en .env.local: ${faltan.join(", ")}`);

  await rm(CARPETA_E2E, { recursive: true, force: true });
  const { db, cerrar } = await crearConexion(`pglite:${CARPETA_E2E}`);
  await migrate(db as never, { migrationsFolder: "./src/db/migraciones" });

  await db.insert(s.configuracion).values({ id: 1 });
  const [bodega] = await db.insert(s.sucursales).values({ nombre: "Bodega central", tipo: "bodega" }).returning();
  const [principal] = await db.insert(s.sucursales).values({ nombre: "Sucursal principal", tipo: "sucursal" }).returning();

  const usuario = async (nombre: string, u: string, pin: string, rol: "admin" | "cajero", sucursalId: number | null) =>
    (await db.insert(s.usuarios).values({ nombre, usuario: u.trim().toLowerCase(), pinHash: await bcrypt.hash(pin, 10), rol, sucursalId }).returning())[0];
  const admin = await usuario("Administrador", process.env.SEED_ADMIN_USUARIO!, process.env.SEED_ADMIN_PIN!, "admin", null);
  await usuario("Cajero de prueba", process.env.SEED_CAJERO_USUARIO!, process.env.SEED_CAJERO_PIN!, "cajero", principal.id);

  const imagen = async (carpeta: "productos" | "qr") => {
    const nombre = `${randomUUID()}.png`;
    await mkdir(path.join(".subidas", carpeta), { recursive: true });
    await writeFile(path.join(".subidas", carpeta, nombre), PNG);
    return `/api/archivos/${carpeta}/${nombre}`;
  };
  // QR de cobro: sin uno activo el punto de venta no permite cobrar por QR.
  await db.insert(s.qrPagos).values({ nombre: "QR de prueba", imagenUrl: await imagen("qr"), sucursalId: null });

  const [categoria] = await db.insert(s.categorias).values({ nombre: "Proteínas" }).returning();
  const [whey] = await db
    .insert(s.productos)
    .values({
      nombre: "Whey E2E",
      marca: "Marca E2E",
      sabor: "Chocolate",
      categoriaId: categoria.id,
      precioVenta: "350.00",
      precioCosto: "280.00",
      stockMinimo: 3,
      fotoUrl: await imagen("productos"),
    })
    .returning();
  // Stock por debajo del mínimo desde el inicio: genera una alerta de "stock bajo".
  const [creatina] = await db
    .insert(s.productos)
    .values({ nombre: "Creatina E2E", categoriaId: categoria.id, precioVenta: "120.00", precioCosto: "80.00", stockMinimo: 5 })
    .returning();

  for (const [p, ubicacion, cantidad] of [
    [whey.id, principal.id, 60],
    [creatina.id, principal.id, 2],
    [whey.id, bodega.id, 100],
  ]) {
    await db.insert(s.inventario).values({ productoId: p, ubicacionId: ubicacion, cantidad });
    await db.insert(s.lotes).values({ productoId: p, ubicacionId: ubicacion, cantidad, fechaVencimiento: null });
    await db.insert(s.movimientosInventario).values({ tipo: "ingreso", productoId: p, ubicacionId: ubicacion, cantidad, usuarioId: admin.id, motivo: "Inicial e2e" });
  }

  await cerrar();
  console.log(`Base e2e lista en ${CARPETA_E2E}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
