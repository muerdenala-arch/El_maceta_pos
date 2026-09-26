/**
 * Compresión y redimensionado en el dispositivo antes de subir (fotos del celular de 3–10 MB
 * quedan en ~100–300 KB). Corrige la orientación de la cámara y convierte a WebP.
 */

export type OpcionesCompresion = { ladoMaximo: number; calidad: number };

export const COMPRESION_PRODUCTO: OpcionesCompresion = { ladoMaximo: 1200, calidad: 0.82 };
export const COMPRESION_LOGO: OpcionesCompresion = { ladoMaximo: 512, calidad: 0.9 };

export async function comprimirImagen(archivo: File, opciones: OpcionesCompresion): Promise<Blob> {
  if (!archivo.type.startsWith("image/")) throw new Error("El archivo no es una imagen");

  const bitmap = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  const escala = Math.min(1, opciones.ladoMaximo / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.round(bitmap.width * escala);
  const alto = Math.round(bitmap.height * escala);

  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolver) => lienzo.toBlob(resolver, "image/webp", opciones.calidad));
  // Navegadores sin WebP en canvas (Safari antiguo) devuelven PNG: se usa JPEG en ese caso.
  if (blob && blob.type === "image/webp") return blob;
  const jpeg = await new Promise<Blob | null>((resolver) => lienzo.toBlob(resolver, "image/jpeg", opciones.calidad));
  if (!jpeg) throw new Error("No se pudo comprimir la imagen");
  return jpeg;
}
