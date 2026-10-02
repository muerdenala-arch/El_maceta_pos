import "server-only";
import { headers } from "next/headers";
import { db } from "@/db";
import { auditoria } from "@/db/schema";

/** Acciones sensibles que quedan registradas (se amplía en fases siguientes). */
export type AccionAuditoria =
  | "login"
  | "login_fallido"
  | "bloqueo_por_intentos"
  | "logout"
  | "desbloqueo"
  | "desbloqueo_fallido"
  // Fase 2
  | "sucursal_creada"
  | "sucursal_editada"
  | "sucursal_estado"
  | "usuario_creado"
  | "usuario_editado"
  | "usuario_estado"
  | "pin_restablecido"
  | "usuario_desbloqueado"
  | "producto_creado"
  | "producto_editado"
  | "cambio_precio"
  | "configuracion_editada"
  // Fase 3
  | "ingreso_mercaderia"
  | "ajuste_stock"
  | "transferencia_enviada"
  | "transferencia_recibida"
  | "transferencia_cancelada"
  // Fase 4
  | "caja_abierta"
  | "caja_cerrada"
  | "gasto_anulado"
  | "qr_creado"
  | "qr_editado"
  // Fase 5
  | "promocion_creada"
  | "promocion_editada"
  | "cupon_creado"
  | "cupon_editado"
  | "descuento_manual"
  | "cupon_eliminado"
  // Fase 7
  | "alerta_revisada"
  | "venta_anulada"
  | "pago_qr_confirmado"
  | "productos_importados"
  | "venta_fraccionada_cambiada"
  | "combo_creado"
  | "combo_editado"
  // Rol Encargado
  | "autorizacion_fallida"
  | "candado_encargado"
  // Módulo Eventos
  | "evento_creado"
  | "evento_iniciado"
  | "evento_finalizado"
  | "participante_inscrito"
  | "participante_editado"
  | "participante_baja"
  | "pesajes_registrados"
  | "pesaje_corregido"
  | "torneo_sorteado"
  | "combate_registrado"
  | "combate_corregido";

export async function registrarAuditoria(
  accion: AccionAuditoria,
  { usuarioId, detalle }: { usuarioId?: number | null; detalle?: Record<string, unknown> } = {},
) {
  const dispositivo = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  await db.insert(auditoria).values({ accion, usuarioId: usuarioId ?? null, detalle, dispositivo });
}
