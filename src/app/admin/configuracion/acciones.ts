"use server";

import { refresh } from "next/cache";
import { db } from "@/db";
import { configuracion } from "@/db/schema";
import { conPermiso, exito, falloValidacion, type Resultado } from "@/lib/acciones/resultado";
import { registrarAuditoria } from "@/lib/auditoria";
import { autorizarModulo } from "@/lib/auth/modulo-servidor";
import { esquemaConfiguracion, type DatosConfiguracion } from "@/lib/validaciones/admin";

export async function guardarConfiguracion(entrada: DatosConfiguracion): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizarModulo("configuracion");
    const validado = esquemaConfiguracion.safeParse(entrada);
    if (!validado.success) return falloValidacion(validado.error);

    const datos = validado.data;
    await db
      .insert(configuracion)
      .values({ id: 1, ...datos })
      .onConflictDoUpdate({ target: configuracion.id, set: datos });
    await registrarAuditoria("configuracion_editada", { usuarioId: sesion.uid, detalle: { ...datos, rol: sesion.rol } });
    refresh();
    return exito();
  });
}
