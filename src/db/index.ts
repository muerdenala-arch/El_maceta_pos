import "server-only";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

/**
 * Cliente de Neon con pooling (WebSocket) — soporta transacciones interactivas,
 * necesarias para que una venta descuente stock y registre el pago de forma atómica.
 * Usar la URL "pooled" de Neon (host con -pooler) en DATABASE_URL.
 */
const globalParaDb = globalThis as unknown as { pool?: Pool };

function crearPool() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Falta DATABASE_URL. Copia .env.example a .env.local y completa la URL de Neon.");
  }
  return new Pool({ connectionString: url });
}

const pool = globalParaDb.pool ?? crearPool();
if (process.env.NODE_ENV !== "production") globalParaDb.pool = pool;

export const db = drizzle({ client: pool, schema });
export type Db = typeof db;
