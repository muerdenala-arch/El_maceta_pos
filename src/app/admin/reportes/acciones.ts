"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { alertas, ventas } from "@/db/schema";
import { conPermiso, exito, fallo, falloValidacion, type Resultado } from "@/lib/acciones/resultado";
import { registrarAuditoria } from "@/lib/auditoria";
import { autorizar } from "@/lib/auth/sesion";
import { formatoBs } from "@/lib/formato";
import { anularVentaConStock } from "@/lib/caja/anulacion";
import { idPositivo } from "@/lib/validaciones/comunes";
import { esquemaAnulacion, type DatosAnulacion } from "@/lib/validaciones/caja";

/**
 * Anula una venta (las ventas no se borran): devuelve el stock, libera el uso del cupón y queda en
 * auditoría con el motivo. Si su caja sigue abierta, el efectivo esperado del cierre deja de contarla.
 */
export async function anularVenta(entrada: DatosAnulacion): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizar("admin");
    const v = esquemaAnulacion.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);
    const { id, motivo } = v.data;

    const r = await anularVentaConStock({ id, motivo, usuarioId: sesion.uid });
    if (!r.ok) return fallo(r.error);
    const venta = r.venta;
    await registrarAuditoria("venta_anulada", {
      usuarioId: sesion.uid,
      detalle: { ventaId: id, numero: venta.numeroComprobante, sucursalId: venta.sucursalId, total: venta.total, motivo, rol: sesion.rol },
    });
    refresh();
    return exito();
  });
}

/** Venta por QR hecha sin conexión: el admin confirma que el pago llegó a la cuenta. */
export async function confirmarPagoQr(entrada: { id: number }): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizar("admin");
    const id = idPositivo.parse(entrada.id);
    const [v] = await db
      .update(ventas)
      .set({ estadoPago: "pagado" })
      .where(and(eq(ventas.id, id), eq(ventas.estadoPago, "qr_por_confirmar")))
      .returning({ numero: ventas.numeroComprobante, total: ventas.total });
    if (!v) return fallo("Esta venta no tiene un pago QR pendiente");
    await db
      .update(alertas)
      .set({ resuelta: true, leida: true })
      .where(and(eq(alertas.ventaId, id), eq(alertas.tipo, "qr_por_confirmar")));
    await registrarAuditoria("pago_qr_confirmado", { usuarioId: sesion.uid, detalle: { ventaId: id, numero: v.numero, total: formatoBs(v.total) } });
    refresh();
    return exito();
  });
}
