import { despacharTodo } from "@/lib/notificaciones/despacho";

export const dynamic = "force-dynamic";

/** Como es público, no trabaja más de una vez cada 15 s por instancia (llamarlo sin parar no carga la base). */
const ESPERA_MS = 15_000;
let ultimo = 0;

/**
 * Envía los avisos cuya hora ya llegó (recordatorios y alertas pendientes). Lo llaman el cron de Vercel y la app
 * mientras está abierta (`<PulsoAvisos>`). No recibe datos ni devuelve nada privado, y repetirlo no duplica avisos
 * (cada uno se toma una sola vez), por eso no pide sesión.
 */
export async function GET() {
  const ahora = Date.now();
  if (ahora - ultimo >= ESPERA_MS) {
    ultimo = ahora;
    await despacharTodo();
  }
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
