/**
 * Venta sin conexión: se guarda en la cola del dispositivo con su comprobante provisional
 * y descuenta el stock de la copia local (para no vender más de lo que había).
 */
"use client";

import type { DatosComprobante } from "@/lib/comprobante/datos";
import type { ResultadoPromociones } from "@/lib/promociones/motor";
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
  promo: ResultadoPromociones;
  metodoPago: "efectivo" | "qr";
  montoRecibido: string | null;
  cambio: string | null;
  clienteNombre: string;
  clienteTelefono: string;
}): Promise<VentaLocalRealizada> {
  const base = baseLocal();
  const ahora = Date.now();
  const nombres = new Map(p.instantanea.productos.map((x) => [x.id, x]));

  const comprobante: DatosComprobante = {
    ...p.instantanea.baseComprobante,
    venta: {
      id: 0,
      numero: 0,
      fecha: new Date(ahora).toISOString(),
      cajero: p.instantanea.cajero,
      cliente: p.clienteNombre || p.clienteTelefono ? { nombre: p.clienteNombre || null, telefono: p.clienteTelefono || null } : null,
      lineas: p.promo.lineas.map((l) => {
        const prod = nombres.get(l.productoId);
        return {
          nombre: prod?.nombre ?? "Producto",
          detalle: prod ? [prod.marca, prod.sabor, prod.presentacion].filter(Boolean).join(" · ") || null : null,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario,
          descuento: l.descuento,
          subtotal: l.subtotal,
          promocion: l.promocion,
        };
      }),
      subtotal: p.promo.subtotal,
      descuento: p.promo.descuento,
      total: p.promo.total,
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
        lineas: p.promo.lineas.map((l) => ({
          productoId: l.productoId,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario,
          descuento: l.descuento,
          promocionId: l.promocionId,
        })),
        metodoPago: p.metodoPago,
        montoRecibido: p.montoRecibido,
        clienteNombre: p.clienteNombre || null,
        clienteTelefono: p.clienteTelefono || null,
      },
    });
    await base.ventasLocales.put({ uuid: p.uuid, usuarioId: p.instantanea.usuarioId, creado: ahora, comprobante, sincronizada: false });
    await descontarStockLocal(p.instantanea.clave, p.promo.lineas);
  });

  return {
    ventaId: 0,
    numero: 0,
    total: p.promo.total,
    metodoPago: p.metodoPago,
    montoRecibido: p.montoRecibido,
    cambio: p.cambio,
    tokenPublico: "",
    comprobante,
    offline: true,
  };
}

/** Resta lo vendido de la copia local (también tras una venta en línea, hasta la próxima recarga). */
export async function descontarStockLocal(clave: string, lineas: { productoId: number; cantidad: number }[]) {
  const base = baseLocal();
  const inst = await base.instantaneas.get(clave);
  if (!inst) return;
  const vendido = new Map(lineas.map((l) => [l.productoId, l.cantidad]));
  await base.instantaneas.put({
    ...inst,
    productos: inst.productos.map((pr) => (vendido.has(pr.id) ? { ...pr, stock: pr.stock - vendido.get(pr.id)! } : pr)),
    actualizado: Math.max(inst.actualizado, Date.now()),
  });
}
