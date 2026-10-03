"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { COOKIE_SUCURSAL_VISTA } from "@/lib/auth/constantes";
import { autorizar } from "@/lib/auth/sesion";

/** Cambia la sucursal que ve el administrador o el encargado ("todas" = null). */
export async function cambiarSucursalVista(sucursalId: number | null) {
  await autorizar("admin", "encargado");
  const id = z.number().int().positive().nullable().parse(sucursalId);
  const almacen = await cookies();
  if (id === null) almacen.delete(COOKIE_SUCURSAL_VISTA);
  else
    almacen.set(COOKIE_SUCURSAL_VISTA, String(id), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
}
