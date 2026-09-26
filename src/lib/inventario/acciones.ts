"use server";

import { and, eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { alertas, detalleTransferencia, inventario, productos, sucursales, transferencias } from "@/db/schema";
import { conPermiso, exito, fallo, falloValidacion, type Resultado } from "@/lib/acciones/resultado";
import { registrarAuditoria } from "@/lib/auditoria";
import { autorizar } from "@/lib/auth/sesion";
import { idPositivo } from "@/lib/validaciones/comunes";
import {
  esquemaAjuste,
  esquemaIngreso,
  esquemaTransferencia,
  type DatosAjuste,
  type DatosIngreso,
  type DatosTransferencia,
} from "@/lib/validaciones/inventario";
import { completarLotes } from "./lotes";
import { cambiarStock, ErrorStock } from "./stock";

async function ubicacionActiva(id: number) {
  const [u] = await db
    .select({ id: sucursales.id, nombre: sucursales.nombre })
    .from(sucursales)
    .where(and(eq(sucursales.id, id), eq(sucursales.activo, true)));
  return u ?? null;
}

async function productosExisten(ids: number[]) {
  const unicos = [...new Set(ids)];
  const encontrados = await db.select({ id: productos.id }).from(productos).where(inArray(productos.id, unicos));
  return encontrados.length === unicos.length;
}

/** Ejecuta la operación y convierte los errores de negocio de stock en un mensaje para el usuario. */
async function conStock(fn: () => Promise<Resultado>): Promise<Resultado> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ErrorStock) return fallo(e.message);
    throw e;
  }
}

/** Ingreso de mercadería (compra a proveedor) a la bodega o a una sucursal, con vencimientos. */
export async function registrarIngreso(entrada: DatosIngreso): Promise<Resultado> {
  return conPermiso(() =>
    conStock(async () => {
      const sesion = await autorizar("admin");
      const v = esquemaIngreso.safeParse(entrada);
      if (!v.success) return falloValidacion(v.error);
      const d = v.data;
      const destino = await ubicacionActiva(d.ubicacionId);
      if (!destino) return fallo("Revisa los datos marcados", { ubicacionId: "Ubicación inválida o inactiva" });
      if (!(await productosExisten(d.lineas.map((l) => l.productoId)))) return fallo("Algún producto ya no existe");

      const motivo = ["Compra", d.proveedor && `a ${d.proveedor}`, d.documento && `· Doc. ${d.documento}`].filter(Boolean).join(" ");
      // Se agrupan por producto: un movimiento por producto, con todos sus vencimientos.
      const porProducto = new Map<number, { vencimiento: string | null; cantidad: number }[]>();
      for (const l of d.lineas) {
        porProducto.set(l.productoId, [...(porProducto.get(l.productoId) ?? []), { vencimiento: l.fechaVencimiento, cantidad: l.cantidad }]);
      }

      await db.transaction(async (tx) => {
        for (const [productoId, partes] of porProducto) {
          await cambiarStock(tx, {
            productoId,
            ubicacionId: d.ubicacionId,
            delta: partes.reduce((s, p) => s + p.cantidad, 0),
            tipo: "ingreso",
            usuarioId: sesion.uid,
            motivo,
            lotesEntrada: partes,
          });
        }
      });
      await registrarAuditoria("ingreso_mercaderia", {
        usuarioId: sesion.uid,
        detalle: { ubicacionId: d.ubicacionId, proveedor: d.proveedor, documento: d.documento, lineas: d.lineas },
      });
      refresh();
      return exito();
    }),
  );
}

/** Ajuste manual a una cantidad contada; el motivo es obligatorio y queda en auditoría. */
export async function ajustarStock(entrada: DatosAjuste): Promise<Resultado> {
  return conPermiso(() =>
    conStock(async () => {
      const sesion = await autorizar("admin");
      const v = esquemaAjuste.safeParse(entrada);
      if (!v.success) return falloValidacion(v.error);
      const d = v.data;
      if (!(await ubicacionActiva(d.ubicacionId))) return fallo("Ubicación inválida o inactiva");
      if (!(await productosExisten([d.productoId]))) return fallo("El producto ya no existe");

      const resultado = await db.transaction(async (tx) => {
        const [actual] = await tx
          .select({ cantidad: inventario.cantidad })
          .from(inventario)
          .where(and(eq(inventario.productoId, d.productoId), eq(inventario.ubicacionId, d.ubicacionId)))
          .for("update");
        const antes = actual?.cantidad ?? 0;
        const delta = d.cantidadNueva - antes;
        if (delta === 0) return { antes, delta };
        await cambiarStock(tx, {
          productoId: d.productoId,
          ubicacionId: d.ubicacionId,
          delta,
          tipo: "ajuste",
          usuarioId: sesion.uid,
          motivo: d.motivo,
          // Un ajuste corrige stock que pudo quedar negativo por ventas offline.
          permitirNegativo: true,
          lotesEntrada: delta > 0 ? [{ vencimiento: d.fechaVencimiento, cantidad: delta }] : undefined,
        });
        return { antes, delta };
      });

      if (resultado.delta === 0) return fallo("La cantidad es la misma que la actual: no hay nada que ajustar");
      await registrarAuditoria("ajuste_stock", {
        usuarioId: sesion.uid,
        detalle: { productoId: d.productoId, ubicacionId: d.ubicacionId, antes: resultado.antes, despues: d.cantidadNueva, motivo: d.motivo },
      });
      refresh();
      return exito();
    }),
  );
}

