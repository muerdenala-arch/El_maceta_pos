"use server";

import { and, eq, notInArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { alertas } from "@/db/schema";
import { conPermiso, exito, fallo, type Resultado } from "@/lib/acciones/resultado";
import { registrarAuditoria } from "@/lib/auditoria";
import { autorizar } from "@/lib/auth/sesion";
import { idPositivo } from "@/lib/validaciones/comunes";
import { listarAlertasPendientes, resumenAlertas, type AlertaCampanita } from "./consultas";
import { conciliarAlertasSiCorresponde } from "./motor";
import { TIPOS_AUTOMATICOS } from "./reglas";

/** Lo que muestra la campanita al abrirse (y el contador, que se refresca solo). Administrador y encargado ven lo mismo. */
export async function obtenerAlertas(): Promise<Resultado<{ alertas: AlertaCampanita[]; noLeidas: number; porModulo: Record<string, number> }>> {
  return conPermiso(async () => {
    await autorizar("admin", "encargado");
    await conciliarAlertasSiCorresponde();
    const [lista, resumen] = await Promise.all([listarAlertasPendientes(), resumenAlertas()]);
    return exito({ alertas: lista, ...resumen });
  });
}

export async function marcarAlertaLeida(entrada: { id: number }): Promise<Resultado> {
  return conPermiso(async () => {
    await autorizar("admin", "encargado");
    await db.update(alertas).set({ leida: true }).where(eq(alertas.id, idPositivo.parse(entrada.id)));
    refresh();
    return exito();
  });
}

export async function marcarTodasLeidas(): Promise<Resultado> {
  return conPermiso(async () => {
    await autorizar("admin", "encargado");
    await db.update(alertas).set({ leida: true }).where(and(eq(alertas.resuelta, false), eq(alertas.leida, false)));
    refresh();
    return exito();
  });
}

/**
 * Para alertas que no se resuelven solas (diferencia de caja, venta a revisar…): el admin la marca
 * como revisada y sale de la campanita. Las de stock y vencimiento se resuelven solas.
 */
export async function marcarAlertaRevisada(entrada: { id: number }): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizar("admin", "encargado");
    const id = idPositivo.parse(entrada.id);
    const [a] = await db
      .update(alertas)
      .set({ resuelta: true, leida: true })
      .where(and(eq(alertas.id, id), notInArray(alertas.tipo, TIPOS_AUTOMATICOS)))
      .returning({ tipo: alertas.tipo, mensaje: alertas.mensaje });
    if (!a) return fallo("Esta alerta se resuelve sola al corregir el stock o el vencimiento");
    await registrarAuditoria("alerta_revisada", { usuarioId: sesion.uid, detalle: { id, ...a } });
    refresh();
    return exito();
  });
}
