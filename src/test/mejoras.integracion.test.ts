/**
 * Contra una base real (en memoria): ingreso automático al completar el PIN, gastos sin caja del administrador y del
 * encargado, sueldos del personal y notificaciones al celular (Web Push, con el envío simulado).
 */
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

const envios: { endpoint: string; mensaje: { titulo: string; cuerpo: string; url: string } }[] = [];
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (sub: { endpoint: string }, cuerpo: string) => {
      if (sub.endpoint.includes("vencido")) throw Object.assign(new Error("Gone"), { statusCode: 410 });
      envios.push({ endpoint: sub.endpoint, mensaje: JSON.parse(cuerpo) });
    },
  },
}));

import { agregarGasto, anularGasto } from "@/app/admin/gastos/acciones";
import { anularMovimientoSueldo, guardarSueldo, registrarMovimientoSueldo } from "@/app/admin/sueldos/acciones";
import { abrirCaja } from "@/app/cajero/acciones";
import { db } from "@/db";
import { alertas, auditoria, cajas, gastos, intentosIngreso, movimientosSueldo, suscripcionesPush, usuarios } from "@/db/schema";
import { iniciarSesion } from "@/lib/auth/acciones";
import { totalesCaja } from "@/lib/caja/consultas";
import { hoyEnBolivia } from "@/lib/formato";
import { guardarSuscripcionPush, quitarSuscripcionPush } from "@/lib/notificaciones/acciones";
import { despacharAlertas } from "@/lib/notificaciones/despacho";
import { listarGastos, resumenGastos } from "@/lib/reportes/gastos";
import { periodoDe, periodoVecino } from "@/lib/sueldos/calculo";
import { planillaDelMes } from "@/lib/sueldos/consultas";
import { comoUsuario, PINES, prepararBase, type Base } from "./base";

let b: Base;
beforeAll(async () => {
  b = await prepararBase();
});

const SIN_PERMISO = { ok: false, error: "No tienes permiso para esta acción" };

describe("ingreso automático al completar el PIN", () => {
  const fallos = async () => (await db.select().from(intentosIngreso))[0]?.intentos ?? 0;
  const probar = (pin: string) => iniciarSesion({ pin, automatico: true });

  it("un PIN de 4 dígitos válido entra solo, sin tocar Ingresar", async () => {
    await comoUsuario(null);
    expect(await probar(PINES.ana)).toMatchObject({ ok: true, destino: "/cajero/venta" });
    expect(await fallos()).toBe(0);
  });

  it("escribir un PIN de 6 dígitos (se prueba a los 4, 5 y 6) cuenta como un solo intento y entra", async () => {
    await comoUsuario(null);
    const pin = PINES.beto; // 6 dígitos
    expect((await probar(pin.slice(0, 4))).ok).toBe(false);
    expect(await fallos()).toBe(1);
    expect((await probar(pin.slice(0, 5))).ok).toBe(false);
    expect(await fallos()).toBe(1); // mismo PIN con un dígito más: no suma
    expect(await iniciarSesion({ pin })).toMatchObject({ ok: true, usuarioId: b.cajeroSur.id });
    expect(await db.select().from(intentosIngreso)).toEqual([]); // al entrar se limpia
    // Las pruebas automáticas no llenan la auditoría de "PIN incorrecto".
    expect(await db.select().from(auditoria).where(eq(auditoria.accion, "login_fallido"))).toEqual([]);
  });

  it("el encargado entra directo a la venta (ya no tiene pantalla de inicio)", async () => {
    await comoUsuario(null);
    expect(await iniciarSesion({ pin: PINES.elsa })).toMatchObject({ ok: true, destino: "/cajero/venta" });
  });

  it("probar PIN distintos sí suma: al quinto se bloquea, también en automático", async () => {
    await comoUsuario(null);
    for (const pin of ["1111", "2222", "3333", "4444"]) expect(await probar(pin)).toEqual({ ok: false, error: "PIN incorrecto" });
    expect(await fallos()).toBe(4);
    // Un PIN más largo que NO empieza con el anterior es otro intento.
    const quinto = await probar("55555");
    expect(!quinto.ok && quinto.error).toMatch(/Demasiados intentos/);
    const conElBueno = await probar(PINES.ana);
    expect(!conElBueno.ok && conElBueno.error).toMatch(/Demasiados intentos/);
    await db.delete(intentosIngreso);
  });
});

