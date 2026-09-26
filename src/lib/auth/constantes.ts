/** Parámetros de seguridad de sesión (sección 7 del plan). Compartidos entre servidor y cliente. */

export const COOKIE_SESION = "maseta_sesion";
export const COOKIE_SUCURSAL_VISTA = "maseta_sucursal_vista";

/** PIN incorrectos permitidos antes del bloqueo temporal. */
export const MAX_INTENTOS_PIN = 5;
export const MINUTOS_BLOQUEO_PIN = 15;

/** Minutos sin interacción antes de pedir el PIN. */
export const MINUTOS_INACTIVIDAD = 15;

/**
 * Indicador de desbloqueo en sessionStorage: se pierde al cerrar la app/pestaña,
 * así que al reabrir se vuelve a pedir el PIN.
 */
export const CLAVE_DESBLOQUEO = "maseta:desbloqueado";
/** Último usuario que ingresó en este dispositivo (solo el nombre de usuario, nunca el PIN). */
export const CLAVE_ULTIMO_USUARIO = "maseta:ultimo-usuario";

export type Rol = "admin" | "cajero";
