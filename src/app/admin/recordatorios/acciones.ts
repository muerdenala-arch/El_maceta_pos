"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { recordatorios } from "@/db/schema";
import { conPermiso, exito, fallo, falloValidacion, type Resultado } from "@/lib/acciones/resultado";
import { autorizarModulo } from "@/lib/auth/modulo-servidor";
import { proximoAviso } from "@/lib/recordatorios/calculo";
import { idPositivo } from "@/lib/validaciones/comunes";
import { esquemaRecordatorio, type DatosRecordatorio } from "@/lib/validaciones/recordatorios";

/**
 * Crea o edita un recordatorio propio: a ese día y hora (Bolivia) llega la notificación a los equipos de quien lo creó.
 * Cada persona solo ve y cambia los suyos.
 */
export async function guardarRecordatorio(entrada: DatosRecordatorio & { id?: number }): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizarModulo("recordatorios");
    const v = esquemaRecordatorio.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);
    const d = v.data;
    const proximaEn = proximoAviso(d, new Date());
    if (!proximaEn) return fallo("Revisa los datos marcados", { hora: "Ese día y hora ya pasaron" });

    const datos = { ...d, proximaEn };
    if (entrada.id === undefined) {
      await db.insert(recordatorios).values({ ...datos, usuarioId: sesion.uid });
    } else {
      const id = idPositivo.parse(entrada.id);
      const [editado] = await db
        .update(recordatorios)
        .set(datos)
        .where(and(eq(recordatorios.id, id), eq(recordatorios.usuarioId, sesion.uid)))
        .returning({ id: recordatorios.id });
      if (!editado) return fallo("El recordatorio ya no existe");
    }
    refresh();
    return exito();
  });
}

/** Borra un recordatorio propio (son notas personales: no quedan en la auditoría). */
export async function eliminarRecordatorio(entrada: { id: number }): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizarModulo("recordatorios");
    const id = idPositivo.safeParse(entrada?.id);
    if (!id.success) return fallo("Recordatorio inválido");
    await db.delete(recordatorios).where(and(eq(recordatorios.id, id.data), eq(recordatorios.usuarioId, sesion.uid)));
    refresh();
    return exito();
  });
}
