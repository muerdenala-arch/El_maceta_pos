/**
 * Verificación local del PIN para desbloquear sin conexión (sección 8 del plan: "el PIN puede validarse
 * localmente contra una copia cifrada"). Se guarda un PBKDF2-SHA256 con sal aleatoria, nunca el PIN.
 * Tras 5 fallos seguidos se exige conexión (el servidor aplica su propio límite al volver).
 */
import { baseLocal } from "./base";

const ITERACIONES = 210_000;
export const MAX_INTENTOS_LOCALES = 5;

const aHex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const deHex = (h: string) => new Uint8Array(h.match(/../g)!.map((x) => parseInt(x, 16)));

async function derivar(pin: string, sal: Uint8Array, iteraciones: number) {
  const clave = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal as BufferSource, iterations: iteraciones }, clave, 256);
  return aHex(bits);
}

/** Tras un ingreso o desbloqueo correcto con conexión: guarda (o renueva) el verificador. */
export async function guardarCredencialLocal(usuario: string, usuarioId: number, pin: string) {
  try {
    const sal = crypto.getRandomValues(new Uint8Array(16));
    await baseLocal().credenciales.put({
      usuario: usuario.toLowerCase(),
      usuarioId,
      sal: aHex(sal),
      hash: await derivar(pin, sal, ITERACIONES),
      iteraciones: ITERACIONES,
      intentosFallidos: 0,
    });
  } catch {
    // Sin IndexedDB o sin WebCrypto (http no seguro): no habrá desbloqueo sin conexión.
  }
}

/**
 * ¿Este PIN es el guardado en el dispositivo? No cuenta intentos: lo usa la pantalla de PIN para saber, mientras se
 * escribe, cuándo el PIN ya está completo. null = no hay verificador guardado para ese usuario.
 */
export async function coincidePinLocal(usuario: string, pin: string): Promise<boolean | null> {
  try {
    const c = await baseLocal().credenciales.get(usuario.toLowerCase());
    if (!c) return null;
    return (await derivar(pin, deHex(c.sal), c.iteraciones)) === c.hash;
  } catch {
    return null;
  }
}

export type ResultadoPinLocal = "ok" | "incorrecto" | "bloqueado" | "sin-credencial";

export async function verificarPinLocal(usuario: string, pin: string): Promise<ResultadoPinLocal> {
  const tabla = baseLocal().credenciales;
  const c = await tabla.get(usuario.toLowerCase());
  if (!c) return "sin-credencial";
  if (c.intentosFallidos >= MAX_INTENTOS_LOCALES) return "bloqueado";
  const hash = await derivar(pin, deHex(c.sal), c.iteraciones);
  // Comparación de largo fijo (ambos son hex de 64 caracteres).
  let diferencia = 0;
  for (let i = 0; i < hash.length; i++) diferencia |= hash.charCodeAt(i) ^ c.hash.charCodeAt(i);
  if (diferencia === 0) {
    if (c.intentosFallidos) await tabla.update(c.usuario, { intentosFallidos: 0 });
    return "ok";
  }
  const intentos = c.intentosFallidos + 1;
  await tabla.update(c.usuario, { intentosFallidos: intentos });
  return intentos >= MAX_INTENTOS_LOCALES ? "bloqueado" : "incorrecto";
}
