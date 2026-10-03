import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sucursales } from "@/db/schema";
import { Sincronizador } from "@/components/offline/sincronizador";
import { GuardiaBloqueo } from "@/components/seguridad/guardia-bloqueo";
import { RefrescoAutomatico } from "@/components/shell/refresco-automatico";
import { Shell } from "@/components/shell/shell";
import { requerirSesion } from "@/lib/auth/sesion";
import { obtenerMarca } from "@/lib/configuracion";
import { ROLES_CAJA } from "@/lib/auth/constantes";

// Segunda barrera después de proxy.ts: verifica sesión y rol contra la BD.
export default async function LayoutCajero({ children }: LayoutProps<"/cajero">) {
  const sesion = await requerirSesion(...ROLES_CAJA);
  const [marca, suSucursal] = await Promise.all([
    obtenerMarca(),
    sesion.sucursalId
      ? db
          .select({ id: sucursales.id, nombre: sucursales.nombre })
          .from(sucursales)
          .where(eq(sucursales.id, sesion.sucursalId))
      : Promise.resolve([]),
  ]);

  return (
    <GuardiaBloqueo nombre={sesion.nombre} usuario={sesion.usuario} usuarioId={sesion.uid} marca={marca}>
      <Sincronizador usuarioId={sesion.uid} />
      <RefrescoAutomatico />
      <Shell
        rol={sesion.rol}
        usuario={{ nombre: sesion.nombre }}
        marca={marca}
        sucursales={suSucursal}
        sucursalActual={sesion.sucursalId}
      >
        {children}
      </Shell>
    </GuardiaBloqueo>
  );
}