/** Envía mercadería: sale del origen al instante (queda "en camino") y entra al destino al recibirla. */
export async function crearTransferencia(entrada: DatosTransferencia): Promise<Resultado> {
  return conPermiso(() =>
    conStock(async () => {
      const sesion = await autorizar("admin");
      const v = esquemaTransferencia.safeParse(entrada);
      if (!v.success) return falloValidacion(v.error);
      const d = v.data;
      const [origen, destino] = await Promise.all([ubicacionActiva(d.origenId), ubicacionActiva(d.destinoId)]);
      if (!origen) return fallo("Revisa los datos marcados", { origenId: "Origen inválido o inactivo" });
      if (!destino) return fallo("Revisa los datos marcados", { destinoId: "Destino inválido o inactivo" });
      if (!(await productosExisten(d.lineas.map((l) => l.productoId)))) return fallo("Algún producto ya no existe");

      const id = await db.transaction(async (tx) => {
        const [t] = await tx
          .insert(transferencias)
          .values({ origenId: d.origenId, destinoId: d.destinoId, usuarioEnviaId: sesion.uid, nota: d.nota })
          .returning({ id: transferencias.id });
        for (const l of d.lineas) {
          const { lotesSalida } = await cambiarStock(tx, {
            productoId: l.productoId,
            ubicacionId: d.origenId,
            delta: -l.cantidad,
            tipo: "transferencia_salida",
            usuarioId: sesion.uid,
            motivo: `Envío a ${destino.nombre}`,
            referencia: `T-${t.id}`,
          });
          await tx.insert(detalleTransferencia).values({
            transferenciaId: t.id,
            productoId: l.productoId,
            cantidad: l.cantidad,
            lotes: completarLotes(lotesSalida, l.cantidad),
          });
        }
        if (d.alertaId) {
          await tx
            .update(alertas)
            .set({ resuelta: true, leida: true })
            .where(and(eq(alertas.id, d.alertaId), eq(alertas.tipo, "solicitud_reposicion")));
        }
        return t.id;
      });

      await registrarAuditoria("transferencia_enviada", { usuarioId: sesion.uid, detalle: { id, ...d } });
      refresh();
      return exito();
    }),
  );
}

/** Recibir (entra al destino) o cancelar (vuelve al origen) una transferencia en camino. */
async function cerrarTransferencia(entrada: { id: number }, accion: "recibir" | "cancelar"): Promise<Resultado> {
  return conPermiso(() =>
    conStock(async () => {
      const sesion = await autorizar("admin");
      const id = idPositivo.parse(entrada.id);

      const ok = await db.transaction(async (tx) => {
        // Bloquea la fila: dos clics simultáneos no pueden recibirla dos veces.
        const [t] = await tx.select().from(transferencias).where(eq(transferencias.id, id)).for("update");
        if (!t || t.estado !== "enviada") return false;
        const ubicacionId = accion === "recibir" ? t.destinoId : t.origenId;
        const [otra] = await tx
          .select({ nombre: sucursales.nombre })
          .from(sucursales)
          .where(eq(sucursales.id, accion === "recibir" ? t.origenId : t.destinoId));

        const lineas = await tx.select().from(detalleTransferencia).where(eq(detalleTransferencia.transferenciaId, id));
        for (const l of lineas) {
          await cambiarStock(tx, {
            productoId: l.productoId,
            ubicacionId,
            delta: l.cantidad,
            tipo: "transferencia_entrada",
            usuarioId: sesion.uid,
            motivo: accion === "recibir" ? `Recibido de ${otra?.nombre ?? "origen"}` : `Transferencia cancelada (no llegó a ${otra?.nombre ?? "destino"})`,
            referencia: `T-${id}`,
            lotesEntrada: completarLotes(l.lotes, l.cantidad),
          });
        }
        await tx
          .update(transferencias)
          .set({ estado: accion === "recibir" ? "recibida" : "cancelada", usuarioRecibeId: sesion.uid, recibidaEn: new Date() })
          .where(eq(transferencias.id, id));
        return true;
      });

      if (!ok) return fallo("Esta transferencia ya fue recibida o cancelada");
      await registrarAuditoria(accion === "recibir" ? "transferencia_recibida" : "transferencia_cancelada", {
        usuarioId: sesion.uid,
        detalle: { id },
      });
      refresh();
      return exito();
    }),
  );
}

export async function recibirTransferencia(entrada: { id: number }) {
  return cerrarTransferencia(entrada, "recibir");
}

export async function cancelarTransferencia(entrada: { id: number }) {
  return cerrarTransferencia(entrada, "cancelar");
}

/** Marca como atendida una solicitud de reposición sin crear transferencia. */
export async function resolverSolicitud(entrada: { id: number }): Promise<Resultado> {
  return conPermiso(async () => {
    await autorizar("admin");
    const id = idPositivo.parse(entrada.id);
    await db
      .update(alertas)
      .set({ resuelta: true, leida: true })
      .where(and(eq(alertas.id, id), eq(alertas.tipo, "solicitud_reposicion")));
    refresh();
    return exito();
  });
}
