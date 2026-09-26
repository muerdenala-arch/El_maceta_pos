/**
 * Aritmética de dinero exacta en centavos (bigint). PostgreSQL devuelve NUMERIC como string
 * ("123.45"); nunca sumar/restar esos valores como `number` flotante.
 */

export function aCentavos(monto: string | number): bigint {
  const texto = typeof monto === "number" ? monto.toFixed(2) : monto.trim();
  const coincide = /^(-)?(\d+)(?:\.(\d{1,2})\d*)?$/.exec(texto);
  if (!coincide) throw new Error(`Monto inválido: "${monto}"`);
  const [, signo, enteros, decimales = ""] = coincide;
  const centavos = BigInt(enteros) * 100n + BigInt(decimales.padEnd(2, "0"));
  return signo ? -centavos : centavos;
}

/** Centavos → "123.45" (formato de NUMERIC, listo para guardar en la BD). */
export function deCentavos(centavos: bigint): string {
  const negativo = centavos < 0n;
  const abs = negativo ? -centavos : centavos;
  const texto = `${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
  return negativo ? `-${texto}` : texto;
}

export function sumar(...montos: (string | number)[]): string {
  return deCentavos(montos.reduce<bigint>((total, m) => total + aCentavos(m), 0n));
}

export function restar(a: string | number, b: string | number): string {
  return deCentavos(aCentavos(a) - aCentavos(b));
}
