/**
 * Variables de entorno para los scripts de base de datos (migrar, seed).
 * Por defecto lee .env.local; con `--env <archivo>` lee solo ese archivo, por ejemplo
 * `npm run db:migrate -- --env .env.produccion.local` para la base de Neon de producción.
 * Nunca imprime secretos: solo el servidor de destino, para confirmar a qué base se apunta.
 */
import { config } from "dotenv";

export function cargarEntornoScript() {
  const i = process.argv.indexOf("--env");
  const archivo = i >= 0 ? process.argv[i + 1] : ".env.local";
  if (!archivo) throw new Error("Falta el nombre del archivo después de --env");
  const r = config({ path: archivo, quiet: true, override: i >= 0 });
  if (r.error) throw new Error(`No se pudo leer ${archivo}`);
  return archivo;
}

/** "ep-xxx-pooler.sa-east-1.aws.neon.tech" o "PGlite (./.pglite)", sin usuario ni clave. */
export function destino(url: string | undefined) {
  if (!url) return "(sin DATABASE_URL)";
  if (url.startsWith("pglite:")) return `PGlite (${url.slice(7)})`;
  try {
    return new URL(url).host;
  } catch {
    return "(URL inválida)";
  }
}
