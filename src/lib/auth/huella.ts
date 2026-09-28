import "server-only";
import { createHash, createHmac } from "node:crypto";

/**
 * Huella del PIN para entrar solo con el PIN: HMAC-SHA256 con una clave del servidor (PIN_SECRETO o, si no
 * existe, JWT_SECRET). Permite encontrar al usuario con una sola consulta (el hash bcrypt no se puede buscar)
 * y que dos usuarios no tengan el mismo PIN. Lleva delante la versión de la clave: si la clave cambia, las
 * huellas viejas se reconocen como desactualizadas y se recalculan al ingresar (ver buscarUsuarioPorPin).
 */
function clave() {
  const secreto = process.env.PIN_SECRETO || process.env.JWT_SECRET;
  if (!secreto) throw new Error("Falta JWT_SECRET (o PIN_SECRETO) para la huella del PIN");
  return `huella-pin|${secreto}`;
}

export function versionHuella() {
  return createHash("sha256").update(clave()).digest("hex").slice(0, 8);
}

export function huellaPin(pin: string) {
  return `${versionHuella()}:${createHmac("sha256", clave()).update(pin).digest("hex")}`;
}
