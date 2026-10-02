"use server";

import { z } from "zod";
import { conPermiso, exito, fallo, type Resultado } from "@/lib/acciones/resultado";
import { registrarAuditoria } from "@/lib/auditoria";
import { firmarAutorizacion, puedeAutorizar } from "./autorizacion";
import { ROLES_CAJA } from "./constantes";
import { buscarUsuarioPorPin, compararConRelleno, horaLocal, limpiarOrigen, origenBloqueado, registrarFalloOrigen } from "./pin";
import { autorizar } from "./sesion";

const esquema = z
  .object({
    pin: z.string().regex(/^\d{4,6}$/, "PIN inválido"),
    proposito: z.enum(["descuento", "anulacion"]),
    /** UUID del cobro (descuento) o id de la venta (anulación). */
    ref: z.string().trim().min(1).max(64),
    porcentaje: z
      .string()
      .trim()
      .transform((s) => s.replace(",", "."))
      .refine((s) => /^\d{1,3}(\.\d{1,2})?$/.test(s) && Number(s) > 0 && Number(s) <= 100)
      .nullable()
      .optional()
      .default(null),
  })
  .refine((d) => d.proposito !== "descuento" || d.porcentaje !== null);

/**
 * El encargado de la sucursal o un administrador escribe su PIN en la pantalla de quien está vendiendo para
 * autorizar un descuento mayor al permitido o la anulación de una venta. 5 PIN incorrectos seguidos bloquean
 * las autorizaciones de ese usuario durante 15 minutos. Lo autorizado queda en auditoría al usarse.
 */
export async function pedirAutorizacion(entrada: z.input<typeof esquema>): Promise<Resultado<{ token: string; autorizador: string; rol: "admin" | "encargado" }>> {
  return conPermiso(async () => {
    const sesion = await autorizar(...ROLES_CAJA);
    if (!sesion.sucursalId) return fallo("No tienes una sucursal asignada");
    const v = esquema.safeParse(entrada);
    if (!v.success) return fallo("PIN inválido");
    const d = v.data;

    // Límite de intentos por quien pide la autorización (no por red: todos comparten la de la tienda).
    const origen = `autorizacion:${sesion.uid}`;
    const bloqueado = await origenBloqueado(origen);
    if (bloqueado) {
      await compararConRelleno(d.pin);
      return fallo(`Demasiados intentos. Vuelve a probar a las ${horaLocal(bloqueado)}.`);
    }

    const hallado = await buscarUsuarioPorPin(d.pin);
    const u = hallado.tipo === "unico" ? hallado.usuario : null;
    const valido = !!u && u.id !== sesion.uid && puedeAutorizar(u, sesion.sucursalId) && !(u.bloqueadoHasta && u.bloqueadoHasta > new Date());
    if (!valido) {
      await registrarAuditoria("autorizacion_fallida", { usuarioId: sesion.uid, detalle: { proposito: d.proposito, ref: d.ref, sucursalId: sesion.sucursalId } });
      const hasta = await registrarFalloOrigen(origen);
      return fallo(hasta ? `Demasiados intentos. Vuelve a probar a las ${horaLocal(hasta)}.` : "Ese PIN no es de un encargado de esta sucursal ni de un administrador");
    }

    await limpiarOrigen(origen);
    const token = await firmarAutorizacion({ por: u.id, para: sesion.uid, sucursalId: sesion.sucursalId, proposito: d.proposito, ref: d.ref, porcentaje: d.porcentaje });
    return exito({ token, autorizador: u.nombre, rol: u.rol as "admin" | "encargado" });
  });
}
