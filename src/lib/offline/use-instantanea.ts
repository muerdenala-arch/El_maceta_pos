"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect } from "react";
import type { ProductoPos, QrCobro } from "@/lib/caja/consultas";
import type { ComboPos } from "@/lib/combos/calculo";
import { unidadesPedidas } from "@/lib/inventario/fraccion";
import type { Promocion } from "@/lib/promociones/motor";
import { baseLocal, type Instantanea } from "./base";

export type ContextoPos = Omit<Instantanea, "clave" | "productos" | "qrs" | "promociones" | "combos" | "actualizado"> & { generadoEn: number };

/**
 * Copia local del punto de venta:
 * - con datos nuevos del servidor, los guarda restando lo vendido sin conexión que aún no se envió;
 * - si la copia local es más reciente (ventas sin conexión después de cargar), se usa la local.
 */
export function useInstantanea(ctx: ContextoPos, servidor: { productos: ProductoPos[]; qrs: QrCobro[]; promociones: Promocion[]; combos: ComboPos[] }) {
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
        // En unidades de stock: un envase de un producto fraccionado descuenta todas sus unidades sueltas.
        const vendidas = pendientes.flatMap((op) => (op.tipo === "venta" ? op.datos.lineas : []));
        const sinEnviar = new Map(servidor.productos.map((p) => [p.id, unidadesPedidas(vendidas, p)]));
        const { generadoEn, ...resto } = ctx;
        await base.instantaneas.put({
          ...resto,
          clave,
          productos: servidor.productos.map((p) => ({ ...p, stock: p.stock - (sinEnviar.get(p.id) ?? 0) })),
          qrs: servidor.qrs,
          promociones: servidor.promociones,
          combos: servidor.combos,
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
    combos: vigente?.combos ?? servidor.combos,
  };
}
