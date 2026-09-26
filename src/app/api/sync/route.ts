import { obtenerSesion } from "@/lib/auth/sesion";
import { registrarGastoOffline, registrarVentaOffline, type ResultadoSync } from "@/lib/caja/registro";
import { esquemaGastoOffline, esquemaLoteSync, esquemaVentaOffline } from "@/lib/validaciones/caja";

export type RespuestaSync = {
  resultados: ({ uuid: string } & (ResultadoSync | { ok: true }))[];
};

/**
 * Recepción de la cola offline (sección 8 del plan): ventas y gastos en orden cronológico.
 * Cada operación trae el UUID del dispositivo → reenviar el mismo lote nunca duplica nada.
 * Una operación con error no detiene a las siguientes.
 */
export async function POST(req: Request) {
  const sesion = await obtenerSesion();
  if (!sesion) return Response.json({ error: "Sesión vencida: vuelve a ingresar para sincronizar" }, { status: 401 });
  if (sesion.rol !== "cajero") return Response.json({ error: "Solo los cajeros sincronizan operaciones" }, { status: 403 });

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const lote = esquemaLoteSync.safeParse(cuerpo);
  if (!lote.success) return Response.json({ error: "Lote inválido" }, { status: 400 });

  const resultados: RespuestaSync["resultados"] = [];
  for (const op of lote.data.operaciones) {
    try {
      if (op.tipo === "venta") {
        const v = esquemaVentaOffline.safeParse(op.datos);
        if (!v.success || v.data.uuid !== op.uuid) {
          resultados.push({ uuid: op.uuid, ok: false, error: "Datos de venta inválidos", permanente: true });
          continue;
        }
        resultados.push({ uuid: op.uuid, ...(await registrarVentaOffline(sesion, v.data)) });
      } else {
        const g = esquemaGastoOffline.safeParse(op.datos);
        if (!g.success || g.data.uuid !== op.uuid) {
          resultados.push({ uuid: op.uuid, ok: false, error: "Datos de gasto inválidos", permanente: true });
          continue;
        }
        resultados.push({ uuid: op.uuid, ...(await registrarGastoOffline(sesion, g.data)) });
      }
    } catch (e) {
      // Error inesperado (BD caída, etc.): se reintentará más tarde.
      console.error("Error al sincronizar", op.uuid, e);
      resultados.push({ uuid: op.uuid, ok: false, error: "Error del servidor, se reintentará", permanente: false });
    }
  }
  return Response.json({ resultados } satisfies RespuestaSync);
}
