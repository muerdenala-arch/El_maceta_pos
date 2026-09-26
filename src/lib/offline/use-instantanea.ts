"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect } from "react";
import type { ProductoPos, QrCobro } from "@/lib/caja/consultas";
import type { Promocion } from "@/lib/promociones/motor";
import { baseLocal, type Instantanea } from "./base";

export type ContextoPos = Omit<Instantanea, "clave" | "productos" | "qrs" | "promociones" | "actualizado"> & { generadoEn: number };

/**
 * Copia local del punto de venta:
 * - con datos nuevos del servidor, los guarda restando lo vendido sin conexión que aún no se envió;
 * - si la copia local es más reciente (ventas sin conexión después de cargar), se usa la local.
 */
export function useInstantanea(ctx: ContextoPos, servidor: { productos: ProductoPos[]; qrs: QrCobro[]; promociones: Promocion[] }) {
  const clave = `pos:${ctx.usuarioId}`;

  useEffect(() => {
    (async () => {
      try {
        const base = baseLocal();
        const actual = await base.instantaneas.get(clave);
        if (actual && actual.cajaId === ctx.cajaId && actual.actualizado >= ctx.generadoEn) return;
        const pendientes = await base.cola
          .where("usuarioId")
          .equals(ctx.usuarioId)
          .filter((o) => o.tipo === "venta" && o.estado === "pendiente")
          .toArray();
        const sinEnviar = new Map<number, number>();
        for (const op of pendientes) {
          if (op.tipo !== "venta") continue;
          for (const l of op.datos.lineas) sinEnviar.set(l.productoId, (sinEnviar.get(l.productoId) ?? 0) + l.cantidad);
        }
        const { generadoEn, ...resto } = ctx;
        await base.instantaneas.put({
          ...resto,
          clave,
          productos: servidor.productos.map((p) => ({ ...p, stock: p.stock - (sinEnviar.get(p.id) ?? 0) })),
          qrs: servidor.qrs,
          promociones: servidor.promociones,
          actualizado: generadoEn,
        });
      } catch {
        // Sin IndexedDB (navegación privada estricta): se trabaja solo con los datos del servidor.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se guarda una vez por cada carga del servidor
  }, [ctx.generadoEn, clave]);

  const local = useLiveQuery(async () => {
    try {
      return (await baseLocal().instantaneas.get(clave)) ?? null;
    } catch {
      return null;
    }
  }, [clave]);

  const vigente = local && local.cajaId === ctx.cajaId ? local : null;
  return {
    instantanea: vigente,
    productos: vigente?.productos ?? servidor.productos,
    qrs: vigente?.qrs ?? servidor.qrs,
    promociones: vigente?.promociones ?? servidor.promociones,
  };
}
