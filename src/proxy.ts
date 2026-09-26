import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION } from "@/lib/auth/constantes";
import { verificarSesion } from "@/lib/auth/jwt";
import { decidirAcceso } from "@/lib/auth/rutas";

/**
 * Protección de rutas por rol (primera barrera). Solo verifica el JWT, sin consultar la BD;
 * las páginas y acciones del servidor vuelven a verificar con requerirSesion()/autorizar().
 */
export async function proxy(request: NextRequest) {
  const sesion = await verificarSesion(request.cookies.get(COOKIE_SESION)?.value);
  const decision = decidirAcceso(request.nextUrl.pathname, sesion);

  switch (decision.tipo) {
    case "seguir":
      return NextResponse.next();
    case "redirigir": {
      const respuesta = NextResponse.redirect(new URL(decision.destino, request.url));
      // Cookie vencida o manipulada: se borra para no insistir con ella.
      if (!sesion && request.cookies.has(COOKIE_SESION)) respuesta.cookies.delete(COOKIE_SESION);
      return respuesta;
    }
    case "no_autenticado":
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    case "prohibido":
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
}

export const config = {
  // Todo excepto archivos estáticos, imágenes optimizadas y archivos con extensión (íconos, manifest…).
  matcher: ["/((?!_next/static|_next/image|.*\\.[\\w]+$).*)"],
};
