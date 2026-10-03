/**
 * Motor de promociones (puro, en centavos exactos; probado en motor.test.ts).
 * Lo usa el punto de venta para mostrar el descuento y el servidor para cobrarlo:
 * el servidor siempre recalcula con las promociones vigentes de la BD.
 *
 * Reglas de negocio:
 * - No se acumulan: cada línea recibe como máximo UNA promoción. Se asignan de forma codiciosa:
 *   primero la promoción que más descuenta en total, luego la siguiente sobre las líneas libres, etc.
 *   Un cupón compite igual que las automáticas.
 * - Porcentaje: % sobre el subtotal de cada línea elegible (redondeo al centavo, mitad hacia arriba).
 * - Monto fijo: Bs por unidad elegible, nunca más que el precio.
 * - Combo "lleva N paga M": se juntan las unidades elegibles; por cada N se regalan N−M,
 *   siempre las más baratas.
 * - Las líneas vendidas por unidad suelta (venta fraccionada) no reciben promociones.
 */
import { aCentavos, deCentavos } from "@/lib/dinero";

export type Promocion = {
  id: number;
  nombre: string;
  tipo: "porcentaje" | "monto_fijo" | "combo";
  /** Porcentaje (0–100) o Bs por unidad, según `tipo`. No se usa en combos. */
  valor: string;
  comboLleva: number | null;
  comboPaga: number | null;
  alcance: "todo" | "producto" | "categoria" | "sucursal";
  /** Con alcance "producto" / "categoria": a cuáles aplica (uno o varios). */
  productoIds?: number[];
  categoriaIds?: number[];
  /** Forma antigua (uno solo): la traen las copias sin conexión guardadas antes del cambio. */
  productoId?: number | null;
  categoriaId?: number | null;
  /** Si llegó por un cupón. */
  cuponId?: number | null;
};

export type LineaCarrito = {
  productoId: number;
  categoriaId: number | null;
  cantidad: number;
  precioUnitario: string;
  /** Venta por unidad suelta (cápsulas…): no participa en promociones (están pensadas para el envase completo). */
  fraccion?: boolean;
};

export type LineaConDescuento = LineaCarrito & {
  subtotal: string;
  descuento: string;
  total: string;
  promocionId: number | null;
  promocion: string | null;
};

export type ResultadoPromociones = {
  lineas: LineaConDescuento[];
  subtotal: string;
  descuento: string;
  total: string;
  aplicadas: { promocionId: number; nombre: string; descuento: string; cuponId: number | null }[];
};

export function aplicaA(p: Promocion, l: LineaCarrito) {
  if (l.fraccion) return false;
  if (p.alcance === "producto") return l.productoId === p.productoId || !!p.productoIds?.includes(l.productoId);
  if (p.alcance === "categoria") return l.categoriaId !== null && (l.categoriaId === p.categoriaId || !!p.categoriaIds?.includes(l.categoriaId));
  return true; // todo / sucursal (la sucursal se filtra antes de llegar aquí)
}

/** Descuento (centavos) que da `p` a cada una de las líneas indicadas (índice → centavos). */
function descuentosDe(p: Promocion, lineas: LineaCarrito[], indices: number[]): Map<number, bigint> {
  const r = new Map<number, bigint>();
  if (p.tipo === "porcentaje") {
    const puntosBasicos = aCentavos(p.valor); // 12.5 % → 1250
    for (const i of indices) {
      const sub = aCentavos(lineas[i].precioUnitario) * BigInt(lineas[i].cantidad);
      r.set(i, (sub * puntosBasicos + 5000n) / 10000n);
    }
  } else if (p.tipo === "monto_fijo") {
    const porUnidad = aCentavos(p.valor);
    for (const i of indices) {
      const precio = aCentavos(lineas[i].precioUnitario);
      r.set(i, (porUnidad < precio ? porUnidad : precio) * BigInt(lineas[i].cantidad));
    }
  } else {
    const lleva = p.comboLleva ?? 0;
    const paga = p.comboPaga ?? 0;
    if (lleva < 2 || paga < 1 || paga >= lleva) return r;
    const unidades = indices.flatMap((i) => Array.from({ length: lineas[i].cantidad }, () => ({ i, precio: aCentavos(lineas[i].precioUnitario) })));
    const gratis = Math.floor(unidades.length / lleva) * (lleva - paga);
    unidades.sort((a, b) => (a.precio < b.precio ? -1 : a.precio > b.precio ? 1 : a.i - b.i));
    for (const i of indices) r.set(i, 0n);
    for (const u of unidades.slice(0, gratis)) r.set(u.i, r.get(u.i)! + u.precio);
  }
  return r;
}

