import { obtenerSesion } from "@/lib/auth/sesion";
import { plantillaProductos } from "@/lib/importacion/contexto";

/** Planilla modelo para cargar el catálogo (columnas de stock según las ubicaciones actuales). Solo admin. */
export async function GET() {
  const sesion = await obtenerSesion();
  if (!sesion) return Response.json({ error: "Sesión vencida" }, { status: 401 });
  if (sesion.rol !== "admin") return Response.json({ error: "Sin permiso" }, { status: 403 });

  return new Response(new Uint8Array(await plantillaProductos()), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla_productos_el_maseta.xlsx"',
      "Cache-Control": "private, no-store",
    },
  });
}
