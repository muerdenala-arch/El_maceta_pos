import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { clientes, configuracion, cupones, detalleVenta, productos, promociones, sucursales, usuarios, ventas, ventasCombos } from "@/db/schema";
import type { Sesion } from "@/lib/auth/sesion";
import { aCentavos, deCentavos } from "@/lib/dinero";
import { hoyEnBolivia, ZONA_HORARIA } from "@/lib/formato";
import type { DatosComprobante } from "./datos";

/** Arma el comprobante de una venta por id o por token público. */
export async function obtenerComprobante(filtro: { ventaId: number } | { token: string }): Promise<DatosComprobante | null> {
  const [v] = await db
    .select({
      id: ventas.id,
      numero: ventas.numeroComprobante,
      fecha: ventas.fecha,
      cajero: usuarios.nombre,
      clienteNombre: clientes.nombre,
      clienteTelefono: clientes.telefono,
      subtotal: ventas.subtotal,
      descuento: ventas.descuento,
      descuentoPromociones: ventas.descuentoPromociones,
      descuentoCombos: ventas.descuentoCombos,
      descuentoCupon: ventas.descuentoCupon,
      descuentoManual: ventas.descuentoManual,
      porcentajeManual: ventas.porcentajeDescuentoManual,
      total: ventas.total,
      metodoPago: ventas.metodoPago,
      estadoPago: ventas.estadoPago,
      montoRecibido: ventas.montoRecibido,
      cambio: ventas.cambio,
      cupon: cupones.codigo,
      estado: ventas.estado,
      tokenPublico: ventas.tokenPublico,
      sucursalNombre: sucursales.nombre,
      sucursalDireccion: sucursales.direccion,
      sucursalTelefono: sucursales.telefono,
      tamanoImpresion: sucursales.tamanoImpresion,
    })
    .from(ventas)
    .innerJoin(usuarios, eq(usuarios.id, ventas.cajeroId))
    .innerJoin(sucursales, eq(sucursales.id, ventas.sucursalId))
    .leftJoin(clientes, eq(clientes.id, ventas.clienteId))
    .leftJoin(cupones, eq(cupones.id, ventas.cuponId))
    .where("ventaId" in filtro ? eq(ventas.id, filtro.ventaId) : eq(ventas.tokenPublico, filtro.token));
  if (!v) return null;

  const [lineas, [conf]] = await Promise.all([
    db
      .select({
        nombre: productos.nombre,
        marca: productos.marca,
        sabor: productos.sabor,
        presentacion: productos.presentacion,
        cantidad: detalleVenta.cantidad,
        unidad: detalleVenta.unidadFraccion,
        ventaComboId: detalleVenta.ventaComboId,
        precioUnitario: detalleVenta.precioUnitario,
        // En cada línea se muestra solo su promoción (o combo); el cupón y el descuento manual van en el pie.
        descuento: sql<string>`(${detalleVenta.descuento} - ${detalleVenta.descuentoCupon} - ${detalleVenta.descuentoManual})::text`,
        promocion: promociones.nombre,
      })
      .from(detalleVenta)
      .innerJoin(productos, eq(productos.id, detalleVenta.productoId))
      .leftJoin(promociones, eq(promociones.id, detalleVenta.promocionId))
      .where(eq(detalleVenta.ventaId, v.id))
      .orderBy(asc(detalleVenta.id)),
    db.select().from(configuracion).where(eq(configuracion.id, 1)),
  ]);

  return {
    negocio: {
      nombre: conf?.nombreComercial ?? "El Maseta",
      nit: conf?.nit ?? null,
      logoUrl: conf?.logoUrl ?? null,
      mensajeAgradecimiento: conf?.mensajeAgradecimiento ?? "¡Gracias por tu compra!",
      plantillaWhatsapp: conf?.plantillaWhatsapp ?? "Hola {cliente}, aquí está tu comprobante de {negocio}: {enlace}",
      codigoPais: conf?.codigoPais ?? "591",
    },
    sucursal: {
      nombre: v.sucursalNombre,
      direccion: v.sucursalDireccion,
      telefono: v.sucursalTelefono,
      tamanoImpresion: v.tamanoImpresion,
    },
    venta: {
      id: v.id,
      numero: v.numero,
      fecha: v.fecha.toISOString(),
      cajero: v.cajero,
      cliente: v.clienteNombre || v.clienteTelefono ? { nombre: v.clienteNombre, telefono: v.clienteTelefono } : null,
      combos: (await db.select().from(ventasCombos).where(eq(ventasCombos.ventaId, v.id)).orderBy(asc(ventasCombos.id))).map((c) => {
        const subtotal = aCentavos(c.precioNormal) * BigInt(c.cantidad);
        return {
          nombre: c.nombre,
          cantidad: c.cantidad,
          precioNormal: c.precioNormal,
          subtotal: deCentavos(subtotal),
          descuento: deCentavos(subtotal - aCentavos(c.precioFinal) * BigInt(c.cantidad)),
          productos: lineas.filter((l) => l.ventaComboId === c.id).map((l) => ({ nombre: l.nombre, cantidad: l.cantidad, unidad: l.unidad })),
        };
      }),
      // Los productos de un combo se muestran dentro de su combo, no como líneas sueltas.
      lineas: lineas.filter((l) => l.ventaComboId === null).map((l) => ({
        nombre: l.nombre,
        detalle: [l.marca, l.sabor, l.presentacion].filter(Boolean).join(" · ") || null,
        cantidad: l.cantidad,
        unidad: l.unidad,
        precioUnitario: l.precioUnitario,
        descuento: l.descuento,
        // Importe bruto de la línea; el descuento se muestra aparte debajo (subtotal − descuentos = total).
        subtotal: deCentavos(aCentavos(l.precioUnitario) * BigInt(l.cantidad)),
        promocion: aCentavos(l.descuento) > 0n ? l.promocion : null,
      })),
      subtotal: v.subtotal,
      descuento: v.descuento,
      descuentos: { promociones: v.descuentoPromociones, combos: v.descuentoCombos, cupon: v.descuentoCupon, manual: v.descuentoManual, porcentajeManual: v.porcentajeManual },
      total: v.total,
      metodoPago: v.metodoPago,
      estadoPago: v.estadoPago,
      montoRecibido: v.montoRecibido,
      cambio: v.cambio,
      cupon: v.cupon,
      anulada: v.estado === "anulada",
      tokenPublico: v.tokenPublico,
    },
  };
}

