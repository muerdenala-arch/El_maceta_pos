import "server-only";
import { and, or, sql, type SQL } from "drizzle-orm";
import { palabrasDe } from "./busqueda";

// Mismas reglas que `coincide()` pero en PostgreSQL (listas paginadas): sin `unaccent`, que no está en todas las bases.
const CON_TILDE = "áàäâãéèëêíìïîóòöôõúùüûñç";
const SIN_TILDE = "aaaaaeeeeiiiiooooouuuunc";

const plano = (columna: SQL | { getSQL(): SQL }) => sql`translate(lower(coalesce(${columna}::text, '')), ${CON_TILDE}, ${SIN_TILDE})`;

/**
 * Condición SQL: cada palabra de la consulta aparece en alguna de las columnas (sin mayúsculas ni tildes).
 * Devuelve `undefined` si la consulta está vacía.
 */
export function condicionBusqueda(consulta: string | undefined | null, columnas: (SQL | { getSQL(): SQL })[]): SQL | undefined {
  const palabras = palabrasDe(consulta ?? "").slice(0, 8);
  if (palabras.length === 0) return undefined;
  return and(
    ...palabras.map((p) => {
      const patron = `%${p.replace(/[%_\\]/g, "\\$&")}%`;
      return or(...columnas.map((c) => sql`${plano(c)} like ${patron}`));
    }),
  );
}
