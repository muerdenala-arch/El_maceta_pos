import "server-only";
import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { cache } from "react";
import { db } from "@/db";
import { configuracion } from "@/db/schema";

export type Marca = { nombre: string; logoUrl: string | null };

/** Nombre comercial y logo (se editan en Configuración general, Fase 2). */
export const obtenerMarca = cache(async (): Promise<Marca> => {
  // Dato de la BD que puede cambiar: se lee en cada petición, nunca al compilar.
  await connection();
  const [c] = await db
    .select({ nombre: configuracion.nombreComercial, logoUrl: configuracion.logoUrl })
    .from(configuracion)
    .where(eq(configuracion.id, 1));
  return c ?? { nombre: "El Maseta", logoUrl: null };
});
