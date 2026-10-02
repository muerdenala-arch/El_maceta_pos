import { Sincronizador } from "@/components/offline/sincronizador";
import { GuardiaBloqueo } from "@/components/seguridad/guardia-bloqueo";
import { RefrescoAutomatico } from "@/components/shell/refresco-automatico";
import { Shell } from "@/components/shell/shell";
import { resumenAlertas } from "@/lib/alertas/consultas";
import { conciliarAlertasSiCorresponde } from "@/lib/alertas/motor";
import { modulosAbiertos } from "@/lib/auth/modulo-servidor";
import { obtenerMarca } from "@/lib/configuracion";
import { requerirEncargado } from "@/lib/encargado";

// Segunda barrera después de proxy.ts: solo el encargado, y siempre con su sucursal.
export default async function LayoutEncargado({ children }: LayoutProps<"/encargado">) {
  const { sesion, sucursal } = await requerirEncargado();
  await conciliarAlertasSiCorresponde();
  const [marca, alertas, abiertos] = await Promise.all([obtenerMarca(), resumenAlertas(sesion), modulosAbiertos()]);

  return (
    <GuardiaBloqueo nombre={sesion.nombre} usuario={sesion.usuario} usuarioId={sesion.uid} marca={marca}>
      {/* También vende: sus ventas sin conexión se siguen enviando desde estas pantallas. */}
      <Sincronizador usuarioId={sesion.uid} />
      <RefrescoAutomatico />
      <Shell rol="encargado" usuario={{ nombre: sesion.nombre }} marca={marca} sucursales={[sucursal]} sucursalActual={sucursal.id} alertas={alertas} candados={abiertos}>
        {children}
      </Shell>
    </GuardiaBloqueo>
  );
}
