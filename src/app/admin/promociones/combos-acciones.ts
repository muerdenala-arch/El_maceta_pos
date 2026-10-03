"use server";

import { eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { comboItems, combos, productos } from "@/db/schema";
import { conPermiso, exito, fallo, falloValidacion, type Resultado } from "@/lib/acciones/resultado";
import { registrarAuditoria } from "@/lib/auditoria";
import { autorizarModulo } from "@/lib/auth/modulo-servidor";
import { esquemaCombo, type DatosCombo } from "@/lib/validaciones/combos";
import { idPositivo } from "@/lib/validaciones/comunes";

/** Crea o edita un combo con sus productos (los productos se reemplazan completos). Solo administrador. */
export async function guardarCombo(entrada: DatosCombo & { id?: number }): Promise<Resultado<{ id: number }>> {
  return conPermiso(async () => {
    const sesion = await autorizarModulo("promociones");
    const v = esquemaCombo.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);
    const { items, ...datos } = v.data;

    const catalogo = await db
      .select({ id: productos.id, activo: productos.activo, fraccionado: productos.fraccionado, unidadesPorEnvase: productos.unidadesPorEnvase })
      .from(productos)
      .where(inArray(productos.id, [...new Set(items.map((i) => i.productoId))]));
    const porId = new Map(catalogo.map((p) => [p.id, p]));
    for (const i of items) {
      const p = porId.get(i.productoId);
      if (!p?.activo) return fallo("Revisa los datos marcados", { items: "Algún producto del combo ya no existe o está inactivo" });
      if (i.fraccion && !(p.fraccionado && (p.unidadesPorEnvase ?? 0) > 1)) {
        return fallo("Revisa los datos marcados", { items: "Solo los productos fraccionados se pueden agregar por unidades sueltas" });
      }
    }

    const id = await db.transaction(async (tx) => {
      let comboId: number;
      if (entrada.id === undefined) {
        [{ id: comboId }] = await tx.insert(combos).values(datos).returning({ id: combos.id });
      } else {
        comboId = idPositivo.parse(entrada.id);
        const [existe] = await tx.update(combos).set(datos).where(eq(combos.id, comboId)).returning({ id: combos.id });
        if (!existe) return null;
        await tx.delete(comboItems).where(eq(comboItems.comboId, comboId));
      }
      await tx.insert(comboItems).values(items.map((i) => ({ comboId, ...i })));
      return comboId;
    });
    if (id === null) return fallo("El combo ya no existe");

    await registrarAuditoria(entrada.id === undefined ? "combo_creado" : "combo_editado", {
      usuarioId: sesion.uid,
      detalle: { id, nombre: datos.nombre, tipoDescuento: datos.tipoDescuento, valorDescuento: datos.valorDescuento, productos: items.length },
    });
    refresh();
    return exito({ id });
  });
}

/** Activa o desactiva un combo (los combos no se borran: quedan en el historial de ventas). */
export async function cambiarEstadoCombo(entrada: { id: number; activo: boolean }): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizarModulo("promociones");
    const id = idPositivo.parse(entrada.id);
    const activo = entrada.activo === true;
    const [combo] = await db.update(combos).set({ activo }).where(eq(combos.id, id)).returning({ nombre: combos.nombre });
    if (!combo) return fallo("El combo ya no existe");
    await registrarAuditoria("combo_editado", { usuarioId: sesion.uid, detalle: { id, nombre: combo.nombre, activo } });
    refresh();
    return exito();
  });
}
