import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { configuracion } from "@/db/schema";
import { connection } from "next/server";
import { requerirSesion } from "@/lib/auth/sesion";
import { productosPos, qrsDeSucursal, requerirCajaAbierta } from "@/lib/caja/consultas";
import { baseComprobante } from "@/lib/comprobante/consulta";
import { promocionesAutomaticas } from "@/lib/promociones/consultas";
import { combosPos } from "@/lib/combos/consultas";
import { hoyEnBolivia, instanteActual } from "@/lib/formato";
import { limitesDescuento } from "@/lib/caja/descuento-manual";
import { PuntoDeVenta } from "./punto-de-venta";
import { ROLES_CAJA } from "@/lib/auth/constantes";

export const metadata: Metadata = { title: "Venta" };

export default async function PaginaVenta() {
  const sesion = await requerirSesion(...ROLES_CAJA);
  // Sin caja abierta no se vende: lleva a la apertura.
  const caja = await requerirCajaAbierta(sesion);
  await connection();
  const [productos, qrs, promociones, base, combos, [conf]] = await Promise.all([
    productosPos(caja.sucursalId),
    qrsDeSucursal(caja.sucursalId),
    promocionesAutomaticas(caja.sucursalId),
    baseComprobante(caja.sucursalId),
    combosPos(hoyEnBolivia()),
    db
      .select({ cajero: configuracion.descuentoManualMaximo, encargado: configuracion.descuentoManualMaximoEncargado })
      .from(configuracion)
      .where(eq(configuracion.id, 1)),
  ]);

  const limites = limitesDescuento(conf?.cajero ?? "0", conf?.encargado ?? "0", sesion.rol);

  return (
    <PuntoDeVenta
      contexto={{
        usuarioId: sesion.uid,
        cajero: sesion.nombre,
        cajaId: caja.id,
        sucursalId: caja.sucursalId,
        baseComprobante: base,
        // Lo que puede dar por su cuenta quien vende, y hasta dónde llega con el PIN del encargado.
        descuentoManualMaximo: String(limites.propio),
        descuentoManualConPin: String(limites.encargado),
        // Momento de estos datos: la copia local más nueva (p. ej. con ventas sin conexión) gana.
        generadoEn: instanteActual(),
      }}
      productos={productos}
      qrs={qrs}
      promociones={promociones}
      combos={combos}
    />
  );
}
