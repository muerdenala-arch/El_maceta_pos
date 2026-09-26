import { leerImagenLocal } from "@/lib/almacenamiento";

/**
 * Sirve las imágenes guardadas localmente en desarrollo (sin Vercel Blob).
 * Es pública como lo serían las URLs de Blob: el logo aparece en el login y en el comprobante público.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/archivos/[carpeta]/[nombre]">) {
  const { carpeta, nombre } = await ctx.params;
  const imagen = await leerImagenLocal(carpeta, nombre);
  if (!imagen) return new Response("No encontrado", { status: 404 });

  return new Response(new Uint8Array(imagen.bytes), {
    headers: {
      "Content-Type": imagen.tipo,
      // El nombre es un UUID único: el contenido nunca cambia.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
