/** Ingreso solo con el PIN: identifica al usuario, lo lleva a su pantalla, PIN únicos y bloqueo por origen. */
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { crearUsuario, restablecerPin } from "@/app/admin/personal/acciones";
import { db } from "@/db";
import { intentosIngreso, usuarios } from "@/db/schema";
import { iniciarSesion } from "@/lib/auth/acciones";
import { COOKIE_SESION } from "@/lib/auth/constantes";
import { verificarSesion } from "@/lib/auth/jwt";
import { comoUsuario, PINES, prepararBase, type Base } from "./base";

const galletas = () => (globalThis as unknown as { __pruebas: { galletas: Map<string, string> } }).__pruebas.galletas;
const sesionActual = () => verificarSesion(galletas().get(COOKIE_SESION));

let b: Base;
beforeAll(async () => {
  b = await prepararBase();
});

describe("ingreso solo con PIN", () => {
  it("reconoce al usuario por su PIN y lo lleva a su pantalla según el rol", async () => {
    await comoUsuario(null);
    const admin = await iniciarSesion({ pin: PINES.admin });
    expect(admin).toMatchObject({ ok: true, destino: "/admin/dashboard", usuarioId: b.admin.id, usuario: "admin" });
    expect((await sesionActual())?.rol).toBe("admin");

    const cajero = await iniciarSesion({ pin: PINES.ana });
    expect(cajero).toMatchObject({ ok: true, destino: "/cajero/venta", usuarioId: b.cajeroNorte.id });
    expect(await sesionActual()).toMatchObject({ uid: b.cajeroNorte.id, rol: "cajero", sucursalId: b.norte.id });
  });

  it("al primer ingreso guarda la huella del PIN (los siguientes son de una sola consulta)", async () => {
    const [u] = await db.select({ h: usuarios.pinHuella }).from(usuarios).where(eq(usuarios.id, b.admin.id));
    expect(u.h).toMatch(/^[0-9a-f]{8}:[0-9a-f]{64}$/);
    expect((await iniciarSesion({ pin: PINES.admin })).ok).toBe(true);
  });

  it("un usuario desactivado no entra", async () => {
    await db.update(usuarios).set({ activo: false }).where(eq(usuarios.id, b.cajeroSur.id));
    expect(await iniciarSesion({ pin: PINES.beto })).toEqual({ ok: false, error: "PIN incorrecto" });
    await db.update(usuarios).set({ activo: true }).where(eq(usuarios.id, b.cajeroSur.id));
    await db.delete(intentosIngreso);
  });

  it("no se puede crear ni asignar un PIN que ya usa otra persona", async () => {
    await comoUsuario(b.admin);
    const r = await crearUsuario({ nombre: "Carla", usuario: "carla", rol: "cajero", sucursalId: b.norte.id, pin: PINES.beto, activo: true } as never);
    expect(r).toMatchObject({ ok: false, campos: { pin: expect.stringMatching(/ya lo usa otra persona/) } });
    expect(await restablecerPin({ id: b.cajeroSur.id, pin: PINES.ana })).toMatchObject({ ok: false });
    expect(await restablecerPin({ id: b.cajeroSur.id, pin: "771234" })).toEqual({ ok: true });
    await comoUsuario(null);
    expect(await iniciarSesion({ pin: "771234" })).toMatchObject({ ok: true, usuarioId: b.cajeroSur.id });
  });

  it("5 PIN incorrectos bloquean el dispositivo/red 15 minutos, aunque luego ponga uno correcto", async () => {
    await comoUsuario(null);
    for (let i = 1; i <= 4; i++) expect(await iniciarSesion({ pin: "0000" })).toEqual({ ok: false, error: "PIN incorrecto" });
    const quinto = await iniciarSesion({ pin: "0000" });
    expect(quinto.ok === false && quinto.error).toMatch(/Demasiados intentos fallidos/);
    const correcto = await iniciarSesion({ pin: PINES.admin });
    expect(correcto.ok === false && correcto.error).toMatch(/Demasiados intentos fallidos/);
    await db.delete(intentosIngreso);
    expect((await iniciarSesion({ pin: PINES.admin })).ok).toBe(true);
  });
});
