/**
 * Recordatorios (aviso al celular a su día y hora), descuentos automáticos con varios productos y combos dentro del
 * apartado de Promociones, contra una base real en memoria. El envío al teléfono se simula (web-push).
 */
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

const envios: { endpoint: string; mensaje: { titulo: string; cuerpo: string; url: string; etiqueta: string } }[] = [];
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (sub: { endpoint: string }, cuerpo: string) => {
      envios.push({ endpoint: sub.endpoint, mensaje: JSON.parse(cuerpo) });
    },
  },
}));

import { guardarPromocion } from "@/app/admin/promociones/acciones";
import { guardarCombo } from "@/app/admin/promociones/combos-acciones";
import { eliminarRecordatorio, guardarRecordatorio } from "@/app/admin/recordatorios/acciones";
import { GET as despachar } from "@/app/api/recordatorios/despachar/route";
import { db } from "@/db";
import { promociones, recordatorios } from "@/db/schema";
import { MENSAJE_CANDADO } from "@/lib/acciones/resultado";
import { cambiarCandado } from "@/lib/auth/modulo-acciones";
import { decidirAcceso } from "@/lib/auth/rutas";
import { hoyEnBolivia } from "@/lib/formato";
import { guardarSuscripcionPush } from "@/lib/notificaciones/acciones";
import { promocionesAutomaticas } from "@/lib/promociones/consultas";
import { aplicarPromociones } from "@/lib/promociones/motor";
import { instanteBolivia } from "@/lib/recordatorios/calculo";
import { despacharRecordatorios } from "@/lib/recordatorios/despacho";
import { comoUsuario, prepararBase, type Base } from "./base";

let b: Base;
beforeAll(async () => {
  b = await prepararBase();
  process.env.NEXT_PUBLIC_VAPID_PUBLICA = "clave-publica-de-prueba";
  process.env.VAPID_PRIVADA = "clave-privada-de-prueba";
});

const SIN_PERMISO = { ok: false, error: "No tienes permiso para esta acción" };
const CANDADO = { ok: false, error: MENSAJE_CANDADO };
const sub = (nombre: string) => ({ endpoint: `https://push.ejemplo.com/${nombre}`, p256dh: "p".repeat(87), auth: "a".repeat(22) });
const dia = (n: number) => hoyEnBolivia(new Date(Date.now() + n * 86_400_000));
const recordatorio = (extra: Record<string, unknown> = {}) => ({ titulo: "Pagar el alquiler", nota: "", fecha: dia(1), hora: "09:00", repeticion: "ninguna" as const, ...extra });
const mios = (usuarioId: number) => db.select().from(recordatorios).where(eq(recordatorios.usuarioId, usuarioId)).orderBy(recordatorios.id);

