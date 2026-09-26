/**
 * Recepción de la cola offline (ventas, gastos, movimientos) — se implementa en la Fase 6.
 * Cada operación trae un UUID del dispositivo que actúa como clave de idempotencia.
 */
export async function POST() {
  return Response.json({ error: "No implementado (Fase 6)" }, { status: 501 });
}
