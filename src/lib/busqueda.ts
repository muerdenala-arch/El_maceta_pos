/**
 * Búsqueda de texto común a todas las pantallas: sin distinguir mayúsculas ni tildes ("proteina" encuentra
 * "Proteína"), por palabras (todas deben aparecer en algún campo) y con los tramos a resaltar. Puro y probado.
 */

/** Minúsculas y sin tildes. */
const base = (c: string) => c.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export const normalizarBusqueda = (t: string) => base(t).replace(/\s+/g, " ").trim();

/** Palabras de la consulta, ya normalizadas. */
export const palabrasDe = (consulta: string) => normalizarBusqueda(consulta).split(" ").filter(Boolean);

/** Cada palabra de la consulta aparece en al menos uno de los campos. Consulta vacía: coincide todo. */
export function coincide(consulta: string, campos: readonly (string | number | null | undefined)[]) {
  const palabras = palabrasDe(consulta);
  if (palabras.length === 0) return true;
  const textos = campos.filter((c) => c !== null && c !== undefined && c !== "").map((c) => normalizarBusqueda(String(c)));
  return palabras.every((p) => textos.some((t) => t.includes(p)));
}

export type Tramo = { texto: string; resaltado: boolean };

/** Parte el texto original en tramos, marcando los que coinciden con alguna palabra de la consulta. */
export function tramos(texto: string, consulta: string): Tramo[] {
  const palabras = palabrasDe(consulta);
  if (!texto || palabras.length === 0) return [{ texto, resaltado: false }];

  // Texto normalizado + a qué posición del original corresponde cada carácter normalizado.
  let plano = "";
  const origen: number[] = [];
  let i = 0;
  for (const caracter of texto) {
    const b = base(caracter);
    plano += b;
    for (let j = 0; j < b.length; j++) origen.push(i); // por unidad UTF-16 (los emojis ocupan dos)
    i += caracter.length;
  }
  const fin = (k: number) => (k + 1 < origen.length ? origen[k + 1] : texto.length);

  const marcado = new Array<boolean>(texto.length).fill(false);
  for (const p of palabras) {
    for (let desde = plano.indexOf(p); desde !== -1; desde = plano.indexOf(p, desde + 1)) {
      for (let k = origen[desde]; k < fin(desde + p.length - 1); k++) marcado[k] = true;
    }
  }

  const r: Tramo[] = [];
  for (let k = 0; k < texto.length; k++) {
    const ultimo = r[r.length - 1];
    if (ultimo && ultimo.resaltado === marcado[k]) ultimo.texto += texto[k];
    else r.push({ texto: texto[k], resaltado: marcado[k] });
  }
  return r;
}
