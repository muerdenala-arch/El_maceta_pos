import { GuardiaBloqueo } from "@/components/seguridad/guardia-bloqueo";
import { RefrescoAutomatico } from "@/components/shell/refresco-automatico";
import { Shell } from "@/components/shell/shell";
import { resumenAlertas } from "@/lib/alertas/consultas";
import { conciliarAlertasSiCorresponde } from "@/lib/alertas/motor";
import { Sincronizador } from "@/components/offline/sincronizador";
import { modulosAbiertos } from "@/lib/auth/modulo-servidor";
import { requerirSesion } from "@/lib/auth/sesion";
import { obtenerMarca } from "@/lib/configuracion";
import { listarSucursalesActivas, obtenerSucursalVista } from "@/lib/sucursal-vista";

// Segunda barrera después de proxy.ts: verifica sesión y rol contra la BD.
export default async function LayoutAdmin({ children }: LayoutProps<"/admin">) {
  // El encargado entra a los apartados compartidos (cada página decide con requerirModulo; el resto es solo del admin).
  const sesion = await requerirSesion("admin", "encargado");
  const admin = sesion.rol === "admin";
  // Alertas al día (vencimientos, stock) como máximo cada 5 minutos, antes de contar.
  await conciliarAlertasSiCorresponde();
  const [marca, todas, sucursalActual, alertas, abiertos] = await Promise.all([
    obtenerMarca(),
    listarSucursalesActivas(),
    obtenerSucursalVista(sesion),
    resumenAlertas(admin ? undefined : sesion),
    modulosAbiertos(),
  ]);
  const sucursales = admin ? todas : todas.filter((s) => s.id === sesion.sucursalId);

  return (
    <GuardiaBloqueo nombre={sesion.nombre} usuario={sesion.usuario} usuarioId={sesion.uid} marca={marca}>
      {!admin && <Sincronizador usuarioId={sesion.uid} />}
      <RefrescoAutomatico />
      <Shell
        rol={sesion.rol}
        candados={abiertos}
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
