import { createHash, timingSafeEqual } from "node:crypto";
import { fechaValida, hoyEnBolivia } from "@/lib/formato";
import { datosResumenDiario } from "@/lib/integraciones/resumen-diario";
import { textoResumenDiario } from "@/lib/integraciones/resumen-texto";
import { sumarDias } from "@/lib/reportes/filtros";

export const dynamic = "force-dynamic";

const huella = (s: string) => createHash("sha256").update(s).digest();

/** La clave de integraciones (INTEGRACION_TOKEN, mínimo 32 caracteres). Sin ella, esta puerta queda cerrada. */
function claveCorrecta(req: Request) {
  const esperada = process.env.INTEGRACION_TOKEN ?? "";
  if (esperada.length < 32) return null;
  const recibida = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  // Se comparan huellas del mismo largo, en tiempo constante.
  return timingSafeEqual(huella(recibida), huella(esperada));
}

/**
 * Resumen del día para automatizaciones (n8n → WhatsApp). Solo lectura.
 * `GET /api/integraciones/resumen-diario?fecha=hoy|ayer|AAAA-MM-DD` con el encabezado `Authorization: Bearer <clave>`.
 * No usa la sesión de nadie: la clave va en una variable de entorno y solo abre esta consulta.
 * Devuelve los números y `texto`, el mensaje ya redactado.
 */
export async function GET(req: Request) {
  const ok = claveCorrecta(req);
  if (ok === null) return Response.json({ error: "Las integraciones no están configuradas en este servidor" }, { status: 503 });
  if (!ok) return Response.json({ error: "Clave inválida" }, { status: 401 });

  const hoy = hoyEnBolivia();
  const pedida = new URL(req.url).searchParams.get("fecha") ?? "hoy";
  const fecha = pedida === "hoy" ? hoy : pedida === "ayer" ? sumarDias(hoy, -1) : fechaValida(pedida);
  if (!fecha || fecha > hoy) return Response.json({ error: "Fecha inválida: usa hoy, ayer o AAAA-MM-DD (no futura)" }, { status: 400 });

  const datos = await datosResumenDiario(fecha);
  return Response.json({ ...datos, texto: textoResumenDiario(datos) }, { headers: { "Cache-Control": "no-store" } });
}
