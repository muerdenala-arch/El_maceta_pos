"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { qrPagos, sucursales } from "@/db/schema";
import { conPermiso, exito, fallo, falloValidacion, type Resultado } from "@/lib/acciones/resultado";
import { registrarAuditoria } from "@/lib/auditoria";
import { autorizar } from "@/lib/auth/sesion";
import { idPositivo } from "@/lib/validaciones/comunes";
import { esquemaQr, type DatosQr } from "@/lib/validaciones/caja";

export async function guardarQr(entrada: DatosQr & { id?: number }): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizar("admin");
    const v = esquemaQr.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);
    const d = v.data;
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
