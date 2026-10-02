/**
 * Base de datos de las pruebas de integración: PostgreSQL en memoria (una por archivo de prueba),
 * con las migraciones reales y datos inventados. El PIN es solo de esta base en memoria.
 */
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import { db } from "@/db";
import * as s from "@/db/schema";
import { COOKIE_SESION } from "@/lib/auth/constantes";
import { firmarSesion } from "@/lib/auth/jwt";
import { cambiarStock } from "@/lib/inventario/stock";

/** PIN de cada usuario de prueba (distintos: se entra solo con el PIN). Solo existen en esta base en memoria. */
export const PINES = { admin: "4826", ana: "5937", beto: "604812", elsa: "7159", saul: "830471" } as const;

export type Usuario = { id: number; rol: "admin" | "cajero" | "encargado"; sucursalId: number | null };

export type Base = Awaited<ReturnType<typeof prepararBase>>;

export async function prepararBase() {
  await migrate(db as never, { migrationsFolder: "./src/db/migraciones" });
  await db.insert(s.configuracion).values({ id: 1 });

  const [bodega] = await db.insert(s.sucursales).values({ nombre: "Bodega central", tipo: "bodega" }).returning();
  const [norte] = await db.insert(s.sucursales).values({ nombre: "Sucursal Norte", tipo: "sucursal" }).returning();
  const [sur] = await db.insert(s.sucursales).values({ nombre: "Sucursal Sur", tipo: "sucursal" }).returning();

  const usuario = async (nombre: string, u: keyof typeof PINES, rol: Usuario["rol"], sucursalId: number | null): Promise<Usuario> => {
    const pinHash = await bcrypt.hash(PINES[u], 4);
    const [f] = await db.insert(s.usuarios).values({ nombre, usuario: u, rol, sucursalId, pinHash }).returning();
    return { id: f.id, rol, sucursalId };
  };
  const admin = await usuario("Admin Prueba", "admin", "admin", null);
  const cajeroNorte = await usuario("Ana Norte", "ana", "cajero", norte.id);
  const cajeroSur = await usuario("Beto Sur", "beto", "cajero", sur.id);
  const encargadoNorte = await usuario("Elsa Encargada Norte", "elsa", "encargado", norte.id);
  const encargadoSur = await usuario("Saúl Encargado Sur", "saul", "encargado", sur.id);

  const [categoria] = await db.insert(s.categorias).values({ nombre: "Proteínas" }).returning();
  const [proteina] = await db
    .insert(s.productos)
    .values({ nombre: "Whey Test", marca: "Marca", categoriaId: categoria.id, precioVenta: "350.00", precioCosto: "280.50", stockMinimo: 3 })
    .returning();
  const [creatina] = await db
    .insert(s.productos)
    .values({ nombre: "Creatina Test", categoriaId: categoria.id, precioVenta: "120.00", precioCosto: "80.00", stockMinimo: 2 })
    .returning();

  // Stock inicial con el código real (movimientos, lotes y alertas incluidos).
  await db.transaction(async (tx) => {
    for (const [productoId, ubicacionId, cantidad] of [
      [proteina.id, norte.id, 10],
      [creatina.id, norte.id, 5],
      [proteina.id, sur.id, 4],
      [proteina.id, bodega.id, 50],
    ]) {
      await cambiarStock(tx, { productoId, ubicacionId, delta: cantidad, tipo: "ingreso", usuarioId: admin.id, motivo: "Inicial" });
    }
  });

  return { bodega, norte, sur, admin, cajeroNorte, cajeroSur, encargadoNorte, encargadoSur, proteina, creatina };
}

const galletas = () => (globalThis as unknown as { __pruebas: { galletas: Map<string, string> } }).__pruebas.galletas;

/** Deja la cookie de sesión de ese usuario (null = sin sesión), como si hubiera iniciado sesión. */
export async function comoUsuario(u: Usuario | null) {
  if (!u) return void galletas().delete(COOKIE_SESION);
  galletas().set(COOKIE_SESION, await firmarSesion({ uid: u.id, rol: u.rol, sucursalId: u.sucursalId }));
}

export async function stock(productoId: number, ubicacionId: number) {
  const [f] = await db
    .select({ cantidad: s.inventario.cantidad })
    .from(s.inventario)
    .where(and(eq(s.inventario.productoId, productoId), eq(s.inventario.ubicacionId, ubicacionId)));
  return f?.cantidad ?? 0;
}
