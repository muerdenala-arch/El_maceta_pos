/**
 * Criterio de aceptación (sección 11): "Un cajero no puede acceder a ninguna pantalla ni acción de
 * administrador, ni escribiendo la URL ni llamando al API". Recorre TODAS las server actions del
 * sistema y las invoca sin sesión y con el rol equivocado: ninguna debe ejecutarse ni tocar la BD.
 * Si se agrega una acción nueva sin declarar aquí quién puede usarla, esta prueba falla.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { count, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { GET as exportar } from "@/app/api/admin/exportar/route";
import { POST as sincronizar } from "@/app/api/sync/route";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { ErrorAutorizacion } from "@/lib/auth/sesion";
import { comoUsuario, prepararBase, type Base } from "./base";

type Rol = "admin" | "cajero";

/** Quién puede usar cada acción. `publica` = no requiere sesión (login, desbloqueo, salir). */
const PERMITIDOS: Record<string, Rol[] | "publica"> = {
  // Administrador
  guardarProducto: ["admin"],
  importarProductos: ["admin"],
  guardarCategoria: ["admin"],
  eliminarCategoria: ["admin"],
  guardarConfiguracion: ["admin"],
  anularGasto: ["admin"],
  crearUsuario: ["admin"],
  editarUsuario: ["admin"],
  cambiarEstadoUsuario: ["admin"],
  restablecerPin: ["admin"],
  desbloquearUsuario: ["admin"],
  guardarPromocion: ["admin"],
  crearCupon: ["admin"],
  eliminarCupon: ["admin"],
  guardarQr: ["admin"],
  anularVenta: ["admin"],
  confirmarPagoQr: ["admin"],
  guardarSucursal: ["admin"],
  cambiarEstadoSucursal: ["admin"],
  cambiarSucursalVista: ["admin"],
  obtenerAlertas: ["admin"],
  marcarAlertaLeida: ["admin"],
  marcarTodasLeidas: ["admin"],
  marcarAlertaRevisada: ["admin"],
  registrarIngreso: ["admin"],
  ajustarStock: ["admin"],
  crearTransferencia: ["admin"],
  recibirTransferencia: ["admin"],
  cancelarTransferencia: ["admin"],
  resolverSolicitud: ["admin"],
  // Cajero
  abrirCaja: ["cajero"],
  registrarVenta: ["cajero"],
  consultarCupon: ["cajero"],
  registrarGasto: ["cajero"],
  cerrarCaja: ["cajero"],
  solicitarReposicion: ["cajero"],
  // Ambos
  verComprobante: ["cajero", "admin"],
  buscarClientes: ["cajero", "admin"],
  subirImagen: ["cajero", "admin"], // según la carpeta; con "qr" (abajo) solo admin
  // Sin sesión
  iniciarSesion: "publica",
  desbloquear: "publica",
  cerrarSesion: "publica",
};

