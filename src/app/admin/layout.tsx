import { GuardiaBloqueo } from "@/components/seguridad/guardia-bloqueo";
import { Shell } from "@/components/shell/shell";
import { requerirSesion } from "@/lib/auth/sesion";
import { obtenerMarca } from "@/lib/configuracion";
import { listarSucursalesActivas, obtenerSucursalVista } from "@/lib/sucursal-vista";

// Segunda barrera después de proxy.ts: verifica sesión y rol contra la BD.
export default async function LayoutAdmin({ children }: LayoutProps<"/admin">) {
  const sesion = await requerirSesion("admin");
  const [marca, sucursales, sucursalActual] = await Promise.all([
    obtenerMarca(),
    listarSucursalesActivas(),
    obtenerSucursalVista(sesion),
  ]);

  return (
    <GuardiaBloqueo nombre={sesion.nombre} usuario={sesion.usuario} usuarioId={sesion.uid} marca={marca}>
      <Shell
        rol="admin"
        usuario={{ nombre: sesion.nombre }}
        marca={marca}
        sucursales={sucursales}
        sucursalActual={sucursalActual}
      >
        {children}
      </Shell>
    </GuardiaBloqueo>
  );
}