/** Negocio y sucursal: base de los comprobantes que el POS arma sin conexión. */
export async function baseComprobante(sucursalId: number): Promise<Pick<DatosComprobante, "negocio" | "sucursal">> {
  const [[conf], [s]] = await Promise.all([
    db.select().from(configuracion).where(eq(configuracion.id, 1)),
    db.select().from(sucursales).where(eq(sucursales.id, sucursalId)),
  ]);
  return {
    negocio: {
      nombre: conf?.nombreComercial ?? "El Maseta",
      nit: conf?.nit ?? null,
      logoUrl: conf?.logoUrl ?? null,
      mensajeAgradecimiento: conf?.mensajeAgradecimiento ?? "¡Gracias por tu compra!",
      plantillaWhatsapp: conf?.plantillaWhatsapp ?? "Hola {cliente}, aquí está tu comprobante de {negocio}: {enlace}",
      codigoPais: conf?.codigoPais ?? "591",
    },
    sucursal: { nombre: s?.nombre ?? "", direccion: s?.direccion ?? null, telefono: s?.telefono ?? null, tamanoImpresion: s?.tamanoImpresion ?? "80mm" },
  };
}

/**
 * Quién puede ver/reimprimir un comprobante desde la app:
 * el administrador, cualquiera; el cajero, solo sus ventas del día (sección 5 del plan).
 */
export async function puedeVerVenta(sesion: Sesion, ventaId: number): Promise<boolean> {
  // Administrador y encargado (con Reportes de venta abierto, ver verComprobante): cualquier venta.
  if (sesion.rol === "admin" || sesion.rol === "encargado") return true;
  const [v] = await db
    .select({ id: ventas.id })
    .from(ventas)
    .where(
      and(
        eq(ventas.id, ventaId),
        eq(ventas.cajeroId, sesion.uid),
        sql`(${ventas.fecha} at time zone ${ZONA_HORARIA})::date = ${hoyEnBolivia()}::date`,
      ),
    );
  return !!v;
}
