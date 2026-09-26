import "server-only";
import { crearConexion, type Conexion } from "./conexion";

/**
 * Una sola conexión por proceso (globalThis), también entre recargas en desarrollo.
 * Con Neon, usar la URL "pooled" (host con -pooler) en DATABASE_URL.
 */
const global = globalThis as unknown as { conexionMaseta?: Promise<Conexion> };
global.conexionMaseta ??= crearConexion();

export const db = (await global.conexionMaseta).db;
export type { Db } from "./conexion";