describe("recordatorios", () => {
  it("solo el administrador (y el encargado con el candado abierto); cada uno ve los suyos", async () => {
    await comoUsuario(b.cajeroNorte);
    expect(await guardarRecordatorio(recordatorio())).toEqual(SIN_PERMISO);
    await comoUsuario(b.encargadoNorte);
    expect(await guardarRecordatorio(recordatorio())).toEqual(CANDADO);

    await comoUsuario(b.admin);
    expect(await guardarRecordatorio(recordatorio())).toEqual({ ok: true });
    const [r] = await mios(b.admin.id);
    expect(r).toMatchObject({ titulo: "Pagar el alquiler", nota: null, hora: "09:00", repeticion: "ninguna", enviadoEn: null });
    expect(r.proximaEn?.toISOString()).toBe(instanteBolivia(dia(1), "09:00").toISOString());

    // Con el candado abierto, el encargado tiene los suyos y no toca los del administrador.
    expect((await cambiarCandado({ modulo: "recordatorios", abierto: true })).ok).toBe(true);
    await comoUsuario(b.encargadoNorte);
    expect(await guardarRecordatorio(recordatorio({ titulo: "Contar la caja chica" }))).toEqual({ ok: true });
    expect(await guardarRecordatorio({ ...recordatorio({ titulo: "Ajeno" }), id: r.id })).toEqual({ ok: false, error: "El recordatorio ya no existe" });
    expect(await eliminarRecordatorio({ id: r.id })).toEqual({ ok: true }); // no borra nada ajeno
    expect((await mios(b.admin.id)).map((x) => x.titulo)).toEqual(["Pagar el alquiler"]);
    expect((await mios(b.encargadoNorte.id)).map((x) => x.titulo)).toEqual(["Contar la caja chica"]);
  });

  it("valida el texto, la hora y que no sea para un momento que ya pasó", async () => {
    await comoUsuario(b.admin);
    expect(await guardarRecordatorio(recordatorio({ titulo: " " }))).toMatchObject({ ok: false, campos: { titulo: "Escribe qué quieres recordar" } });
    expect(await guardarRecordatorio(recordatorio({ hora: "25:00" }))).toMatchObject({ ok: false, campos: { hora: "Hora inválida" } });
    expect(await guardarRecordatorio(recordatorio({ fecha: dia(-2) }))).toMatchObject({ ok: false, campos: { hora: "Ese día y hora ya pasaron" } });
    // Uno que se repite sí puede empezar en el pasado: queda para la siguiente vez.
    expect(await guardarRecordatorio(recordatorio({ titulo: "Revisar stock", fecha: dia(-2), hora: "00:00", repeticion: "diaria" }))).toEqual({ ok: true });
    const diario = (await mios(b.admin.id)).find((x) => x.titulo === "Revisar stock")!;
    expect(diario.proximaEn!.getTime()).toBeGreaterThan(Date.now());
    expect(diario.proximaEn!.getTime()).toBeLessThanOrEqual(Date.now() + 86_400_000);
    await db.delete(recordatorios).where(eq(recordatorios.id, diario.id));
  });

  it("a su hora llega una sola notificación, solo a los equipos de su dueño", async () => {
    await comoUsuario(b.admin);
    await guardarSuscripcionPush(sub("celular-admin"));
    await comoUsuario(b.encargadoNorte);
    await guardarSuscripcionPush(sub("celular-encargado"));

    const hora = instanteBolivia(dia(1), "09:00");
    envios.length = 0;
    expect(await despacharRecordatorios(new Date(hora.getTime() - 60_000))).toBe(0); // un minuto antes: nada
    expect(envios).toEqual([]);

    // Varios disparadores a la vez (cron, app abierta en dos equipos): sale una sola vez.
    const resultados = await Promise.all([despacharRecordatorios(hora), despacharRecordatorios(hora), despacharRecordatorios(hora)]);
    expect(resultados.reduce((a, n) => a + n, 0)).toBe(2); // el del administrador y el del encargado
    expect(envios.map((e) => [e.endpoint.split("/").pop(), e.mensaje.titulo]).sort()).toEqual([
      ["celular-admin", "Recordatorio: Pagar el alquiler"],
      ["celular-encargado", "Recordatorio: Contar la caja chica"],
    ]);
    expect(envios[0].mensaje).toMatchObject({ url: "/admin/recordatorios", cuerpo: "Programado para las 09:00" });

    const [r] = await mios(b.admin.id);
    expect(r).toMatchObject({ proximaEn: null, dispositivos: 1 });
    expect(r.enviadoEn?.toISOString()).toBe(hora.toISOString());
    envios.length = 0;
    expect(await despacharRecordatorios(new Date(hora.getTime() + 3_600_000))).toBe(0);
    expect(envios).toEqual([]);
  });

  it("los que se repiten quedan programados para la siguiente vez; con retraso, el aviso dice para cuándo era", async () => {
    await comoUsuario(b.admin);
    expect(await guardarRecordatorio(recordatorio({ titulo: "Depositar ventas", nota: "Banco Unión", fecha: dia(2), hora: "18:30", repeticion: "semanal" }))).toEqual({ ok: true });
    const hora = instanteBolivia(dia(2), "18:30");
    envios.length = 0;
    expect(await despacharRecordatorios(new Date(hora.getTime() + 2 * 3_600_000))).toBe(1); // nadie abrió la app en 2 horas
    expect(envios[0].mensaje.cuerpo).toMatch(/^Era para el .*18:30\. Banco Unión$/);
    const r = (await mios(b.admin.id)).find((x) => x.titulo === "Depositar ventas")!;
    expect(r.proximaEn?.toISOString()).toBe(new Date(hora.getTime() + 7 * 86_400_000).toISOString());
  });

  it("sin equipos con avisos activados queda anotado; editar uno ya avisado lo vuelve a programar", async () => {
    await comoUsuario(b.admin);
    await db.delete(recordatorios);
    // El administrador sin dispositivos: se quita su suscripción cambiándola de dueño.
    await comoUsuario(b.encargadoNorte);
    await guardarSuscripcionPush(sub("celular-admin"));
    await comoUsuario(b.admin);
    expect(await guardarRecordatorio(recordatorio())).toEqual({ ok: true });
    envios.length = 0;
    expect(await despacharRecordatorios(instanteBolivia(dia(1), "09:00"))).toBe(0);
    const [r] = await mios(b.admin.id);
    expect(r).toMatchObject({ proximaEn: null, dispositivos: 0 });
    expect(r.enviadoEn).not.toBeNull();

    expect(await guardarRecordatorio({ ...recordatorio({ fecha: dia(3), hora: "07:15" }), id: r.id })).toEqual({ ok: true });
    expect((await mios(b.admin.id))[0].proximaEn?.toISOString()).toBe(instanteBolivia(dia(3), "07:15").toISOString());
    expect(await eliminarRecordatorio({ id: r.id })).toEqual({ ok: true });
    expect(await mios(b.admin.id)).toEqual([]);
  });

  it("el disparador (cron y app abierta) no pide sesión y no devuelve datos", async () => {
    expect(decidirAcceso("/api/recordatorios/despachar", null)).toEqual({ tipo: "seguir" });
    const r = await despachar();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });
});

