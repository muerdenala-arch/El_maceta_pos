/**
 * Datos iniciales: bodega central, una sucursal, administrador, configuración y categorías.
 * Ejecutar con: npm run db:seed  (es idempotente: se puede correr varias veces).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { Pool } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

async function main() {
  const url = process.env.DATABASE_URL;
  const usuarioAdmin = process.env.SEED_ADMIN_USUARIO || "admin";
  const pinAdmin = process.env.SEED_ADMIN_PIN;
  if (!url) throw new Error("Falta DATABASE_URL en .env.local");
  if (!pinAdmin || !/^\d{4,6}$/.test(pinAdmin)) {
    throw new Error("SEED_ADMIN_PIN debe tener de 4 a 6 dígitos (en .env.local)");
  }

  const pool = new Pool({ connectionString: url });
  const db = drizzle({ client: pool, schema });

  await db.insert(schema.configuracion).values({ id: 1 }).onConflictDoNothing();

  const existentes = await db.select().from(schema.sucursales);
  if (!existentes.some((s) => s.tipo === "bodega")) {
    await db.insert(schema.sucursales).values({ nombre: "Bodega central", tipo: "bodega" });
  }
  if (!existentes.some((s) => s.tipo === "sucursal")) {
    await db.insert(schema.sucursales).values({ nombre: "Sucursal principal", tipo: "sucursal" });
  }

  const [yaExiste] = await db
    .select({ id: schema.usuarios.id })
    .from(schema.usuarios)
    .where(eq(schema.usuarios.usuario, usuarioAdmin));
  if (!yaExiste) {
    await db.insert(schema.usuarios).values({
      nombre: "Administrador",
      usuario: usuarioAdmin,
      rol: "admin",
      pinHash: await bcrypt.hash(pinAdmin, 10),
    });
    console.log(`Administrador "${usuarioAdmin}" creado.`);
  }

  await db
    .insert(schema.categorias)
    .values(
      ["Proteínas", "Creatinas", "Pre-entrenos", "Aminoácidos", "Quemadores", "Vitaminas", "Accesorios"].map(
        (nombre) => ({ nombre }),
      ),
    )
    .onConflictDoNothing();

  console.log("Seed completado.");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