describe("gastos sin caja (administrador y encargado)", () => {
  const gasto = (sucursalId: number, monto = "150") => ({ sucursalId, categoria: "Servicios" as const, monto, descripcion: "Luz de octubre", fotoUrl: null });
  const hoy = hoyEnBolivia();
  const filtro = (sucursalId: number | null) => ({ desde: hoy, hasta: hoy, sucursalId, cajeroId: null, metodo: null, productoId: null, categoria: null });

  it("el administrador agrega un gasto en la sucursal que elija; cuenta en los reportes y no toca ninguna caja", async () => {
    await comoUsuario(b.cajeroNorte);
    await abrirCaja({ montoInicial: "100" });
    const [caja] = await db.select().from(cajas).where(and(eq(cajas.cajeroId, b.cajeroNorte.id), eq(cajas.estado, "abierta")));

    await comoUsuario(b.admin);
    expect(await agregarGasto(gasto(b.norte.id))).toEqual({ ok: true });
    const [g] = await db.select().from(gastos);
    expect(g).toMatchObject({ cajaId: null, sucursalId: b.norte.id, usuarioId: b.admin.id, monto: "150.00", categoria: "Servicios" });
    expect((await resumenGastos(filtro(b.norte.id))).total).toBe("150.00");
    expect((await listarGastos(filtro(null), 10))[0]).toMatchObject({ sinCaja: true, cajaAbierta: true, cajero: "Admin Prueba", sucursal: "Sucursal Norte" });
    // El efectivo esperado de la caja abierta de esa sucursal no cambia.
    expect(await totalesCaja(caja.id, caja.montoInicial)).toMatchObject({ gastos: "0", esperado: "100.00" });
    expect((await db.select().from(auditoria).where(eq(auditoria.accion, "gasto_registrado"))).at(-1)?.detalle).toMatchObject({ monto: "150", rol: "admin" });
  });

  it("el encargado agrega gastos solo en su sucursal; el cajero no puede; monto y categoría se validan", async () => {
    await comoUsuario(b.encargadoNorte);
    expect(await agregarGasto(gasto(b.norte.id, "40,50"))).toEqual({ ok: true });
    expect(await agregarGasto(gasto(b.sur.id))).toEqual({ ok: false, error: "Solo puedes registrar gastos de tu sucursal" });
    expect((await agregarGasto(gasto(b.norte.id, "0"))).ok).toBe(false);
    expect((await agregarGasto({ ...gasto(b.norte.id), categoria: "Inventada" as never })).ok).toBe(false);
    await comoUsuario(b.cajeroNorte);
    expect(await agregarGasto(gasto(b.norte.id))).toEqual(SIN_PERMISO);
    expect((await resumenGastos(filtro(b.norte.id))).total).toBe("190.50");
    expect((await resumenGastos(filtro(b.sur.id))).total).toBe("0");
  });

  it("un gasto sin caja lo anula el administrador con motivo (no el encargado)", async () => {
    const [g] = await db.select().from(gastos).where(eq(gastos.usuarioId, b.encargadoNorte.id));
    await comoUsuario(b.encargadoNorte);
    expect(await anularGasto({ id: g.id, motivo: "Me equivoqué" })).toEqual(SIN_PERMISO);
    await comoUsuario(b.admin);
    expect(await anularGasto({ id: g.id, motivo: "Registrado dos veces" })).toEqual({ ok: true });
    expect((await resumenGastos(filtro(b.norte.id))).total).toBe("150.00");
  });
});