describe("descuentos automáticos con varios productos", () => {
  const promo = (extra: Record<string, unknown> = {}) =>
    ({ nombre: "10 % en proteína y creatina", tipo: "porcentaje", valor: "10", comboLleva: null, comboPaga: null, alcance: "producto", productoIds: [], categoriaIds: [], sucursalId: null, desde: dia(-1), hasta: dia(1), requiereCupon: false, activo: true, ...extra }) as never;

  it("se eligen varios y el descuento llega a cada uno", async () => {
    await comoUsuario(b.admin);
    expect(await guardarPromocion(promo())).toMatchObject({ ok: false, campos: { productoIds: "Elige al menos un producto" } });
    expect(await guardarPromocion(promo({ productoIds: [b.proteina.id, 999_999] }))).toMatchObject({ ok: false, campos: { productoIds: "Algún producto ya no existe" } });
    expect(await guardarPromocion(promo({ productoIds: [b.proteina.id, b.creatina.id, b.creatina.id] }))).toEqual({ ok: true });
    const [guardada] = await db.select().from(promociones);
    expect(guardada).toMatchObject({ alcance: "producto", productoIds: [b.proteina.id, b.creatina.id], categoriaIds: [], productoId: null });

    const vigentes = await promocionesAutomaticas(b.norte.id);
    const r = aplicarPromociones(
      [
        { productoId: b.proteina.id, categoriaId: null, cantidad: 1, precioUnitario: "350.00" },
        { productoId: b.creatina.id, categoriaId: null, cantidad: 2, precioUnitario: "120.00" },
      ],
      vigentes,
    );
    expect(r).toMatchObject({ subtotal: "590.00", descuento: "59.00", total: "531.00" });
  });

  it("las promociones antiguas (un solo producto) siguen aplicando", async () => {
    await db.update(promociones).set({ productoIds: [], productoId: b.creatina.id });
    const r = aplicarPromociones(
      [
        { productoId: b.proteina.id, categoriaId: null, cantidad: 1, precioUnitario: "350.00" },
        { productoId: b.creatina.id, categoriaId: null, cantidad: 1, precioUnitario: "120.00" },
      ],
      (await db.select().from(promociones)).map((p) => ({ ...p, alcance: p.alcance })),
    );
    expect(r).toMatchObject({ descuento: "12.00" });
  });
});

describe("combos dentro de Promociones y cupones", () => {
  it("usan el candado de Promociones", async () => {
    const combo = { nombre: "Pack", descripcion: "", fotoUrl: null, tipoDescuento: "porcentaje", valorDescuento: "10", fechaInicio: null, fechaFin: null, activo: true, items: [{ productoId: b.proteina.id, cantidad: 1, fraccion: false }, { productoId: b.creatina.id, cantidad: 1, fraccion: false }] } as never;
    await comoUsuario(b.encargadoNorte);
    expect(await guardarCombo(combo)).toEqual(CANDADO);
    await comoUsuario(b.admin);
    expect((await cambiarCandado({ modulo: "combos", abierto: true })).ok).toBe(false); // ya no es un apartado aparte
    expect((await cambiarCandado({ modulo: "promociones", abierto: true })).ok).toBe(true);
    await comoUsuario(b.encargadoNorte);
    expect(await guardarCombo(combo)).toMatchObject({ ok: true });
  });
});
