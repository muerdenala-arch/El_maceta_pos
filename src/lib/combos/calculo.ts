/**
 * Combos de productos (proteína + creatina…). Puro y en centavos exactos; probado en calculo.test.ts.
 * El precio de un combo se calcula siempre con los precios vigentes de sus productos: precio normal (la suma)
 * menos el descuento del combo (porcentaje o monto fijo en Bs).
 */
import { aCentavos, deCentavos } from "@/lib/dinero";
import { unidadesDeLinea, type Fraccionable } from "@/lib/inventario/fraccion";

export type TipoDescuentoCombo = "porcentaje" | "monto";

export type ItemCombo = {
  productoId: number;
  cantidad: number;
  /** Unidades sueltas (cápsulas…) de un producto fraccionado, en vez de envases completos. */
  fraccion: boolean;
};

/** Producto con lo necesario para cotizar y verificar stock. */
export type ProductoCombo = Fraccionable & { id: number; precioVenta: string; precioUnidad: string | null };

export type PrecioCombo = {
  /** Suma de los precios de sus productos. */
  normal: string;
  descuento: string;
  final: string;
  /** Lo que ahorra el cliente, en porcentaje sobre el precio normal (0–100, un decimal). */
  ahorroPorcentaje: number;
};

export const precioItem = (p: { precioVenta: string; precioUnidad: string | null }, fraccion: boolean) => (fraccion ? (p.precioUnidad ?? p.precioVenta) : p.precioVenta);

/** Precio normal, descuento y precio final de UN combo. El descuento nunca supera el precio normal. */
export function precioCombo(items: { precio: string; cantidad: number }[], tipo: TipoDescuentoCombo, valor: string): PrecioCombo {
  const normal = items.reduce((s, i) => s + aCentavos(i.precio) * BigInt(i.cantidad), 0n);
  const pedido = tipo === "porcentaje" ? (normal * aCentavos(valor || "0") + 5000n) / 10000n : aCentavos(valor || "0");
  const descuento = pedido > normal ? normal : pedido < 0n ? 0n : pedido;
  return {
    normal: deCentavos(normal),
    descuento: deCentavos(descuento),
    final: deCentavos(normal - descuento),
    ahorroPorcentaje: normal > 0n ? Math.round((Number(descuento) / Number(normal)) * 1000) / 10 : 0,
  };
}

/**
 * Reparte un descuento total entre líneas en proporción a su importe, al centavo exacto: la suma de las partes
 * es siempre el total (el resto de los redondeos va a las líneas de mayor importe) y ninguna supera su importe.
 */
export function repartirDescuento(importes: string[], descuentoTotal: string): string[] {
  const subtotales = importes.map(aCentavos);
  const suma = subtotales.reduce((s, x) => s + x, 0n);
  let total = aCentavos(descuentoTotal);
  if (total > suma) total = suma;
  if (suma === 0n || total <= 0n) return importes.map(() => "0.00");
  const partes = subtotales.map((s) => (s * total) / suma);
  let resto = total - partes.reduce((s, x) => s + x, 0n);
  const orden = subtotales.map((s, i) => ({ s, i })).sort((a, b) => (a.s > b.s ? -1 : a.s < b.s ? 1 : a.i - b.i));
  for (let k = 0; resto > 0n; k = (k + 1) % orden.length) {
    const { i, s } = orden[k];
    if (partes[i] < s) {
      partes[i] += 1n;
      resto -= 1n;
    }
  }
  return partes.map(deCentavos);
}

/** ¿Está vigente hoy? Las fechas son días de Bolivia (AAAA-MM-DD) y ambas inclusivas; nulas = sin límite. */
export function comboVigente(c: { activo: boolean; fechaInicio: string | null; fechaFin: string | null }, hoy: string) {
  return c.activo && (!c.fechaInicio || hoy >= c.fechaInicio) && (!c.fechaFin || hoy <= c.fechaFin);
}

/** Estado para la lista del administrador. */
export function estadoCombo(c: { activo: boolean; fechaInicio: string | null; fechaFin: string | null }, hoy: string): "activo" | "inactivo" | "programado" | "vencido" {
  if (!c.activo) return "inactivo";
  if (c.fechaInicio && hoy < c.fechaInicio) return "programado";
  if (c.fechaFin && hoy > c.fechaFin) return "vencido";
  return "activo";
}

/** Líneas de venta (por producto) que salen al vender `cantidad` combos. */
export const lineasDeCombo = (items: ItemCombo[], cantidad: number) => items.map((i) => ({ productoId: i.productoId, cantidad: i.cantidad * cantidad, fraccion: i.fraccion }));

/**
 * ¿Cuántos combos alcanzan con el stock disponible? `disponible(productoId)` = unidades de stock que quedan
 * (ya descontado lo demás del carrito). Si falta cualquiera de sus productos, 0: el combo no está disponible.
 */
