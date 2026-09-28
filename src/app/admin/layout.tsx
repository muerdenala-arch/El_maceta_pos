import { GuardiaBloqueo } from "@/components/seguridad/guardia-bloqueo";
import { RefrescoAutomatico } from "@/components/shell/refresco-automatico";
import { Shell } from "@/components/shell/shell";
import { resumenAlertas } from "@/lib/alertas/consultas";
import { conciliarAlertasSiCorresponde } from "@/lib/alertas/motor";
import { requerirSesion } from "@/lib/auth/sesion";
import { obtenerMarca } from "@/lib/configuracion";
import { listarSucursalesActivas, obtenerSucursalVista } from "@/lib/sucursal-vista";

// Segunda barrera después de proxy.ts: verifica sesión y rol contra la BD.
export default async function LayoutAdmin({ children }: LayoutProps<"/admin">) {
  const sesion = await requerirSesion("admin");
  // Alertas al día (vencimientos, stock) como máximo cada 5 minutos, antes de contar.
  await conciliarAlertasSiCorresponde();
  const [marca, sucursales, sucursalActual, alertas] = await Promise.all([
    obtenerMarca(),
    listarSucursalesActivas(),
    obtenerSucursalVista(sesion),
    resumenAlertas(),
  ]);

  return (
    <GuardiaBloqueo nombre={sesion.nombre} usuario={sesion.usuario} usuarioId={sesion.uid} marca={marca}>
      <RefrescoAutomatico />
      <Shell
        rol="admin"
        usuario={{ nombre: sesion.nombre }}
        marca={marca}
        sucursales={sucursales}
        sucursalActual={sucursalActual}
        alertas={alertas}
      >
        {children}
      </Shell>
    </GuardiaBloqueo>
  );
}
