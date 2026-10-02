import type { Metadata } from "next";
import { connection } from "next/server";
import { requerirSesion } from "@/lib/auth/sesion";
import { productosPos, qrsDeSucursal, requerirCajaAbierta } from "@/lib/caja/consultas";
import { baseComprobante } from "@/lib/comprobante/consulta";
import { promocionesAutomaticas } from "@/lib/promociones/consultas";
import { combosPos } from "@/lib/combos/consultas";
import { hoyEnBolivia, instanteActual } from "@/lib/formato";
import { PuntoDeVenta } from "./punto-de-venta";

export const metadata: Metadata = { title: "Venta" };

export default async function PaginaVenta() {
  const sesion = await requerirSesion("cajero");
  // Sin caja abierta no se vende: lleva a la apertura.
  const caja = await requerirCajaAbierta(sesion);
  await connection();
  const [productos, qrs, promociones, base, combos] = await Promise.all([
    productosPos(caja.sucursalId),
    qrsDeSucursal(caja.sucursalId),
    promocionesAutomaticas(caja.sucursalId),
    baseComprobante(caja.sucursalId),
    combosPos(hoyEnBolivia()),
  ]);

  return (
    <PuntoDeVenta
      contexto={{
        usuarioId: sesion.uid,
        cajero: sesion.nombre,
        cajaId: caja.id,
        sucursalId: caja.sucursalId,
        baseComprobante: base,
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
