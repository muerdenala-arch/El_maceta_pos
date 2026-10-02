"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { cajas } from "@/db/schema";
import { conPermiso, exito, fallo, falloValidacion, type Resultado } from "@/lib/acciones/resultado";
import { registrarAuditoria } from "@/lib/auditoria";
import { verificarAutorizacion, type Autorizador } from "@/lib/auth/autorizacion";
import { ROLES_CAJA } from "@/lib/auth/constantes";
import { autorizar } from "@/lib/auth/sesion";
import { anularVentaConStock } from "@/lib/caja/anulacion";
import { esquemaAnulacion } from "@/lib/validaciones/caja";

const esquema = esquemaAnulacion.extend({ autorizacion: z.string().max(2000).nullable().optional().default(null) });

/**
 * Anulación en la sucursal, solo mientras la caja de esa venta siga abierta (después, solo el administrador):
 * - el encargado anula cualquier venta de su sucursal;
 * - el cajero, solo las suyas y con la autorización (PIN) del encargado o de un administrador.
 */
export async function anularVentaEnSucursal(entrada: z.input<typeof esquema>): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizar(...ROLES_CAJA);
    const sucursalId = sesion.sucursalId;
    if (!sucursalId) return fallo("No tienes una sucursal asignada");
    const v = esquema.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);
    const { id, motivo, autorizacion } = v.data;

    let autorizador: Autorizador | null = null;
    if (sesion.rol !== "encargado") {
      autorizador = await verificarAutorizacion(autorizacion, { para: sesion.uid, sucursalId, proposito: "anulacion", ref: String(id) });
      if (!autorizador) return fallo("Anular una venta necesita el PIN del encargado o de un administrador");
    }

    const r = await anularVentaConStock({
      id,
      motivo,
      usuarioId: sesion.uid,
      permitir: async (venta, tx) => {
        // Misma respuesta para "no existe" y "es de otra sucursal": no se revela nada de otras sucursales.
        if (venta.sucursalId !== sucursalId) return "La venta no existe o ya estaba anulada";
        if (sesion.rol !== "encargado" && venta.cajeroId !== sesion.uid) return "Solo puedes anular tus propias ventas";
        const [caja] = await tx.select({ estado: cajas.estado }).from(cajas).where(eq(cajas.id, venta.cajaId));
        if (caja?.estado !== "abierta") return "La caja de esta venta ya se cerró: solo el administrador puede anularla";
        return null;
      },
    });
    if (!r.ok) return fallo(r.error);

    await registrarAuditoria("venta_anulada", {
      usuarioId: sesion.uid,
      detalle: {
        ventaId: id,
        numero: r.venta.numeroComprobante,
        sucursalId: r.venta.sucursalId,
        total: r.venta.total,
        motivo,
        rol: sesion.rol,
        autorizadoPor: autorizador ? autorizador.nombre : null,
        autorizadoPorId: autorizador?.id ?? null,
      },
    });
    refresh();
    return exito();
  });
}
