"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { qrPagos, sucursales } from "@/db/schema";
import { conPermiso, exito, fallo, falloValidacion, type Resultado } from "@/lib/acciones/resultado";
import { registrarAuditoria } from "@/lib/auditoria";
import { autorizarModulo, exigirSuSucursal } from "@/lib/auth/modulo-servidor";
import { idPositivo } from "@/lib/validaciones/comunes";
import { esquemaQr, type DatosQr } from "@/lib/validaciones/caja";

export async function guardarQr(entrada: DatosQr & { id?: number }): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizarModulo("qr");
    const v = esquemaQr.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);
    const d = v.data;
    // El encargado solo crea y edita QR de su sucursal (no los "para todas" ni los de otra).
    exigirSuSucursal(sesion, d.sucursalId);
    if (sesion.rol !== "admin" && entrada.id !== undefined) {
      const [actual] = await db.select({ sucursalId: qrPagos.sucursalId }).from(qrPagos).where(eq(qrPagos.id, idPositivo.parse(entrada.id)));
      if (!actual) return fallo("El QR ya no existe");
      exigirSuSucursal(sesion, actual.sucursalId);
    }
    if (d.sucursalId !== null) {
      const [s] = await db
        .select({ id: sucursales.id })
        .from(sucursales)
        .where(and(eq(sucursales.id, d.sucursalId), eq(sucursales.tipo, "sucursal")));
      if (!s) return fallo("Revisa los datos marcados", { sucursalId: "Sucursal inválida" });
    }
    const datos = { ...d, imagenUrl: d.imagenUrl! };

    if (entrada.id === undefined) {
      const [nuevo] = await db.insert(qrPagos).values(datos).returning({ id: qrPagos.id });
      await registrarAuditoria("qr_creado", { usuarioId: sesion.uid, detalle: { id: nuevo.id, ...datos } });
    } else {
      const id = idPositivo.parse(entrada.id);
      await db.update(qrPagos).set(datos).where(eq(qrPagos.id, id));
      await registrarAuditoria("qr_editado", { usuarioId: sesion.uid, detalle: { id, ...datos } });
    }
    refresh();
    return exito();
  });
}
