import "server-only";
import { and, eq, gt, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { alertas, inventario, lotes, productos, sucursales } from "@/db/schema";
import { diasParaVencer } from "@/lib/inventario/lotes";
import type { Tx } from "@/lib/inventario/stock";
import { hoyEnBolivia } from "@/lib/formato";
import { conciliarAlertasEventos } from "@/lib/eventos/alertas";
import { esFraccionado, minimoEnUnidades, nombreEnvase, textoStock } from "@/lib/inventario/fraccion";
import { alertaDeStock, DIAS_AVISO_VENCIMIENTO } from "./reglas";
import { conciliarAlertasCajas } from "@/lib/caja/alertas";
import { programarDespacho } from "@/lib/notificaciones/despacho";

type Ejecutor = Db | Tx;
type Deseada = { tipo: "stock_bajo" | "agotado" | "por_vencer"; productoId: number; sucursalId: number; mensaje: string };

const clave = (a: { tipo: string; productoId: number | null; sucursalId: number | null }) => `${a.tipo}:${a.productoId}:${a.sucursalId}`;

/**
 * Deja la tabla de alertas igual a lo que corresponde: crea las que faltan, actualiza el mensaje de
 * las vigentes y marca como resueltas las que ya no aplican (p. ej. el stock volvió a superar el mínimo).
 */
async function conciliar(ejecutor: Ejecutor, tipos: Deseada["tipo"][], deseadas: Deseada[], filtro?: { productoId: number; sucursalId: number }) {
  const existentes = await ejecutor
    .select({ id: alertas.id, tipo: alertas.tipo, productoId: alertas.productoId, sucursalId: alertas.sucursalId, mensaje: alertas.mensaje })
    .from(alertas)
    .where(
      and(
        inArray(alertas.tipo, tipos),
        eq(alertas.resuelta, false),
        filtro ? and(eq(alertas.productoId, filtro.productoId), eq(alertas.sucursalId, filtro.sucursalId)) : undefined,
      ),
    );
  const porClave = new Map(existentes.map((e) => [clave(e), e]));
  const quedan = new Set<string>();

  for (const d of deseadas) {
    const k = clave(d);
    quedan.add(k);
    const e = porClave.get(k);
    if (!e) await ejecutor.insert(alertas).values(d);
    else if (e.mensaje !== d.mensaje) await ejecutor.update(alertas).set({ mensaje: d.mensaje }).where(eq(alertas.id, e.id));
  }
  const resolver = existentes.filter((e) => !quedan.has(clave(e))).map((e) => e.id);
  if (resolver.length) await ejecutor.update(alertas).set({ resuelta: true }).where(inArray(alertas.id, resolver));
}

/**
 * Alertas de stock (bajo el mínimo / agotado) y de stock negativo, para un producto en una ubicación
 * o para todo el inventario. La llama cambiarStock tras cada movimiento (misma transacción).
 */
export async function conciliarAlertasStock(ejecutor: Ejecutor, filtro?: { productoId: number; sucursalId: number }) {
  const filas = await ejecutor
    .select({
      productoId: inventario.productoId,
      sucursalId: inventario.ubicacionId,
      cantidad: inventario.cantidad,
      minimo: productos.stockMinimo,
      producto: productos.nombre,
      ubicacion: sucursales.nombre,
      fraccionado: productos.fraccionado,
      unidadFraccion: productos.unidadFraccion,
      unidadesPorEnvase: productos.unidadesPorEnvase,
    })
    .from(inventario)
    .innerJoin(productos, eq(productos.id, inventario.productoId))
    .innerJoin(sucursales, eq(sucursales.id, inventario.ubicacionId))
    .where(
      and(
        eq(productos.activo, true),
        eq(sucursales.activo, true),
        filtro ? and(eq(inventario.productoId, filtro.productoId), eq(inventario.ubicacionId, filtro.sucursalId)) : undefined,
      ),
    );

  const deseadas: Deseada[] = [];
  for (const f of filas) {
    // El mínimo se define en envases; el stock de un producto fraccionado está en unidades sueltas.
    const tipo = alertaDeStock(f.cantidad, minimoEnUnidades({ ...f, stockMinimo: f.minimo }));
    if (!tipo) continue;
    const fraccion = esFraccionado(f);
    deseadas.push({
      tipo,
      productoId: f.productoId,
      sucursalId: f.sucursalId,
      mensaje:
        tipo === "agotado"
          ? `${f.producto} está agotado en ${f.ubicacion}`
          : `${f.producto}: quedan ${fraccion ? textoStock(f.cantidad, f) : f.cantidad} en ${f.ubicacion} (mínimo ${f.minimo}${fraccion ? ` ${nombreEnvase(f, f.minimo)}` : ""})`,
    });
  }
  await conciliar(ejecutor, ["stock_bajo", "agotado"], deseadas, filtro);

  // El stock negativo (ventas sin conexión) se resuelve solo cuando alguien lo corrige.
  const corregidos = filas.filter((f) => f.cantidad >= 0);
  for (const f of corregidos) {
    await ejecutor
      .update(alertas)
      .set({ resuelta: true })
      .where(
        and(eq(alertas.tipo, "stock_negativo"), eq(alertas.resuelta, false), eq(alertas.productoId, f.productoId), eq(alertas.sucursalId, f.sucursalId)),
      );
  }
}

/** Productos que vencen en ≤ 30 días (o ya vencidos) por ubicación. */
export async function conciliarAlertasVencimiento(ejecutor: Ejecutor = db) {
  const hoy = hoyEnBolivia();
  const limite = new Date(Date.parse(`${hoy}T00:00:00Z`) + DIAS_AVISO_VENCIMIENTO * 86_400_000).toISOString().slice(0, 10);
  const filas = await ejecutor
    .select({
      productoId: lotes.productoId,
      sucursalId: lotes.ubicacionId,
      vence: sql<string>`min(${lotes.fechaVencimiento})::text`,
      cantidad: sql<number>`sum(${lotes.cantidad})::int`,
      producto: productos.nombre,
      ubicacion: sucursales.nombre,
    })
    .from(lotes)
    .innerJoin(productos, eq(productos.id, lotes.productoId))
    .innerJoin(sucursales, eq(sucursales.id, lotes.ubicacionId))
    .where(and(gt(lotes.cantidad, 0), isNotNull(lotes.fechaVencimiento), lte(lotes.fechaVencimiento, limite), eq(sucursales.activo, true)))
    .groupBy(lotes.productoId, lotes.ubicacionId, productos.nombre, sucursales.nombre);

  const deseadas: Deseada[] = filas.map((f) => {
    const dias = diasParaVencer(f.vence, hoy);
    const cuando = dias < 0 ? `vencieron hace ${-dias} día${dias === -1 ? "" : "s"}` : dias === 0 ? "vencen hoy" : `vencen en ${dias} día${dias === 1 ? "" : "s"}`;
    return {
      tipo: "por_vencer" as const,
      productoId: f.productoId,
      sucursalId: f.sucursalId,
      mensaje: `${f.producto}: ${f.cantidad} unidad${f.cantidad === 1 ? "" : "es"} ${cuando} en ${f.ubicacion}`,
    };
  });
  await conciliar(ejecutor, ["por_vencer"], deseadas);
}

let ultimaConciliacion = 0;
const CADA_MS = 5 * 60_000;

/**
 * Conciliación completa (inventario entero + vencimientos), como máximo cada 5 minutos por servidor.
 * Cubre lo que no genera un movimiento: el paso de los días (vencimientos) o cambios de stock mínimo.
 */
export async function conciliarAlertasSiCorresponde(forzar = false) {
  if (!forzar && Date.now() - ultimaConciliacion < CADA_MS) return;
  ultimaConciliacion = Date.now();
  await conciliarAlertasStock(db);
  await conciliarAlertasVencimiento(db);
  await conciliarAlertasEventos(db);
  await conciliarAlertasCajas(db);
  programarDespacho();
}
