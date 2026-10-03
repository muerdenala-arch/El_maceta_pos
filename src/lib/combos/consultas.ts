import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, type Db } from "@/db";
import { categorias, comboItems, combos, productos } from "@/db/schema";
import { ErrorStock, type Tx } from "@/lib/inventario/stock";
import { comboVigente, cotizar, COTIZACION_VACIA, type ComboPos, type CotizacionCombos, type ItemCombo, type TipoDescuentoCombo } from "./calculo";

type Ejecutor = Db | Tx;

export type ComboAdmin = ComboPos & {
  fechaInicio: string | null;
  fechaFin: string | null;
  activo: boolean;
};

async function itemsDe(ejecutor: Ejecutor, ids: number[]) {
  if (ids.length === 0) return new Map<number, ItemCombo[]>();
  const filas = await ejecutor
    .select({ comboId: comboItems.comboId, productoId: comboItems.productoId, cantidad: comboItems.cantidad, fraccion: comboItems.fraccion })
    .from(comboItems)
    .where(inArray(comboItems.comboId, ids))
    .orderBy(asc(comboItems.id));
  const porCombo = new Map<number, ItemCombo[]>();
  for (const { comboId, ...item } of filas) porCombo.set(comboId, [...(porCombo.get(comboId) ?? []), item]);
  return porCombo;
}

/** Todos los combos, para el administrador (activos primero). */
export async function listarCombos(): Promise<ComboAdmin[]> {
  const filas = await db.select().from(combos).orderBy(desc(combos.activo), asc(combos.nombre));
  const items = await itemsDe(db, filas.map((c) => c.id));
  return filas.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    descripcion: c.descripcion,
    fotoUrl: c.fotoUrl,
    tipoDescuento: c.tipoDescuento as TipoDescuentoCombo,
    valorDescuento: c.valorDescuento,
    fechaInicio: c.fechaInicio,
    fechaFin: c.fechaFin,
    activo: c.activo,
    items: items.get(c.id) ?? [],
  }));
}

/** Combos vigentes hoy cuyos productos siguen todos activos (para el punto de venta). */
export async function combosPos(hoy: string): Promise<ComboPos[]> {
  const todos = (await listarCombos()).filter((c) => comboVigente(c, hoy) && c.items.length > 0);
  if (todos.length === 0) return [];
  const activos = new Set(
    (
      await db
        .select({ id: productos.id })
        .from(productos)
        .where(and(eq(productos.activo, true), inArray(productos.id, [...new Set(todos.flatMap((c) => c.items.map((i) => i.productoId)))])))
    ).map((p) => p.id),
  );
  return todos
    .filter((c) => c.items.every((i) => activos.has(i.productoId)))
    .map(({ id, nombre, descripcion, fotoUrl, tipoDescuento, valorDescuento, items }) => ({ id, nombre, descripcion, fotoUrl, tipoDescuento, valorDescuento, items }));
}

/**
 * Cotiza los combos de una venta con los precios de la BD: valida que existan, estén vigentes y sus productos
 * activos, y devuelve cada combo con su precio y las líneas por producto (el descuento del combo repartido).
 * `combo` en cada línea es la posición del combo en el resultado. Lanza `ErrorStock` con un mensaje para el cajero.
 */
export async function cotizarCombos(ejecutor: Ejecutor, pedidos: { comboId: number; cantidad: number }[], hoy: string): Promise<CotizacionCombos> {
  if (pedidos.length === 0) return COTIZACION_VACIA;
  const ids = [...new Set(pedidos.map((p) => p.comboId))];
  if (ids.length !== pedidos.length) throw new ErrorStock("Combo repetido en el carrito");

  const filas = await ejecutor.select().from(combos).where(inArray(combos.id, ids));
  const items = await itemsDe(ejecutor, ids);
  const idsProducto = [...new Set([...items.values()].flatMap((is) => is.map((i) => i.productoId)))];
  const catalogo = new Map(
    (idsProducto.length
      ? await ejecutor
          .select({
            id: productos.id,
            nombre: productos.nombre,
            activo: productos.activo,
            precioVenta: productos.precioVenta,
            precioUnidad: productos.precioUnidad,
            fraccionado: productos.fraccionado,
            unidadFraccion: productos.unidadFraccion,
            unidadesPorEnvase: productos.unidadesPorEnvase,
          })
          .from(productos)
          .where(inArray(productos.id, idsProducto))
      : []
    ).map((p) => [p.id, p]),
  );

  for (const pedido of pedidos) {
    const combo = filas.find((c) => c.id === pedido.comboId);
    const suyos = items.get(pedido.comboId) ?? [];
    if (!combo || suyos.length === 0 || !comboVigente(combo, hoy)) {
      throw new ErrorStock(`El combo ${combo ? `"${combo.nombre}" ` : ""}ya no está disponible. Actualiza la pantalla.`);
    }
    for (const i of suyos) {
      const p = catalogo.get(i.productoId);
      if (!p?.activo || (i.fraccion && !(p.fraccionado && (p.unidadesPorEnvase ?? 0) > 1))) {
        throw new ErrorStock(`El combo "${combo.nombre}" tiene un producto que ya no está disponible`);
      }
    }
  }
  return cotizar(
    pedidos,
    filas.map((c) => ({ id: c.id, nombre: c.nombre, tipoDescuento: c.tipoDescuento as TipoDescuentoCombo, valorDescuento: c.valorDescuento, items: items.get(c.id) ?? [] })),
    catalogo,
  );
}

/** Productos activos con sus precios, para armar combos en la pantalla del administrador. */
export async function catalogoParaCombos() {
  return db
    .select({
      id: productos.id,
      nombre: productos.nombre,
      marca: productos.marca,
      sabor: productos.sabor,
      presentacion: productos.presentacion,
      codigoBarras: productos.codigoBarras,
      fotoUrl: productos.fotoUrl,
      precioVenta: productos.precioVenta,
      precioCosto: productos.precioCosto,
      precioUnidad: productos.precioUnidad,
      fraccionado: productos.fraccionado,
      unidadFraccion: productos.unidadFraccion,
      unidadesPorEnvase: productos.unidadesPorEnvase,
      activo: productos.activo,
      categoria: categorias.nombre,
    })
    .from(productos)
    .leftJoin(categorias, eq(categorias.id, productos.categoriaId))
    .where(eq(productos.activo, true))
    .orderBy(asc(productos.nombre));
}
