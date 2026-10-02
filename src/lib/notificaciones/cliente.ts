/** Notificaciones del sistema (Web Push) en este dispositivo: activar, desactivar y saber en qué estado están. */
import { guardarSuscripcionPush, quitarSuscripcionPush } from "./acciones";

export type EstadoPush =
  /** El navegador no las admite. En iPhone/iPad hace falta instalar la app en la pantalla de inicio. */
  | "no_disponible"
  /** La persona las bloqueó en el navegador: solo se reactivan desde los ajustes del sitio. */
  | "bloqueadas"
  | "apagadas"
  | "activas";

const CLAVE = process.env.NEXT_PUBLIC_VAPID_PUBLICA ?? "";

function disponible() {
  return !!CLAVE && typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Service worker ya registrado (solo existe en producción); no espera para siempre si no hay. */
async function registro() {
  const r = await navigator.serviceWorker.getRegistration();
  return r ?? null;
}

export async function estadoPush(): Promise<EstadoPush> {
  if (!disponible()) return "no_disponible";
  if (Notification.permission === "denied") return "bloqueadas";
  const r = await registro();
  if (!r) return "no_disponible";
  return (await r.pushManager.getSubscription()) && Notification.permission === "granted" ? "activas" : "apagadas";
}

function claveBinaria(base64url: string) {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Pide permiso (debe llamarse desde un toque del usuario), suscribe el dispositivo y lo guarda en el servidor. */
export async function activarPush(): Promise<EstadoPush> {
  if (!disponible()) return "no_disponible";
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") return permiso === "denied" ? "bloqueadas" : "apagadas";
  const r = await registro();
  if (!r) return "no_disponible";
  const sub = (await r.pushManager.getSubscription()) ?? (await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveBinaria(CLAVE) }));
  const datos = sub.toJSON();
  const guardado = await guardarSuscripcionPush({ endpoint: sub.endpoint, p256dh: datos.keys?.p256dh ?? "", auth: datos.keys?.auth ?? "" });
  if (!guardado.ok) {
    await sub.unsubscribe().catch(() => {});
    return "apagadas";
  }
  return "activas";
}

/** Deja de recibirlas en este dispositivo (también al cerrar sesión: las alertas son de quien las activó). */
export async function desactivarPush(): Promise<void> {
  if (!disponible()) return;
  try {
    const sub = await (await registro())?.pushManager.getSubscription();
    if (!sub) return;
    await quitarSuscripcionPush({ endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  } catch {
    // Sin conexión o sin permiso: no impide cerrar sesión.
  }
}