describe("sueldos", () => {
  const mes = periodoDe(hoyEnBolivia());
  const anterior = periodoVecino(mes, -1);
  const fila = async (periodo: string, usuarioId: number) => (await planillaDelMes(periodo)).find((f) => f.usuarioId === usuarioId)!;

  it("solo el administrador ve y registra sueldos", async () => {
    for (const u of [b.encargadoNorte, b.cajeroNorte]) {
      await comoUsuario(u);
      expect(await guardarSueldo({ usuarioId: b.cajeroNorte.id, periodo: mes, monto: "9999" })).toEqual(SIN_PERMISO);
      expect(await registrarMovimientoSueldo({ usuarioId: u.id, periodo: mes, tipo: "bono", monto: "500", nota: "" })).toEqual(SIN_PERMISO);
    }
    expect((await db.select().from(usuarios).where(eq(usuarios.id, b.cajeroNorte.id)))[0].sueldoMensual).toBe("0.00");
  });

  it("sueldo, adelanto, descuento, bono y pago: calcula lo que falta pagar", async () => {
    await comoUsuario(b.admin);
    expect(await guardarSueldo({ usuarioId: b.cajeroNorte.id, periodo: mes, monto: "2500" })).toEqual({ ok: true });
    const mov = (tipo: "adelanto" | "descuento" | "bono" | "pago", monto: string, nota = "") => registrarMovimientoSueldo({ usuarioId: b.cajeroNorte.id, periodo: mes, tipo, monto, nota });
    expect(await mov("adelanto", "500")).toEqual({ ok: true });
    expect(await mov("bono", "150", "Meta del mes")).toEqual({ ok: true });
    expect((await mov("descuento", "100")).ok).toBe(false); // el descuento exige motivo
    expect(await mov("descuento", "100", "Falta injustificada")).toEqual({ ok: true });
    expect((await mov("pago", "0")).ok).toBe(false);
    expect((await fila(mes, b.cajeroNorte.id)).resumen).toMatchObject({ sueldo: "2500.00", aPagar: "2550.00", entregado: "500.00", saldo: "2050.00" });
    expect(await mov("pago", "2050")).toEqual({ ok: true });
    expect((await fila(mes, b.cajeroNorte.id)).resumen.saldo).toBe("0.00");
    expect((await db.select().from(auditoria).where(eq(auditoria.accion, "sueldo_movimiento"))).length).toBe(4);
  });

  it("cambiar el sueldo no altera un mes que ya tenía su sueldo fijado; los movimientos se anulan con motivo", async () => {
    await comoUsuario(b.admin);
    // El mes anterior queda fijado con el sueldo de entonces (2500) al registrar un movimiento.
    expect(await registrarMovimientoSueldo({ usuarioId: b.cajeroNorte.id, periodo: anterior, tipo: "adelanto", monto: "300", nota: "" })).toEqual({ ok: true });
    expect(await guardarSueldo({ usuarioId: b.cajeroNorte.id, periodo: mes, monto: "3000" })).toEqual({ ok: true });
    expect((await fila(anterior, b.cajeroNorte.id)).resumen).toMatchObject({ sueldo: "2500.00", saldo: "2200.00" });
    expect((await fila(mes, b.cajeroNorte.id)).resumen).toMatchObject({ sueldo: "3000.00", saldo: "500.00" });
    // Quien no tiene nada registrado usa su sueldo vigente.
    expect((await fila(anterior, b.cajeroSur.id)).resumen.sueldo).toBe("0.00");

    const [adelanto] = await db.select().from(movimientosSueldo).where(and(eq(movimientosSueldo.periodo, anterior), eq(movimientosSueldo.tipo, "adelanto")));
    expect((await anularMovimientoSueldo({ id: adelanto.id, motivo: "x" })).ok).toBe(false);
    expect(await anularMovimientoSueldo({ id: adelanto.id, motivo: "Se registró en el mes equivocado" })).toEqual({ ok: true });
    expect(await anularMovimientoSueldo({ id: adelanto.id, motivo: "Otra vez" })).toEqual({ ok: false, error: "El movimiento no existe o ya estaba anulado" });
    const despues = await fila(anterior, b.cajeroNorte.id);
    expect(despues.resumen.saldo).toBe("2500.00");
    expect(despues.movimientos[0]).toMatchObject({ anulado: true, motivoAnulacion: "Se registró en el mes equivocado" });
  });

  it("no se registran meses más allá del siguiente", async () => {
    await comoUsuario(b.admin);
    expect((await registrarMovimientoSueldo({ usuarioId: b.cajeroNorte.id, periodo: periodoVecino(mes, 1), tipo: "adelanto", monto: "50", nota: "" })).ok).toBe(true);
    expect(await registrarMovimientoSueldo({ usuarioId: b.cajeroNorte.id, periodo: periodoVecino(mes, 2), tipo: "adelanto", monto: "50", nota: "" })).toEqual({ ok: false, error: "Ese mes todavía no se puede registrar" });
  });
});

