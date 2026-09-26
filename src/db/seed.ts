/**
 * Datos iniciales: bodega central, una sucursal, administrador, configuración y categorías.
 * Opcional (desarrollo): un cajero de prueba si SEED_CAJERO_PIN está definido.
 * Ejecutar con: npm run db:seed  (es idempotente: se puede correr varias veces).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { crearConexion, type Db } from "./conexion";
import * as schema from "./schema";

const PIN_VALIDO = /^\d{4,6}$/;

async function crearUsuarioSiNoExiste(
  db: Db,
  datos: { nombre: string; usuario: string; pin: string; rol: "admin" | "cajero"; sucursalId?: number },
) {
  const usuario = datos.usuario.trim().toLowerCase();
  const [existe] = await db
    .select({ id: schema.usuarios.id })
    .from(schema.usuarios)
    .where(eq(schema.usuarios.usuario, usuario));
  if (existe) return;
  await db.insert(schema.usuarios).values({
    nombre: datos.nombre,
    usuario,
    rol: datos.rol,
    sucursalId: datos.sucursalId,
    pinHash: await bcrypt.hash(datos.pin, 10),
  });
  console.log(`Usuario "${usuario}" (${datos.rol}) creado.`);
}

async function main() {
  const pinAdmin = process.env.SEED_ADMIN_PIN;
  if (!pinAdmin || !PIN_VALIDO.test(pinAdmin)) {
    throw new Error("SEED_ADMIN_PIN debe tener de 4 a 6 dígitos (en .env.local)");
  }
  const { db, cerrar } = await crearConexion();

  await db.insert(schema.configuracion).values({ id: 1 }).onConflictDoNothing();

  const existentes = await db.select().from(schema.sucursales);
  if (!existentes.some((s) => s.tipo === "bodega")) {
    await db.insert(schema.sucursales).values({ nombre: "Bodega central", tipo: "bodega" });
  }
  let principal = existentes.find((s) => s.tipo === "sucursal");
  if (!principal) {
    [principal] = await db
      .insert(schema.sucursales)
      .values({ nombre: "Sucursal principal", tipo: "sucursal" })
      .returning();
  }

  await crearUsuarioSiNoExiste(db, {
    nombre: "Administrador",
    usuario: process.env.SEED_ADMIN_USUARIO || "admin",
    pin: pinAdmin,
    rol: "admin",
  });

  const pinCajero = process.env.SEED_CAJERO_PIN;
  if (pinCajero) {
    if (!PIN_VALIDO.test(pinCajero)) throw new Error("SEED_CAJERO_PIN debe tener de 4 a 6 dígitos");
    await crearUsuarioSiNoExiste(db, {
      nombre: "Cajero de prueba",
      usuario: process.env.SEED_CAJERO_USUARIO || "cajero",
      pin: pinCajero,
      rol: "cajero",
      sucursalId: principal.id,
    });
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
  await cerrar();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
