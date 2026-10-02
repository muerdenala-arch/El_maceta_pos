/**
 * Cálculo completo de una venta (puro, en centavos exactos; probado en venta.test.ts). Lo usan el punto de venta
 * (vista previa) y el servidor (cobro real, con los datos de la BD). Orden de los descuentos:
 *
 * 1. Promociones automáticas sobre los productos sueltos (motor.ts) y descuento propio de cada combo.
 * 2. Cupón (porcentaje, o monto fijo en Bs **una sola vez** repartido entre lo que cubre):
 *    - si "se acumula con descuentos automáticos", se calcula sobre lo que queda después de ellos y se suma;
 *    - si no, en cada producto queda el mayor de los dos (cupón o automático), nunca ambos;
 *    - los productos de un combo solo entran si el cupón "se acumula con combos";
 *    - exige el monto mínimo de compra (el total antes del cupón) y solo se gasta si descuenta algo.
 * 3. Descuento manual del cajero: porcentaje sobre el total que queda, repartido entre todas las líneas.
 */
import { repartirDescuento, type CotizacionCombos } from "@/lib/combos/calculo";
import { aCentavos, deCentavos } from "@/lib/dinero";
import { aplicarPromociones, type LineaCarrito, type Promocion } from "./motor";

/** Cupón tal como lo necesita el cálculo (el servidor ya validó vigencia, usos y sucursal). */
export type CuponVenta = {
  id: number;
  codigo: string;
  tipo: "porcentaje" | "monto";
  valor: string;
  montoMinimo: string;
  alcance: "todo" | "productos" | "categorias";
  productoIds: number[];
  categoriaIds: number[];
  acumulaPromociones: boolean;
  acumulaCombos: boolean;
};

export type LineaVenta = {
  productoId: number;
  cantidad: number;
  fraccion: boolean;
  precioUnitario: string;
  /** Precio × cantidad. */
  subtotal: string;
  /** Promoción automática, o la parte del descuento del combo si la línea es de un combo. */
  descuentoPromocion: string;
  descuentoCupon: string;
  descuentoManual: string;
  /** Suma de los tres. */
  descuento: string;
  total: string;
  promocionId: number | null;
  promocion: string | null;
  /** Posición del combo al que pertenece (null = producto suelto). */
  combo: number | null;
};

export type EstadoCupon =
  | { estado: "aplicado"; descuento: string }
  /** Válido, pero en este carrito no descuenta nada (otro descuento es mejor): no se gasta. */
  | { estado: "sin_efecto" }
  | { estado: "no_aplica" }
  | { estado: "minimo"; faltan: string };

export type CalculoVenta = {
  /** Primero los productos sueltos (en el orden recibido) y después los de los combos. */
  lineas: LineaVenta[];
  subtotal: string;
  descuentoPromociones: string;
  descuentoCombos: string;
  descuentoCupon: string;
  descuentoManual: string;
  descuento: string;
  total: string;
  cupon: EstadoCupon | null;
  promocionesAplicadas: { promocionId: number; nombre: string; descuento: string }[];
};

type Entrada = {
  lineas: LineaCarrito[];
  combos: CotizacionCombos;
  promociones: Promocion[];
  cupon?: CuponVenta | null;
  /** Descuento manual del cajero, en porcentaje (0–100). */
  manualPorcentaje?: string | null;
  /** Categoría de cada producto que viene dentro de un combo (para cupones por categoría). */
  categoriaDe?: (productoId: number) => number | null;
};

const cubre = (c: CuponVenta, productoId: number, categoriaId: number | null) =>
  c.alcance === "todo" ? true : c.alcance === "productos" ? c.productoIds.includes(productoId) : categoriaId !== null && c.categoriaIds.includes(categoriaId);

/** round(base × porcentaje / 100) en centavos, mitad hacia arriba. `porcentaje` como "12.5". */
const porcentajeDe = (base: bigint, porcentaje: string) => (base * aCentavos(porcentaje || "0") + 5000n) / 10000n;

