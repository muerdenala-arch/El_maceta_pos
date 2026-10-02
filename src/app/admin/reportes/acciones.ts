"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { alertas, cupones, detalleVenta, productos, ventas } from "@/db/schema";
import { conPermiso, exito, fallo, falloValidacion, type Resultado } from "@/lib/acciones/resultado";
import { registrarAuditoria } from "@/lib/auditoria";
import { autorizar } from "@/lib/auth/sesion";
import { formatoBs } from "@/lib/formato";
import { esFraccionado, unidadesDeLinea } from "@/lib/inventario/fraccion";
import { cambiarStock } from "@/lib/inventario/stock";
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

    const venta = await db.transaction(async (tx) => {
      const [actual] = await tx.select().from(ventas).where(eq(ventas.id, id)).for("update");
      if (!actual || actual.estado === "anulada") return null;
      await tx.update(ventas).set({ estado: "anulada", motivoAnulacion: motivo }).where(eq(ventas.id, id));

      const lineas = await tx
        .select({
          productoId: detalleVenta.productoId,
          cantidad: detalleVenta.cantidad,
          fraccion: detalleVenta.fraccion,
          fraccionado: productos.fraccionado,
          unidadFraccion: productos.unidadFraccion,
          unidadesPorEnvase: productos.unidadesPorEnvase,
        })
        .from(detalleVenta)
        .innerJoin(productos, eq(productos.id, detalleVenta.productoId))
        .where(eq(detalleVenta.ventaId, id));
      for (const l of lineas) {
        // Unidades sueltas de un producto que ya no es fraccionado: no hay forma de devolverlas como envase.
        if (l.fraccion && !esFraccionado(l)) continue;
        await cambiarStock(tx, {
          productoId: l.productoId,
          ubicacionId: actual.sucursalId,
          delta: unidadesDeLinea(l, l),
          tipo: "anulacion",
          usuarioId: sesion.uid,
          motivo,
          referencia: `Venta #${actual.numeroComprobante}`,
        });
      }
      if (actual.cuponId) {
        await tx
          .update(cupones)
          .set({ usosActuales: sql`greatest(${cupones.usosActuales} - 1, 0)` })
          .where(eq(cupones.id, actual.cuponId));
      }
      // Sus alertas pendientes (QR por confirmar, revisión) ya no aplican.
      await tx
        .update(alertas)
        .set({ resuelta: true, leida: true })
        .where(and(eq(alertas.ventaId, id), inArray(alertas.tipo, ["qr_por_confirmar", "revision_offline"])));
      return actual;
    });

    if (!venta) return fallo("La venta no existe o ya estaba anulada");
    await registrarAuditoria("venta_anulada", {
      usuarioId: sesion.uid,
      detalle: { ventaId: id, numero: venta.numeroComprobante, sucursalId: venta.sucursalId, total: venta.total, motivo },
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