describe("notificaciones al celular", () => {
  const sub = (nombre: string) => ({ endpoint: `https://push.ejemplo.com/${nombre}`, p256dh: "p".repeat(87), auth: "a".repeat(22) });

  beforeAll(() => {
    process.env.NEXT_PUBLIC_VAPID_PUBLICA = "clave-publica-de-prueba";
    process.env.VAPID_PRIVADA = "clave-privada-de-prueba";
  });

  it("administrador y encargado activan las notificaciones en su equipo; el cajero no", async () => {
    await comoUsuario(b.admin);
    expect(await guardarSuscripcionPush(sub("admin"))).toEqual({ ok: true });
    expect(await guardarSuscripcionPush(sub("vencido-admin"))).toEqual({ ok: true });
    await comoUsuario(b.encargadoNorte);
    expect(await guardarSuscripcionPush(sub("encargado-norte"))).toEqual({ ok: true });
    await comoUsuario(b.encargadoSur);
    expect(await guardarSuscripcionPush(sub("encargado-sur"))).toEqual({ ok: true });
    expect((await guardarSuscripcionPush({ ...sub("x"), endpoint: "http://sin-https.com/x" })).ok).toBe(false);
    await comoUsuario(b.cajeroNorte);
    expect(await guardarSuscripcionPush(sub("cajero"))).toEqual(SIN_PERMISO);
    expect((await db.select().from(suscripcionesPush)).length).toBe(4);
  });

  it("cada alerta nueva se envía una sola vez: al administrador todas, al encargado las de stock de su sucursal", async () => {
    // Las alertas que ya existían al preparar la base no cuentan para esta prueba.
    await db.update(alertas).set({ notificada: true });
    await db.insert(alertas).values([
      { tipo: "agotado", sucursalId: b.norte.id, productoId: b.creatina.id, mensaje: "Creatina Test: agotado en Sucursal Norte" },
      { tipo: "caja_diferencia", sucursalId: b.norte.id, mensaje: "Caja de Ana cerrada con faltante de Bs 20,00" },
      { tipo: "stock_bajo", sucursalId: b.bodega.id, productoId: b.proteina.id, mensaje: "Whey Test: quedan 2 en Bodega central" },
    ]);
    envios.length = 0;
    expect(await despacharAlertas()).toBe(4);

    const de = (nombre: string) => envios.filter((e) => e.endpoint.endsWith(`/${nombre}`)).map((e) => e.mensaje);
    expect(de("admin").map((m) => m.titulo).sort()).toEqual(["Agotado", "Diferencia en caja", "Stock bajo"]);
    expect(de("admin").find((m) => m.titulo === "Agotado")).toMatchObject({ cuerpo: "Creatina Test: agotado en Sucursal Norte", url: `/admin/inventario?resaltar=${b.creatina.id}&sucursal=${b.norte.id}` });
    expect(de("admin").find((m) => m.titulo === "Stock bajo")?.url).toBe(`/admin/bodega?resaltar=${b.proteina.id}`);
    expect(de("encargado-norte")).toEqual([expect.objectContaining({ titulo: "Agotado", url: `/cajero/bodega?resaltar=${b.creatina.id}` })]);
    expect(de("encargado-sur")).toEqual([]);

    // El dispositivo que ya no existe (410) se olvida; y nada se envía dos veces.
    expect((await db.select().from(suscripcionesPush)).map((s) => s.endpoint).some((e) => e.includes("vencido"))).toBe(false);
    envios.length = 0;
    expect(await despacharAlertas()).toBe(0);
    expect(envios).toEqual([]);
  });

  it("muchas alertas de golpe se resumen en una sola notificación; las resueltas no se envían", async () => {
    await db.insert(alertas).values([
      ...[1, 2, 3, 4, 5].map((n) => ({ tipo: "stock_bajo" as const, sucursalId: b.sur.id, productoId: b.proteina.id, mensaje: `Producto ${n}: stock bajo` })),
      { tipo: "agotado" as const, sucursalId: b.sur.id, productoId: b.creatina.id, mensaje: "Ya resuelta", resuelta: true },
    ]);
    envios.length = 0;
    expect(await despacharAlertas()).toBe(2);
    expect(envios.map((e) => e.mensaje.titulo)).toEqual(["5 alertas nuevas", "5 alertas nuevas"]);
    expect(envios.map((e) => e.endpoint.split("/").pop()).sort()).toEqual(["admin", "encargado-sur"]);
  });

  it("al desactivarlas (o cerrar sesión) ese equipo deja de recibir; nadie quita la suscripción de otro", async () => {
    await comoUsuario(b.encargadoNorte);
    expect(await quitarSuscripcionPush({ endpoint: sub("admin").endpoint })).toEqual({ ok: true });
    expect((await db.select().from(suscripcionesPush)).some((s) => s.endpoint.endsWith("/admin"))).toBe(true);
    expect(await quitarSuscripcionPush({ endpoint: sub("encargado-norte").endpoint })).toEqual({ ok: true });
    expect((await db.select().from(suscripcionesPush)).some((s) => s.endpoint.endsWith("/encargado-norte"))).toBe(false);
  });

  it("sin claves configuradas no se envía nada (y las alertas quedan pendientes)", async () => {
    delete process.env.VAPID_PRIVADA;
    await db.insert(alertas).values({ tipo: "agotado", sucursalId: b.norte.id, productoId: b.proteina.id, mensaje: "Pendiente" });
    expect(await despacharAlertas()).toBe(0);
    expect((await db.select().from(alertas).where(eq(alertas.mensaje, "Pendiente")))[0].notificada).toBe(false);
  });
});
