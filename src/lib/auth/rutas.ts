/**
 * Reglas de acceso por ruta (usadas por proxy.ts). Función pura para poder probarla.
 * Es la primera barrera; cada página y cada acción del servidor vuelve a verificar la sesión.
 */
import { ROLES_CAJA, type Rol } from "./constantes";

export type Decision =
  | { tipo: "seguir" }
  | { tipo: "redirigir"; destino: string }
  | { tipo: "no_autenticado" }
  | { tipo: "prohibido" };

export function inicioSegunRol(rol: Rol) {
  // El encargado entra al primer apartado que tenga abierto (/admin/inicio lo decide con los candados).
  return rol === "admin" ? "/admin/dashboard" : rol === "encargado" ? "/admin/inicio" : "/cajero/venta";
}

const bajo = (ruta: string, prefijo: string) => ruta === prefijo || ruta.startsWith(`${prefijo}/`);

export function decidirAcceso(ruta: string, sesion: { rol: Rol } | null): Decision {
  // Vista pública del comprobante (enlace de WhatsApp con token aleatorio) e imágenes
  // subidas en desarrollo (públicas como las de Vercel Blob: el logo aparece en el login).
  if (bajo(ruta, "/comprobante") || bajo(ruta, "/api/archivos")) return { tipo: "seguir" };
  // Resultados públicos de un reto (enlace de WhatsApp con token aleatorio; sin cédula ni teléfono).
  if (bajo(ruta, "/eventos")) return { tipo: "seguir" };
  // App instalable: íconos y página de respaldo sin conexión (el manifest y sw.js tienen extensión: no pasan por aquí).
  if (bajo(ruta, "/icono") || ruta === "/sin-conexion") return { tipo: "seguir" };

  if (ruta === "/login") {
    return sesion ? { tipo: "redirigir", destino: inicioSegunRol(sesion.rol) } : { tipo: "seguir" };
  }

  const esApi = bajo(ruta, "/api");
  if (!sesion) return esApi ? { tipo: "no_autenticado" } : { tipo: "redirigir", destino: "/login" };

  if (ruta === "/") return { tipo: "redirigir", destino: inicioSegunRol(sesion.rol) };

  // /admin: administrador y encargado (cada página exige su candado abierto al encargado). /cajero: solo el cajero.
  const permitidos: readonly Rol[] | null =
    bajo(ruta, "/admin") || bajo(ruta, "/api/admin") ? ["admin", "encargado"] : bajo(ruta, "/cajero") || bajo(ruta, "/api/cajero") ? ROLES_CAJA : null;

  if (permitidos && !permitidos.includes(sesion.rol)) {
    return esApi ? { tipo: "prohibido" } : { tipo: "redirigir", destino: inicioSegunRol(sesion.rol) };
  }
  return { tipo: "seguir" };
}
