"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { registrarAuditoria } from "@/lib/auditoria";
import { esquemaLogin, esquemaPin, type DatosLogin } from "@/lib/validaciones/auth";
import { buscarUsuarioPorPin, comprobarPin, horaLocal, limpiarOrigen, origenBloqueado, origenPeticion, registrarFalloOrigen } from "./pin";
import { inicioSegunRol } from "./rutas";
import { borrarCookieSesion, guardarCookieSesion, obtenerSesion } from "./sesion";

const MENSAJE_INCORRECTO = "PIN incorrecto";
const mensajeBloqueo = (hasta: Date) =>
  `Demasiados intentos fallidos. Intenta de nuevo a las ${horaLocal(hasta)}.`;

export type ResultadoLogin =
  | { ok: true; destino: string; usuarioId: number; usuario: string; nombre: string }
  | { ok: false; error: string };

/**
 * Ingreso solo con el PIN: se busca al dueño del PIN y se lo lleva a su pantalla según su rol.
 * Los PIN incorrectos se cuentan por dispositivo/red (no se sabe a qué usuario se probaba): 5 fallos → 15 min.
 * La pantalla prueba sola al llegar a 4, 5 y 6 dígitos (`automatico`): si el PIN es válido entra sin tocar "Ingresar";
 * seguir escribiendo el mismo PIN cuenta como un solo intento (ver registrarFalloOrigen).
 */
export async function iniciarSesion(datos: DatosLogin): Promise<ResultadoLogin> {
  const validado = esquemaLogin.safeParse(datos);
  if (!validado.success) return { ok: false, error: validado.error.issues[0].message };
  const { pin } = validado.data;

  const origen = await origenPeticion();
  const bloqueadoHasta = await origenBloqueado(origen);
  if (bloqueadoHasta) return { ok: false, error: mensajeBloqueo(bloqueadoHasta) };

  const busqueda = await buscarUsuarioPorPin(pin);
  if (busqueda.tipo === "ambiguo") {
    return { ok: false, error: "Ese PIN lo tienen dos usuarios: pide al administrador que le cambie el PIN a uno." };
  }
  if (busqueda.tipo === "ninguno") {
    const hasta = await registrarFalloOrigen(origen, pin);
    // Las pruebas automáticas mientras se escribe (4 y 5 dígitos) no llenan la auditoría: solo el intento explícito.
    if (!hasta && !validado.data.automatico) await registrarAuditoria("login_fallido", { detalle: { motivo: "pin_desconocido", origen } });
    return { ok: false, error: hasta ? mensajeBloqueo(hasta) : MENSAJE_INCORRECTO };
  }

  const u = busqueda.usuario;
  // Bloqueo del usuario por fallos en la pantalla de desbloqueo (sigue vigente).
  const resultado = await comprobarPin(u, pin, "login");
  if (!resultado.ok) {
    return { ok: false, error: resultado.motivo === "bloqueado" ? mensajeBloqueo(resultado.hasta) : MENSAJE_INCORRECTO };
  }

  await limpiarOrigen(origen);
  await guardarCookieSesion({ uid: u.id, rol: u.rol, sucursalId: u.sucursalId });
  await registrarAuditoria("login", { usuarioId: u.id });
  return { ok: true, destino: inicioSegunRol(u.rol), usuarioId: u.id, usuario: u.usuario, nombre: u.nombre };
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
