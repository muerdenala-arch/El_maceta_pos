import { ImageResponse } from "next/og";

const TAMANOS = new Set([192, 512]);

/**
 * Íconos de la app instalable (PWA): "M" en naranja sobre fondo oscuro.
 * /icono/192 y /icono/512; `?maskable=1` deja margen de seguridad para íconos adaptativos de Android.
 */
export async function GET(req: Request, ctx: RouteContext<"/icono/[tamano]">) {
  const lado = Number((await ctx.params).tamano);
  if (!TAMANOS.has(lado)) return new Response("Tamaño no disponible", { status: 404 });
  const adaptable = new URL(req.url).searchParams.has("maskable");
  const circulo = adaptable ? lado * 0.62 : lado * 0.86;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0e0e10" }}>
        <div
          style={{
            width: circulo,
            height: circulo,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #f97316, #ea580c)",
            color: "#ffffff",
            fontSize: circulo * 0.6,
            fontWeight: 800,
          }}
        >
          M
        </div>
      </div>
    ),
    { width: lado, height: lado, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
