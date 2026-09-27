/**
 * Aplica las migraciones de src/db/migraciones (Neon o PGlite según DATABASE_URL).
 * Ejecutar con: npm run db:migrate
 */
import { cargarEntornoScript, destino } from "./entorno-script";
const archivoEntorno = cargarEntornoScript();

import { crearConexion } from "./conexion";

async function main() {
  // Para Neon, las migraciones van por la conexión directa (sin -pooler): la indicada o la misma sin "-pooler".
  const url = process.env.DATABASE_URL?.startsWith("pglite:")
    ? process.env.DATABASE_URL
    : process.env.DATABASE_URL_DIRECTA || process.env.DATABASE_URL?.replace("-pooler.", ".");
  console.log(`Migrando ${destino(url)} (variables de ${archivoEntorno})`);
  const { db, tipo, cerrar } = await crearConexion(url);
  const carpeta = { migrationsFolder: "./src/db/migraciones" };

  if (tipo === "pglite") {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db as never, carpeta);
  } else {
    const { migrate } = await import("drizzle-orm/neon-serverless/migrator");
    await migrate(db, carpeta);
  }

  console.log(`Migraciones aplicadas (${tipo}).`);
  await cerrar();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
