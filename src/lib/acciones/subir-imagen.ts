"use server";

import { ErrorImagen, guardarImagen, type Carpeta } from "@/lib/almacenamiento";
import { autorizar } from "@/lib/auth/sesion";
import { conPermiso, exito, fallo, type Resultado } from "./resultado";
import type { Rol } from "@/lib/auth/constantes";
import { autorizarModulo } from "@/lib/auth/modulo-servidor";
import type { ModuloEncargado } from "@/lib/auth/modulos";

/** Quién puede subir a cada carpeta: el cajero solo fotos de comprobantes de gasto. */
const PERMISOS: Record<Carpeta, Rol[]> = {
  productos: ["admin"],
  logo: ["admin"],
  qr: ["admin"],
  gastos: ["admin", "cajero", "encargado"],
};

const MODULO_DE: Partial<Record<Carpeta, ModuloEncargado>> = { productos: "catalogo", qr: "qr", logo: "configuracion" };

export async function subirImagen(formulario: FormData): Promise<Resultado<{ url: string }>> {
  return conPermiso(async () => {
    const carpeta = formulario.get("carpeta") as Carpeta;
    const archivo = formulario.get("archivo");
    if (!(carpeta in PERMISOS)) return fallo("Destino inválido");
    // Fotos de un apartado compartido: también el encargado, si tiene el candado abierto.
    if (MODULO_DE[carpeta]) await autorizarModulo(MODULO_DE[carpeta]);
    else await autorizar(...PERMISOS[carpeta]);
    if (!(archivo instanceof File)) return fallo("No se recibió ninguna imagen");

    try {
      return exito({ url: await guardarImagen(archivo, carpeta) });
    } catch (e) {
      if (e instanceof ErrorImagen) return fallo(e.message);
      throw e;
    }
  });
}
