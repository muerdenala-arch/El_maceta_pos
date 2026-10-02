/**
 * Reglas de acceso por ruta (usadas por proxy.ts). Función pura para poder probarla.
 * Es la primera barrera; cada página y cada acción del servidor vuelve a verificar la sesión.
 */
import { ROLES_CAJA, type Rol } from "./constantes";
import { moduloDeRuta } from "./modulos";

export type Decision =
  | { tipo: "seguir" }
  | { tipo: "redirigir"; destino: string }
  | { tipo: "no_autenticado" }
  | { tipo: "prohibido" };

export function inicioSegunRol(rol: Rol) {
  return rol === "admin" ? "/admin/dashboard" : rol === "encargado" ? "/encargado/panel" : "/cajero/venta";
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

  // /admin: solo administrador. /encargado: solo encargado. /cajero: quien opera una caja (cajero y encargado).
  const permitidos: readonly Rol[] | null =
    bajo(ruta, "/admin") || bajo(ruta, "/api/admin")
      ? ["admin"]
      : bajo(ruta, "/encargado") || bajo(ruta, "/api/encargado")
        ? ["encargado"]
        : bajo(ruta, "/cajero") || bajo(ruta, "/api/cajero")
          ? ROLES_CAJA
          : null;

  // El encargado entra además a los apartados del administrador que comparte (lib/auth/modulos.ts) y al Excel de eventos.
  const compartida = sesion.rol === "encargado" && (moduloDeRuta(ruta) !== null || bajo(ruta, "/api/admin/eventos"));

  if (permitidos && !permitidos.includes(sesion.rol) && !compartida) {
    return esApi ? { tipo: "prohibido" } : { tipo: "redirigir", destino: inicioSegunRol(sesion.rol) };
  }
  return { tipo: "seguir" };
}