/** Argumento de prueba: basura con la forma mínima (el permiso se revisa antes que los datos). */
function argumento(nombre: string): unknown {
  if (nombre === "subirImagen") {
    const f = new FormData();
    f.set("carpeta", "qr");
    f.set("archivo", new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" }));
    return f;
  }
  if (nombre === "verComprobante") return 1;
  if (nombre === "consultarCupon" || nombre === "buscarClientes") return "abc";
  if (nombre === "cambiarSucursalVista") return null;
  return { id: 1, activo: false, motivo: "prueba de permisos", pin: "1234" };
}

/** Archivos "use server" del proyecto (se descubren solos: ninguno queda afuera de la prueba). */
function archivosDeAcciones(dir = "src"): string[] {
  return readdirSync(dir).flatMap((n) => {
    const ruta = path.join(dir, n);
    if (statSync(ruta).isDirectory()) return n === "test" ? [] : archivosDeAcciones(ruta);
    return /\.tsx?$/.test(n) && /^\s*["']use server["']/.test(readFileSync(ruta, "utf8")) ? [ruta] : [];
  });
}

const tablas = Object.values(schema as Record<string, unknown>).filter((t): t is PgTable => is(t, PgTable));
async function conteos() {
  const pares = await Promise.all(tablas.map(async (t) => [getTableName(t), (await db.select({ n: count() }).from(t))[0].n] as const));
  return Object.fromEntries(pares);
}

let b: Base;
let acciones: [string, (...a: unknown[]) => Promise<unknown>][];

beforeAll(async () => {
  b = await prepararBase();
  const modulos = await Promise.all(archivosDeAcciones().map((f) => import(/* @vite-ignore */ path.resolve(f))));
  acciones = modulos.flatMap((m) => Object.entries(m).filter((e): e is [string, (...a: unknown[]) => Promise<unknown>] => typeof e[1] === "function"));
});

/** true si la acción fue rechazada por permisos (resultado de conPermiso o error lanzado). */
async function rechazada(fn: (...a: unknown[]) => Promise<unknown>, arg: unknown) {
  try {
    const r = (await fn(arg)) as { ok?: boolean; error?: string } | undefined;
    return r?.ok === false && r.error === "No tienes permiso para esta acción";
  } catch (e) {
    return e instanceof ErrorAutorizacion;
  }
}

describe("server actions", () => {
  it("todas están declaradas en la tabla de permisos", () => {
    expect(acciones.length).toBeGreaterThan(30);
    expect(acciones.map(([n]) => n).filter((n) => !(n in PERMITIDOS))).toEqual([]);
  });

  it("sin sesión, ninguna acción privada se ejecuta ni modifica la BD", async () => {
    await comoUsuario(null);
    const antes = await conteos();
    const ejecutadas: string[] = [];
    for (const [nombre, fn] of acciones) {
      if (PERMITIDOS[nombre] === "publica") continue;
      if (!(await rechazada(fn, argumento(nombre)))) ejecutadas.push(nombre);
    }
    expect(ejecutadas).toEqual([]);
    expect(await conteos()).toEqual(antes);
  });

  for (const rol of ["cajero", "admin"] as const) {
    it(`como ${rol}, las acciones de otro rol se rechazan y no modifican la BD`, async () => {
      await comoUsuario(rol === "cajero" ? b.cajeroNorte : b.admin);
      const antes = await conteos();
      const ejecutadas: string[] = [];
      for (const [nombre, fn] of acciones) {
        const permitidos = PERMITIDOS[nombre];
        const soloAdminPorCarpeta = nombre === "subirImagen" && rol === "cajero"; // carpeta "qr"
        if (permitidos === "publica" || (permitidos.includes(rol) && !soloAdminPorCarpeta)) continue;
        if (!(await rechazada(fn, argumento(nombre)))) ejecutadas.push(nombre);
      }
      expect(ejecutadas).toEqual([]);
      expect(await conteos()).toEqual(antes);
    });
  }
});

describe("rutas del API", () => {
  const exportacion = () => exportar(new NextRequest("http://localhost/api/admin/exportar?reporte=ventas&formato=xlsx"));
  const sync = () => sincronizar(new Request("http://localhost/api/sync", { method: "POST", body: JSON.stringify({ operaciones: [] }) }));

  it("exportar reportes: 401 sin sesión, 403 para el cajero, 200 para el admin", async () => {
    await comoUsuario(null);
    expect((await exportacion()).status).toBe(401);
    await comoUsuario(b.cajeroNorte);
    expect((await exportacion()).status).toBe(403);
    await comoUsuario(b.admin);
    expect((await exportacion()).status).toBe(200);
  });

  it("sincronización: 401 sin sesión, 403 para el admin (solo cajeros sincronizan)", async () => {
    await comoUsuario(null);
    expect((await sync()).status).toBe(401);
    await comoUsuario(b.admin);
    expect((await sync()).status).toBe(403);
  });

  it("una sesión de un usuario desactivado deja de valer al instante", async () => {
    const { usuarios } = schema;
    const { eq } = await import("drizzle-orm");
    await comoUsuario(b.cajeroSur);
    await db.update(usuarios).set({ activo: false }).where(eq(usuarios.id, b.cajeroSur.id));
    expect((await sync()).status).toBe(401);
    await db.update(usuarios).set({ activo: true }).where(eq(usuarios.id, b.cajeroSur.id));
  });
});
