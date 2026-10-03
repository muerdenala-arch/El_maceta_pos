import { despacharTodo } from "@/lib/notificaciones/despacho";

export const dynamic = "force-dynamic";

/**
 * Envía los avisos cuya hora ya llegó (recordatorios y alertas pendientes). Lo llaman el cron de Vercel y la app
 * mientras está abierta (`<PulsoAvisos>`). No recibe datos ni devuelve nada privado, y repetirlo no duplica avisos
 * (cada uno se toma una sola vez), por eso no pide sesión.
 */
export async function GET() {
  await despacharTodo();
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
