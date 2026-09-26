"use server";

import { refresh } from "next/cache";
import { db } from "@/db";
import { configuracion } from "@/db/schema";
import { conPermiso, exito, falloValidacion, type Resultado } from "@/lib/acciones/resultado";
import { registrarAuditoria } from "@/lib/auditoria";
import { autorizar } from "@/lib/auth/sesion";
import { esquemaConfiguracion, type DatosConfiguracion } from "@/lib/validaciones/admin";

export async function guardarConfiguracion(entrada: DatosConfiguracion): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizar("admin");
    const validado = esquemaConfiguracion.safeParse(entrada);
    if (!validado.success) return falloValidacion(validado.error);

    await db
      .insert(configuracion)
      .values({ id: 1, ...validado.data })
      .onConflictDoUpdate({ target: configuracion.id, set: validado.data });
    await registrarAuditoria("configuracion_editada", { usuarioId: sesion.uid, detalle: validado.data });
    refresh();
    return exito();
  });
}