export function combosDisponibles(items: ItemCombo[], productos: Map<number, ProductoCombo>, disponible: (productoId: number) => number) {
  if (items.length === 0) return 0;
  // Un mismo producto puede venir como envase y como unidad suelta: se suma lo que consume un combo.
  const consumo = new Map<number, number>();
  for (const i of items) {
    const p = productos.get(i.productoId);
    if (!p) return 0;
    consumo.set(i.productoId, (consumo.get(i.productoId) ?? 0) + unidadesDeLinea({ cantidad: i.cantidad, fraccion: i.fraccion }, p));
  }
  let maximo = Infinity;
  for (const [productoId, porCombo] of consumo) maximo = Math.min(maximo, Math.floor(Math.max(0, disponible(productoId)) / porCombo));
  return Number.isFinite(maximo) ? maximo : 0;
}

/** Costo de un combo en centavos (para avisar si se vende por debajo del costo). */
export function costoCombo(items: (ItemCombo & { precioCosto: string; unidadesPorEnvase: number | null })[]) {
  return items.reduce((s, i) => {
    const costo = aCentavos(i.precioCosto) * BigInt(i.cantidad);
    return s + (i.fraccion && i.unidadesPorEnvase && i.unidadesPorEnvase > 1 ? costo / BigInt(i.unidadesPorEnvase) : costo);
  }, 0n);
}

/** Lo mínimo de un combo para cotizarlo. */
export type ComboCotizable = { id: number; nombre: string; tipoDescuento: TipoDescuentoCombo; valorDescuento: string; items: ItemCombo[] };
/** Combo tal como lo necesita el punto de venta (sin costos: lo ve el cajero). */
export type ComboPos = ComboCotizable & { descripcion: string | null; fotoUrl: string | null };
export type ComboVendido = { comboId: number; nombre: string; cantidad: number; precioNormal: string; precioFinal: string };
/** Línea de venta de un producto que sale dentro de un combo; `combo` = posición del combo en la cotización. */
export type LineaDeCombo = { productoId: number; cantidad: number; fraccion: boolean; precioUnitario: string; descuento: string; promocionId: null; combo: number };
export type CotizacionCombos = { combos: ComboVendido[]; lineas: LineaDeCombo[]; subtotal: string; descuento: string; total: string };

export const COTIZACION_VACIA: CotizacionCombos = { combos: [], lineas: [], subtotal: "0.00", descuento: "0.00", total: "0.00" };

/**
 * Cotiza los combos pedidos con los precios de sus productos: cada combo con su precio normal y final, y las líneas
 * por producto con el descuento del combo repartido. Lo usan el punto de venta (vista previa y venta sin conexión)
 * y el servidor (cobro real, con los datos de la BD). Los combos o productos que falten se omiten: validar antes.
 */
export function cotizar(pedidos: { comboId: number; cantidad: number }[], combos: ComboCotizable[], productos: Map<number, ProductoCombo>): CotizacionCombos {
  const vendidos: ComboVendido[] = [];
  const lineas: LineaDeCombo[] = [];
  let subtotal = 0n;
  let descuento = 0n;
  for (const pedido of pedidos) {
    const combo = combos.find((c) => c.id === pedido.comboId);
    if (!combo || pedido.cantidad < 1 || combo.items.length === 0 || combo.items.some((i) => !productos.has(i.productoId))) continue;
    const precios = combo.items.map((i) => ({ precio: precioItem(productos.get(i.productoId)!, i.fraccion), cantidad: i.cantidad }));
    const precio = precioCombo(precios, combo.tipoDescuento, combo.valorDescuento);
    const indice = vendidos.push({ comboId: combo.id, nombre: combo.nombre, cantidad: pedido.cantidad, precioNormal: precio.normal, precioFinal: precio.final }) - 1;

    const partes = lineasDeCombo(combo.items, pedido.cantidad).map((l, k) => ({ ...l, precioUnitario: precios[k].precio }));
    const descuentoTotal = aCentavos(precio.descuento) * BigInt(pedido.cantidad);
    const reparto = repartirDescuento(
      partes.map((l) => deCentavos(aCentavos(l.precioUnitario) * BigInt(l.cantidad))),
      deCentavos(descuentoTotal),
    );
    partes.forEach((l, k) => lineas.push({ ...l, descuento: reparto[k], promocionId: null, combo: indice }));
    subtotal += aCentavos(precio.normal) * BigInt(pedido.cantidad);
    descuento += descuentoTotal;
  }
  return { combos: vendidos, lineas, subtotal: deCentavos(subtotal), descuento: deCentavos(descuento), total: deCentavos(subtotal - descuento) };
}
