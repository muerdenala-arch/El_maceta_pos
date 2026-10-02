/**
 * Venta sin conexión: se guarda en la cola del dispositivo con su comprobante provisional
 * y descuenta el stock de la copia local (para no vender más de lo que había).
 */
"use client";

import type { CotizacionCombos } from "@/lib/combos/calculo";
import type { DatosComprobante } from "@/lib/comprobante/datos";
import { aCentavos, deCentavos } from "@/lib/dinero";
import type { CalculoVenta } from "@/lib/promociones/venta";
import { unidadesPedidas } from "@/lib/inventario/fraccion";
import { baseLocal, type Instantanea } from "./base";

export type VentaLocalRealizada = {
  ventaId: 0;
  numero: 0;
  total: string;
  metodoPago: "efectivo" | "qr";
  montoRecibido: string | null;
  cambio: string | null;
  tokenPublico: "";
  comprobante: DatosComprobante;
  offline: true;
};

export async function registrarVentaLocal(p: {
  uuid: string;
  instantanea: Instantanea;
  /** Cálculo completo de la venta (promociones, combos y descuento manual) con los datos de la copia local. */
  calculo: CalculoVenta;
  /** Combos del carrito ya cotizados (nombres y precios para el comprobante). */
  combos: CotizacionCombos;
  /** Descuento manual del cajero, si lo hay. */
  descuentoManual: { porcentaje: string; motivo: string } | null;
  metodoPago: "efectivo" | "qr";
  montoRecibido: string | null;
  cambio: string | null;
  clienteNombre: string;
  clienteTelefono: string;
}): Promise<VentaLocalRealizada> {
  const base = baseLocal();
  const ahora = Date.now();
  const nombres = new Map(p.instantanea.productos.map((x) => [x.id, x]));
  const { subtotal, descuento, total } = p.calculo;
  const sueltas = p.calculo.lineas.filter((l) => l.combo === null);

  const comprobante: DatosComprobante = {
    ...p.instantanea.baseComprobante,
    venta: {
      id: 0,
      numero: 0,
      fecha: new Date(ahora).toISOString(),
      cajero: p.instantanea.cajero,
      cliente: p.clienteNombre || p.clienteTelefono ? { nombre: p.clienteNombre || null, telefono: p.clienteTelefono || null } : null,
      lineas: sueltas.map((l) => {
        const prod = nombres.get(l.productoId);
        return {
          nombre: prod?.nombre ?? "Producto",
          detalle: prod ? [prod.marca, prod.sabor, prod.presentacion].filter(Boolean).join(" · ") || null : null,
          cantidad: l.cantidad,
          unidad: l.fraccion ? (prod?.unidadFraccion ?? "capsula") : null,
          precioUnitario: l.precioUnitario,
          // En la línea solo su promoción; el descuento manual va en el pie.
          descuento: l.descuentoPromocion,
          subtotal: l.subtotal,
          promocion: l.promocion,
        };
      }),
      combos: p.combos.combos.map((c, indice) => {
        const bruto = aCentavos(c.precioNormal) * BigInt(c.cantidad);
        return {
          nombre: c.nombre,
          cantidad: c.cantidad,
          precioNormal: c.precioNormal,
          subtotal: deCentavos(bruto),
          descuento: deCentavos(bruto - aCentavos(c.precioFinal) * BigInt(c.cantidad)),
          productos: p.combos.lineas
            .filter((l) => l.combo === indice)
            .map((l) => ({ nombre: nombres.get(l.productoId)?.nombre ?? "Producto", cantidad: l.cantidad, unidad: l.fraccion ? (nombres.get(l.productoId)?.unidadFraccion ?? "capsula") : null })),
        };
      }),
      subtotal,
      descuento,
      descuentos: {
        promociones: p.calculo.descuentoPromociones,
        combos: p.calculo.descuentoCombos,
        cupon: "0.00",
        manual: p.calculo.descuentoManual,
        porcentajeManual: p.descuentoManual?.porcentaje ?? null,
      },
      total,
      metodoPago: p.metodoPago,
      estadoPago: p.metodoPago === "qr" ? "qr_por_confirmar" : "pagado",
      montoRecibido: p.montoRecibido,
      cambio: p.cambio,
      cupon: null,
      anulada: false,
      tokenPublico: "",
      provisional: true,
      codigoLocal: p.uuid.slice(0, 8).toUpperCase(),
    },
  };

  await base.transaction("rw", base.cola, base.ventasLocales, base.instantaneas, async () => {
    await base.cola.put({
      uuid: p.uuid,
      tipo: "venta",
      usuarioId: p.instantanea.usuarioId,
      creado: ahora,
      estado: "pendiente",
      intentos: 0,
      datos: {
        uuid: p.uuid,
        cajaId: p.instantanea.cajaId,
        fecha: ahora,
        // Todas las líneas (productos sueltos y los de cada combo) con lo que se descontó en cada una.
        lineas: p.calculo.lineas.map((l) => ({
          productoId: l.productoId,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario,
          descuento: l.descuento,
          descuentoManual: l.descuentoManual,
          promocionId: l.promocionId,
          fraccion: l.fraccion,
          combo: l.combo,
        })),
        descuentoManual: p.descuentoManual,
        combos: p.combos.combos,
        metodoPago: p.metodoPago,
        montoRecibido: p.montoRecibido,
        clienteNombre: p.clienteNombre || null,
        clienteTelefono: p.clienteTelefono || null,
      },
    });
    await base.ventasLocales.put({ uuid: p.uuid, usuarioId: p.instantanea.usuarioId, creado: ahora, comprobante, sincronizada: false });
    await descontarStockLocal(p.instantanea.clave, p.calculo.lineas);
  });

  return {
    ventaId: 0,
    numero: 0,
    total,
    metodoPago: p.metodoPago,
    montoRecibido: p.montoRecibido,
    cambio: p.cambio,
    tokenPublico: "",
    comprobante,
    offline: true,
  };
}

/** Resta lo vendido de la copia local (también tras una venta en línea, hasta la próxima recarga). */
export async function descontarStockLocal(clave: string, lineas: { productoId: number; cantidad: number; fraccion?: boolean }[]) {
  const base = baseLocal();
  const inst = await base.instantaneas.get(clave);
  if (!inst) return;
  // En unidades de stock: un envase de un producto fraccionado descuenta todas sus unidades sueltas.
  const vendido = new Map<number, number>();
  for (const pr of inst.productos) {
    const unidades = unidadesPedidas(lineas, pr);
    if (unidades > 0) vendido.set(pr.id, unidades);
  }
  await base.instantaneas.put({
    ...inst,
    productos: inst.productos.map((pr) => (vendido.has(pr.id) ? { ...pr, stock: pr.stock - vendido.get(pr.id)! } : pr)),
    actualizado: Math.max(inst.actualizado, Date.now()),
  });
}
