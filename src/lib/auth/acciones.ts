"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { registrarAuditoria } from "@/lib/auditoria";
import { esquemaLogin, esquemaPin, type DatosLogin } from "@/lib/validaciones/auth";
import { compararConRelleno, comprobarPin, horaLocal } from "./pin";
import { inicioSegunRol } from "./rutas";
import { borrarCookieSesion, guardarCookieSesion, obtenerSesion } from "./sesion";

const MENSAJE_INCORRECTO = "Usuario o PIN incorrecto";
const mensajeBloqueo = (hasta: Date) =>
  `Demasiados intentos fallidos. Intenta de nuevo a las ${horaLocal(hasta)}.`;

export type ResultadoLogin = { ok: true; destino: string } | { ok: false; error: string };

export async function iniciarSesion(datos: DatosLogin): Promise<ResultadoLogin> {
  const validado = esquemaLogin.safeParse(datos);
  if (!validado.success) return { ok: false, error: validado.error.issues[0].message };
  const { usuario, pin } = validado.data;

  const [u] = await db.select().from(usuarios).where(eq(usuarios.usuario, usuario));
  if (!u || !u.activo) {
    await compararConRelleno(pin);
    await registrarAuditoria("login_fallido", { detalle: { usuario, motivo: u ? "inactivo" : "no_existe" } });
    return { ok: false, error: MENSAJE_INCORRECTO };
  }

  const resultado = await comprobarPin(u, pin, "login");
  if (!resultado.ok) {
    return {
      ok: false,
      error: resultado.motivo === "bloqueado" ? mensajeBloqueo(resultado.hasta) : MENSAJE_INCORRECTO,
    };
  }

  await guardarCookieSesion({ uid: u.id, rol: u.rol, sucursalId: u.sucursalId });
  await registrarAuditoria("login", { usuarioId: u.id });
  return { ok: true, destino: inicioSegunRol(u.rol) };
}

export type ResultadoDesbloqueo = { ok: true } | { ok: false; error: string; sesionCerrada?: boolean };

/** Pantalla de bloqueo por inactividad / al reabrir la app: valida el PIN del usuario de la sesión. */
export async function desbloquear(pin: string): Promise<ResultadoDesbloqueo> {
  const sesion = await obtenerSesion();
  if (!sesion) return { ok: false, error: "Tu sesión expiró. Vuelve a ingresar.", sesionCerrada: true };
  if (!esquemaPin.safeParse(pin).success) return { ok: false, error: "PIN incorrecto" };

  const [u] = await db.select().from(usuarios).where(eq(usuarios.id, sesion.uid));
  const resultado = await comprobarPin(u, pin, "desbloqueo");
  if (resultado.ok) {
    await registrarAuditoria("desbloqueo", { usuarioId: u.id });
    return { ok: true };
  }
  if (resultado.motivo === "bloqueado") {
    // Tras el límite de intentos se cierra la sesión: nadie puede seguir probando PINs en esta pantalla.
    await borrarCookieSesion();
    return { ok: false, error: mensajeBloqueo(resultado.hasta), sesionCerrada: true };
  }
  return { ok: false, error: "PIN incorrecto" };
}

export async function cerrarSesion() {
  const sesion = await obtenerSesion();
  if (sesion) await registrarAuditoria("logout", { usuarioId: sesion.uid });
  await borrarCookieSesion();
}
