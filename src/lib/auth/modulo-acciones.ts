"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { configuracion } from "@/db/schema";
import { conPermiso, exito, fallo, type Resultado } from "@/lib/acciones/resultado";
import { registrarAuditoria } from "@/lib/auditoria";
import { MODULOS_CON_CANDADO, modulosValidos, NOMBRES_MODULO, type ModuloEncargado } from "./modulos";
import { autorizar } from "./sesion";

/**
 * Abre o cierra el candado de un apartado para los encargados (solo el administrador). Cerrado: el apartado desaparece
 * del menú del encargado y no puede entrar. Vale para todos los encargados y queda en auditoría.
 */
export async function cambiarCandado(entrada: { modulo: string; abierto: boolean }): Promise<Resultado<{ abiertos: ModuloEncargado[] }>> {
  return conPermiso(async () => {
    const sesion = await autorizar("admin");
    const modulo = MODULOS_CON_CANDADO.find((m) => m === entrada?.modulo);
    if (!modulo) return fallo("Apartado inválido");
    const abierto = entrada.abierto === true;

    const abiertos = await db.transaction(async (tx) => {
      await tx.insert(configuracion).values({ id: 1 }).onConflictDoNothing();
      const [c] = await tx.select({ abiertos: configuracion.encargadoModulosAbiertos }).from(configuracion).where(eq(configuracion.id, 1)).for("update");
      const actuales = modulosValidos(c?.abiertos);
      const nuevos = MODULOS_CON_CANDADO.filter((m) => (m === modulo ? abierto : actuales.includes(m)));
      await tx.update(configuracion).set({ encargadoModulosAbiertos: nuevos }).where(eq(configuracion.id, 1));
      return nuevos;
    });
    await registrarAuditoria("candado_encargado", { usuarioId: sesion.uid, detalle: { modulo, apartado: NOMBRES_MODULO[modulo], abierto } });
    refresh();
    return exito({ abiertos });
  });
}