export function aplicarPromociones(lineas: LineaCarrito[], promociones: Promocion[]): ResultadoPromociones {
  const asignada = new Map<number, { promo: Promocion; descuento: bigint }>();
  const libres = new Set(lineas.map((_, i) => i));
  const disponibles = [...promociones];

  // Codicioso: en cada vuelta gana la promoción que más descuenta sobre las líneas aún libres.
  while (libres.size > 0 && disponibles.length > 0) {
    let mejor: { promo: Promocion; total: bigint; porLinea: Map<number, bigint>; usadas: number[] } | null = null;
    for (const promo of disponibles) {
      const elegibles = [...libres].filter((i) => aplicaA(promo, lineas[i]));
      if (elegibles.length === 0) continue;
      const porLinea = descuentosDe(promo, lineas, elegibles);
      const total = [...porLinea.values()].reduce((s, d) => s + d, 0n);
      // Empate: gana la de menor id (resultado estable en cliente y servidor).
      if (total > 0n && (!mejor || total > mejor.total || (total === mejor.total && promo.id < mejor.promo.id))) {
        // En combos, todas las unidades elegibles "se usaron" para armarlo, aunque no salgan gratis.
        const usadas = promo.tipo === "combo" ? elegibles : elegibles.filter((i) => porLinea.get(i)! > 0n);
        mejor = { promo, total, porLinea, usadas };
      }
    }
    if (!mejor) break;
    for (const i of mejor.usadas) {
      asignada.set(i, { promo: mejor.promo, descuento: mejor.porLinea.get(i) ?? 0n });
      libres.delete(i);
    }
    disponibles.splice(disponibles.indexOf(mejor.promo), 1);
  }

  let subtotal = 0n;
  let descuento = 0n;
  const resumen = new Map<number, { promo: Promocion; total: bigint }>();
  const resultado = lineas.map((l, i) => {
    const sub = aCentavos(l.precioUnitario) * BigInt(l.cantidad);
    const a = asignada.get(i);
    const desc = a ? (a.descuento > sub ? sub : a.descuento) : 0n;
    subtotal += sub;
    descuento += desc;
    if (a && desc > 0n) {
      const previo = resumen.get(a.promo.id);
      resumen.set(a.promo.id, { promo: a.promo, total: (previo?.total ?? 0n) + desc });
    }
    return {
      ...l,
      subtotal: deCentavos(sub),
      descuento: deCentavos(desc),
      total: deCentavos(sub - desc),
      promocionId: a && desc > 0n ? a.promo.id : null,
      promocion: a && desc > 0n ? a.promo.nombre : null,
    };
  });

  return {
    lineas: resultado,
    subtotal: deCentavos(subtotal),
    descuento: deCentavos(descuento),
    total: deCentavos(subtotal - descuento),
    aplicadas: [...resumen.values()].map(({ promo, total }) => ({
      promocionId: promo.id,
      nombre: promo.nombre,
      descuento: deCentavos(total),
      cuponId: promo.cuponId ?? null,
    })),
  };
}

/** Texto corto del beneficio: "10 %", "Bs 20 por unidad", "2x1". */
export function describirBeneficio(p: Pick<Promocion, "tipo" | "valor" | "comboLleva" | "comboPaga">) {
  if (p.tipo === "combo") return `${p.comboLleva}x${p.comboPaga}`;
  if (p.tipo === "porcentaje") return `${Number(p.valor).toLocaleString("es-BO")} % de descuento`;
  return `Bs ${Number(p.valor).toLocaleString("es-BO", { minimumFractionDigits: 2 })} menos por unidad`;
}