export function calcularVenta({ lineas, combos, promociones, cupon = null, manualPorcentaje = null, categoriaDe = () => null }: Entrada): CalculoVenta {
  const automaticas = aplicarPromociones(lineas, promociones);

  type Trabajo = { productoId: number; cantidad: number; fraccion: boolean; precioUnitario: string; categoriaId: number | null; sub: bigint; promo: bigint; cupon: bigint; manual: bigint; promocionId: number | null; promocion: string | null; combo: number | null };
  const filas: Trabajo[] = [
    ...automaticas.lineas.map((l) => ({
      productoId: l.productoId,
      cantidad: l.cantidad,
      fraccion: !!l.fraccion,
      precioUnitario: l.precioUnitario,
      categoriaId: l.categoriaId,
      sub: aCentavos(l.subtotal),
      promo: aCentavos(l.descuento),
      cupon: 0n,
      manual: 0n,
      promocionId: l.promocionId,
      promocion: l.promocion,
      combo: null,
    })),
    ...combos.lineas.map((l) => ({
      productoId: l.productoId,
      cantidad: l.cantidad,
      fraccion: l.fraccion,
      precioUnitario: l.precioUnitario,
      categoriaId: categoriaDe(l.productoId),
      sub: aCentavos(l.precioUnitario) * BigInt(l.cantidad),
      promo: aCentavos(l.descuento),
      cupon: 0n,
      manual: 0n,
      promocionId: null,
      promocion: null,
      combo: l.combo,
    })),
  ];

  // ---- Cupón
  let estadoCupon: EstadoCupon | null = null;
  if (cupon) {
    const antesDelCupon = filas.reduce((s, f) => s + f.sub - f.promo, 0n);
    const elegibles = filas.filter((f) => (f.combo === null || cupon.acumulaCombos) && cubre(cupon, f.productoId, f.categoriaId) && f.sub > 0n);
    if (elegibles.length === 0) estadoCupon = { estado: "no_aplica" };
    else if (antesDelCupon < aCentavos(cupon.montoMinimo)) estadoCupon = { estado: "minimo", faltan: deCentavos(aCentavos(cupon.montoMinimo) - antesDelCupon) };
    else {
      // Sobre qué se calcula en cada línea: lo que queda tras su descuento, salvo que compita con el automático.
      const compite = (f: Trabajo) => f.combo === null && !cupon.acumulaPromociones;
      const bases = elegibles.map((f) => (compite(f) ? f.sub : f.sub - f.promo));
      const propuestos =
        cupon.tipo === "porcentaje"
          ? bases.map((b) => porcentajeDe(b, cupon.valor))
          : repartirDescuento(bases.map(deCentavos), cupon.valor).map(aCentavos);
      elegibles.forEach((f, i) => {
        if (compite(f)) {
          // No se acumula: en cada producto queda el mayor de los dos.
          if (propuestos[i] > f.promo) {
            f.cupon = propuestos[i];
            f.promo = 0n;
            f.promocionId = null;
            f.promocion = null;
          }
        } else {
          f.cupon = propuestos[i];
        }
      });
      const total = filas.reduce((s, f) => s + f.cupon, 0n);
      estadoCupon = total > 0n ? { estado: "aplicado", descuento: deCentavos(total) } : { estado: "sin_efecto" };
    }
  }

  // ---- Descuento manual: porcentaje sobre lo que queda, repartido entre las líneas.
  const netos = filas.map((f) => f.sub - f.promo - f.cupon);
  const manualTotal = manualPorcentaje && Number(manualPorcentaje) > 0 ? porcentajeDe(netos.reduce((s, n) => s + n, 0n), manualPorcentaje) : 0n;
  if (manualTotal > 0n) {
    repartirDescuento(netos.map(deCentavos), deCentavos(manualTotal)).forEach((parte, i) => {
      filas[i].manual = aCentavos(parte);
    });
  }

  const suma = (f: (t: Trabajo) => bigint, filtro: (t: Trabajo) => boolean = () => true) => filas.filter(filtro).reduce((s, t) => s + f(t), 0n);
  const subtotal = suma((t) => t.sub);
  const descuento = suma((t) => t.promo + t.cupon + t.manual);

  // Promociones que quedaron aplicadas (tras el cupón pueden ser menos que las del motor).
  const porPromo = new Map<number, { nombre: string; total: bigint }>();
  for (const f of filas) {
    if (f.promocionId === null || f.promo <= 0n) continue;
    porPromo.set(f.promocionId, { nombre: f.promocion ?? "", total: (porPromo.get(f.promocionId)?.total ?? 0n) + f.promo });
  }

  return {
    lineas: filas.map((f) => ({
      productoId: f.productoId,
      cantidad: f.cantidad,
      fraccion: f.fraccion,
      precioUnitario: f.precioUnitario,
      subtotal: deCentavos(f.sub),
      descuentoPromocion: deCentavos(f.promo),
      descuentoCupon: deCentavos(f.cupon),
      descuentoManual: deCentavos(f.manual),
      descuento: deCentavos(f.promo + f.cupon + f.manual),
      total: deCentavos(f.sub - f.promo - f.cupon - f.manual),
      promocionId: f.promo > 0n ? f.promocionId : null,
      promocion: f.promo > 0n ? f.promocion : null,
      combo: f.combo,
    })),
    subtotal: deCentavos(subtotal),
    descuentoPromociones: deCentavos(suma((t) => t.promo, (t) => t.combo === null)),
    descuentoCombos: deCentavos(suma((t) => t.promo, (t) => t.combo !== null)),
    descuentoCupon: deCentavos(suma((t) => t.cupon)),
    descuentoManual: deCentavos(suma((t) => t.manual)),
    descuento: deCentavos(descuento),
    total: deCentavos(subtotal - descuento),
    cupon: estadoCupon,
    promocionesAplicadas: [...porPromo].map(([promocionId, p]) => ({ promocionId, nombre: p.nombre, descuento: deCentavos(p.total) })),
  };
}

/** Mensaje para el cajero según el resultado del cupón en el carrito. */
export function mensajeCupon(e: EstadoCupon, formato: (monto: string) => string) {
  if (e.estado === "aplicado") return `Cupón válido: descuenta ${formato(e.descuento)}`;
  if (e.estado === "minimo") return `Monto mínimo no alcanzado: faltan ${formato(e.faltan)}`;
  if (e.estado === "no_aplica") return "No aplica a los productos de esta venta";
  return "No mejora los descuentos que ya tiene esta venta: no se usará";
}
