/** Acciones sensibles que se revisan (sección 4.11 del plan) y cómo se llaman en pantalla. */
export const ACCIONES_SENSIBLES: Record<string, { titulo: string; grave?: boolean }> = {
  venta_anulada: { titulo: "Venta anulada", grave: true },
  ajuste_stock: { titulo: "Ajuste de stock", grave: true },
  cambio_precio: { titulo: "Cambio de precio" },
  descuento_manual: { titulo: "Descuento manual del cajero" },
  venta_fraccionada_cambiada: { titulo: "Venta fraccionada activada o quitada" },
  login_fallido: { titulo: "PIN incorrecto al ingresar" },
  desbloqueo_fallido: { titulo: "PIN incorrecto al desbloquear" },
  bloqueo_por_intentos: { titulo: "Usuario bloqueado por intentos", grave: true },
  gasto_anulado: { titulo: "Gasto anulado", grave: true },
  pago_qr_confirmado: { titulo: "Pago QR confirmado" },
  pin_restablecido: { titulo: "PIN cambiado por admin" },
  usuario_estado: { titulo: "Usuario activado/desactivado" },
  usuario_editado: { titulo: "Usuario editado" },
  transferencia_cancelada: { titulo: "Transferencia cancelada" },
  caja_cerrada: { titulo: "Cierre de caja" },
  alerta_revisada: { titulo: "Alerta revisada" },
  // Módulo Eventos
  pesaje_corregido: { titulo: "Pesaje corregido (reto)", grave: true },
  participante_baja: { titulo: "Baja de participante (reto)" },
  evento_finalizado: { titulo: "Reto o torneo finalizado" },
  combate_corregido: { titulo: "Combate corregido (pulseada)", grave: true },
};
