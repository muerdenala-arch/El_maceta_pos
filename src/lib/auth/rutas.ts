/**
 * Reglas de acceso por ruta (usadas por proxy.ts). Función pura para poder probarla.
 * Es la primera barrera; cada página y cada acción del servidor vuelve a verificar la sesión.
 */
import type { Rol } from "./constantes";

export type Decision =
  | { tipo: "seguir" }
  | { tipo: "redirigir"; destino: string }
  | { tipo: "no_autenticado" }
  | { tipo: "prohibido" };

export function inicioSegunRol(rol: Rol) {
  return rol === "admin" ? "/admin/dashboard" : "/cajero/venta";
}

const bajo = (ruta: string, prefijo: string) => ruta === prefijo || ruta.startsWith(`${prefijo}/`);

export function decidirAcceso(ruta: string, sesion: { rol: Rol } | null): Decision {
  // Vista pública del comprobante (enlace de WhatsApp con token aleatorio) e imágenes
  // subidas en desarrollo (públicas como las de Vercel Blob: el logo aparece en el login).
  if (bajo(ruta, "/comprobante") || bajo(ruta, "/api/archivos")) return { tipo: "seguir" };

  if (ruta === "/login") {
    return sesion ? { tipo: "redirigir", destino: inicioSegunRol(sesion.rol) } : { tipo: "seguir" };
  }

  const esApi = bajo(ruta, "/api");
  if (!sesion) return esApi ? { tipo: "no_autenticado" } : { tipo: "redirigir", destino: "/login" };

  if (ruta === "/") return { tipo: "redirigir", destino: inicioSegunRol(sesion.rol) };

  const requerido: Rol | null =
    bajo(ruta, "/admin") || bajo(ruta, "/api/admin")
      ? "admin"
      : bajo(ruta, "/cajero") || bajo(ruta, "/api/cajero")
        ? "cajero"
        : null;

  if (requerido && sesion.rol !== requerido) {
    return esApi ? { tipo: "prohibido" } : { tipo: "redirigir", destino: inicioSegunRol(sesion.rol) };
  }
  return { tipo: "seguir" };
}
