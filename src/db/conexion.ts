/**
 * Crea la conexión a la base de datos según DATABASE_URL:
 * - postgresql://...  → Neon (Pool por WebSocket; soporta transacciones interactivas).
 * - pglite:<carpeta>  → PGlite: PostgreSQL local embebido, solo para desarrollo sin Neon.
 *   PGlite no admite dos procesos a la vez: detener `npm run dev` antes de migrar o hacer seed.
 *
 * Sin "server-only" porque también lo usan los scripts de migración y seed.
 */
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

export type Db = NeonDatabase<typeof schema>;
export type TipoConexion = "neon" | "pglite";
export type Conexion = { db: Db; tipo: TipoConexion; cerrar: () => Promise<void> };

export async function crearConexion(url = process.env.DATABASE_URL): Promise<Conexion> {
  if (!url) {
    throw new Error("Falta DATABASE_URL. Copia .env.example a .env.local y complétala.");
  }

  if (url.startsWith("pglite:")) {
    if (process.env.NODE_ENV === "production" && process.env.VERCEL) {
      throw new Error("PGlite es solo para desarrollo local; en Vercel usa la URL de Neon.");
    }
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    // Al compilar (`next build`) no se consulta la BD: se usa una en memoria para no tocar
    // la carpeta que puede estar usando `npm run dev` (PGlite no admite dos procesos).
    const carpeta = url.slice("pglite:".length).replace(/^\/\//, "") || "./.pglite";
    const cliente = new PGlite(process.env.NEXT_PHASE === "phase-production-build" ? undefined : carpeta);
    // Mismo dialecto y misma API de consultas que Neon; el tipo se unifica para el resto del código.
    const db = drizzle({ client: cliente, schema }) as unknown as Db;
    return { db, tipo: "pglite", cerrar: () => cliente.close() };
  }

  const { Pool } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-serverless");
  const pool = new Pool({ connectionString: url });
  return { db: drizzle({ client: pool, schema }), tipo: "neon", cerrar: () => pool.end() };
}
