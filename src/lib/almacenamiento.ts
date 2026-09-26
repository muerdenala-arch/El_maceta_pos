import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Imágenes (productos, logo, QR, comprobantes de gasto). Nunca van en la BD: solo su URL.
 * - Con BLOB_READ_WRITE_TOKEN → Vercel Blob (producción).
 * - Sin token (desarrollo local) → carpeta .subidas/, servida por /api/archivos/[carpeta]/[nombre].
 */

export const CARPETAS = ["productos", "logo", "qr", "gastos"] as const;
export type Carpeta = (typeof CARPETAS)[number];

export const TAMANO_MAXIMO_IMAGEN = 2 * 1024 * 1024; // 2 MB (ya llegan comprimidas desde el dispositivo)

const TIPOS = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
} as const;
type TipoImagen = keyof typeof TIPOS;

export const CARPETA_LOCAL = path.join(process.cwd(), ".subidas");

/** Verifica la firma real del archivo (no basta con el tipo que declara el navegador). */
function tipoReal(bytes: Uint8Array): TipoImagen | null {
  const ascii = (desde: number, largo: number) => String.fromCharCode(...bytes.subarray(desde, desde + largo));
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  if (bytes[0] === 0x89 && ascii(1, 3) === "PNG") return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

export class ErrorImagen extends Error {}

export async function guardarImagen(archivo: File, carpeta: Carpeta): Promise<string> {
  if (!CARPETAS.includes(carpeta)) throw new ErrorImagen("Carpeta inválida");
  if (archivo.size === 0) throw new ErrorImagen("El archivo está vacío");
  if (archivo.size > TAMANO_MAXIMO_IMAGEN) throw new ErrorImagen("La imagen supera los 2 MB");

  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const tipo = tipoReal(bytes);
  if (!tipo) throw new ErrorImagen("Formato no permitido (usa JPG, PNG o WebP)");

  const nombre = `${randomUUID()}.${TIPOS[tipo]}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`${carpeta}/${nombre}`, Buffer.from(bytes), {
      access: "public",
      contentType: tipo,
      addRandomSuffix: false,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    });
    return blob.url;
  }

  if (process.env.VERCEL) throw new Error("Falta BLOB_READ_WRITE_TOKEN en Vercel");
  await mkdir(path.join(CARPETA_LOCAL, carpeta), { recursive: true });
  await writeFile(path.join(CARPETA_LOCAL, carpeta, nombre), bytes);
  return `/api/archivos/${carpeta}/${nombre}`;
}

/** Lectura del almacenamiento local (solo desarrollo). Devuelve null si no existe o el nombre es inválido. */
export async function leerImagenLocal(carpeta: string, nombre: string) {
  if (!CARPETAS.includes(carpeta as Carpeta)) return null;
  // Solo nombres generados por guardarImagen: evita "../" y cualquier otra ruta.
  const coincide = /^[0-9a-f-]{36}\.(webp|png|jpg)$/.exec(nombre);
  if (!coincide) return null;
  const tipo = (Object.keys(TIPOS) as TipoImagen[]).find((t) => TIPOS[t] === coincide[1])!;
  try {
    return { bytes: await readFile(path.join(CARPETA_LOCAL, carpeta, nombre)), tipo };
  } catch {
    return null;
  }
}
