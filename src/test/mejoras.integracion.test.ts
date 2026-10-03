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
import { anularMovimientoSueldo, darDeBajaTrabajador, guardarSueldo, guardarTrabajador, registrarMovimientoSueldo, reincorporarTrabajador } from "@/app/admin/sueldos/acciones";
import { abrirCaja } from "@/app/cajero/acciones";
import { db } from "@/db";
import { alertas, auditoria, cajas, empleados, gastos, intentosIngreso, movimientosSueldo, suscripcionesPush, usuarios } from "@/db/schema";
import { MENSAJE_CANDADO } from "@/lib/acciones/resultado";
import { iniciarSesion } from "@/lib/auth/acciones";
import { cambiarCandado } from "@/lib/auth/modulo-acciones";
import { totalesCaja } from "@/lib/caja/consultas";
import { hoyEnBolivia } from "@/lib/formato";
import { guardarSuscripcionPush, quitarSuscripcionPush } from "@/lib/notificaciones/acciones";
import { despacharAlertas } from "@/lib/notificaciones/despacho";
import { listarGastos, resumenGastos } from "@/lib/reportes/gastos";
import { periodoDe, periodoVecino } from "@/lib/sueldos/calculo";
import { asegurarEmpleados, planillaDelMes } from "@/lib/sueldos/consultas";
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

  it("el encargado entra a su primer apartado abierto (por la pantalla de entrada)", async () => {
    await comoUsuario(null);
    expect(await iniciarSesion({ pin: PINES.elsa })).toMatchObject({ ok: true, destino: "/admin/inicio" });
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

  it("el encargado agrega gastos solo con el candado de Gastos abierto; el cajero no; monto y categoría se validan", async () => {
    await comoUsuario(b.encargadoNorte);
    expect(await agregarGasto(gasto(b.norte.id, "40,50"))).toEqual({ ok: false, error: MENSAJE_CANDADO });
    await comoUsuario(b.admin);
    expect(await cambiarCandado({ modulo: "gastos", abierto: true })).toMatchObject({ ok: true });
    await comoUsuario(b.encargadoNorte);
    expect(await agregarGasto(gasto(b.norte.id, "40,50"))).toEqual({ ok: true });
    expect((await agregarGasto(gasto(b.norte.id, "0"))).ok).toBe(false);
    expect((await agregarGasto({ ...gasto(b.norte.id), categoria: "Inventada" as never })).ok).toBe(false);
    await comoUsuario(b.cajeroNorte);
    expect(await agregarGasto(gasto(b.norte.id))).toEqual(SIN_PERMISO);
    expect((await resumenGastos(filtro(b.norte.id))).total).toBe("190.50");
    expect((await resumenGastos(filtro(b.sur.id))).total).toBe("0");
  });

  it("un gasto sin caja se anula con motivo (administrador, o encargado con Gastos abierto)", async () => {
    const [g] = await db.select().from(gastos).where(eq(gastos.usuarioId, b.encargadoNorte.id));
    await comoUsuario(b.cajeroNorte);
    expect(await anularGasto({ id: g.id, motivo: "Me equivoqué" })).toEqual(SIN_PERMISO);
    await comoUsuario(b.admin);
    expect(await anularGasto({ id: g.id, motivo: "Registrado dos veces" })).toEqual({ ok: true });
    expect((await resumenGastos(filtro(b.norte.id))).total).toBe("150.00");
    expect(await cambiarCandado({ modulo: "gastos", abierto: false })).toMatchObject({ ok: true });
  });
});

describe("sueldos y trabajadores", () => {
  const hoy = hoyEnBolivia();
  const mes = periodoDe(hoy);
  const anterior = periodoVecino(mes, -1);
  const fila = async (periodo: string, empleadoId: number, conBajas = false) => (await planillaDelMes(periodo, { conBajas })).find((f) => f.empleadoId === empleadoId)!;
  let ana: number; // la cajera de Norte, como trabajadora
  let beto: number;
  let rosa: number; // trabajadora sin usuario en el sistema

  it("cada usuario del sistema aparece solo en la planilla; solo el administrador la ve y la cambia", async () => {
    await asegurarEmpleados();
    await asegurarEmpleados(); // repetir no duplica
    const todos = await db.select().from(empleados);
    expect(todos.length).toBe((await db.select().from(usuarios)).length);
    ana = todos.find((e) => e.usuarioId === b.cajeroNorte.id)!.id;
    beto = todos.find((e) => e.usuarioId === b.cajeroSur.id)!.id;

    for (const u of [b.encargadoNorte, b.cajeroNorte]) {
      await comoUsuario(u);
      const rechazo = u === b.cajeroNorte ? SIN_PERMISO : { ok: false, error: MENSAJE_CANDADO }; // el encargado, por el candado cerrado
      expect(await guardarSueldo({ empleadoId: ana, periodo: mes, monto: "9999" })).toEqual(rechazo);
      expect(await registrarMovimientoSueldo({ empleadoId: ana, periodo: mes, tipo: "bono", monto: "500", nota: "" })).toEqual(rechazo);
      expect(await guardarTrabajador({ nombre: "Intruso", cargo: "", sucursalId: null, fechaIngreso: hoy, sueldoMensual: "1" })).toEqual(rechazo);
      expect(await darDeBajaTrabajador({ id: beto, fecha: hoy, motivo: "Porque quiero" })).toEqual(rechazo);
    }
    expect((await db.select().from(empleados).where(eq(empleados.id, ana)))[0].sueldoMensual).toBe("0.00");
  });

  it("nuevo trabajador sin usuario, con su fecha de ingreso y sueldo; a los que ya trabajan se les pone desde cuando", async () => {
    await comoUsuario(b.admin);
    expect((await guardarTrabajador({ nombre: "", cargo: "", sucursalId: null, fechaIngreso: hoy, sueldoMensual: "100" })).ok).toBe(false);
    expect(await guardarTrabajador({ nombre: "Rosa Limpieza", cargo: "Limpieza", sucursalId: b.norte.id, fechaIngreso: "2026-03-15", sueldoMensual: "1200" })).toEqual({ ok: true });
    rosa = (await db.select().from(empleados).where(eq(empleados.nombre, "Rosa Limpieza")))[0].id;
    expect(await fila(mes, rosa)).toMatchObject({ nombre: "Rosa Limpieza", cargo: "Limpieza", rol: null, sucursal: "Sucursal Norte", fechaIngreso: "2026-03-15", resumen: { sueldo: "1200.00", saldo: "1200.00" } });
    expect((await fila(mes, rosa)).historial).toEqual([expect.objectContaining({ tipo: "ingreso", fecha: "2026-03-15" })]);

    // A la cajera (ya trabajaba) se le pone su fecha; corregirla actualiza el historial en vez de duplicarlo.
    const datos = { id: ana, nombre: "Ana Norte", cargo: "", sucursalId: b.norte.id, sueldoMensual: "0" };
    expect(await guardarTrabajador({ ...datos, fechaIngreso: "2025-01-10" })).toEqual({ ok: true });
    expect(await guardarTrabajador({ ...datos, fechaIngreso: "2025-01-20" })).toEqual({ ok: true });
    const f = await fila(mes, ana);
    expect(f).toMatchObject({ fechaIngreso: "2025-01-20", rol: "cajero" });
    expect(f.historial.map((e) => [e.tipo, e.fecha])).toEqual([["ingreso", "2025-01-20"]]);
  });

  it("sueldo, adelanto, descuento, bono y pago: calcula lo que falta pagar", async () => {
    await comoUsuario(b.admin);
    expect(await guardarSueldo({ empleadoId: ana, periodo: mes, monto: "2500" })).toEqual({ ok: true });
    const mov = (tipo: "adelanto" | "descuento" | "bono" | "pago", monto: string, nota = "") => registrarMovimientoSueldo({ empleadoId: ana, periodo: mes, tipo, monto, nota });
    expect(await mov("adelanto", "500")).toEqual({ ok: true });
    expect(await mov("bono", "150", "Meta del mes")).toEqual({ ok: true });
    expect((await mov("descuento", "100")).ok).toBe(false); // el descuento exige motivo
    expect(await mov("descuento", "100", "Falta injustificada")).toEqual({ ok: true });
    expect((await mov("pago", "0")).ok).toBe(false);
    expect((await fila(mes, ana)).resumen).toMatchObject({ sueldo: "2500.00", aPagar: "2550.00", entregado: "500.00", saldo: "2050.00" });
    expect(await mov("pago", "2050")).toEqual({ ok: true });
    expect((await fila(mes, ana)).resumen.saldo).toBe("0.00");
    expect((await db.select().from(auditoria).where(eq(auditoria.accion, "sueldo_movimiento"))).length).toBe(4);
  });

  it("cambiar el sueldo no altera un mes que ya tenia su sueldo fijado; los movimientos se anulan con motivo", async () => {
    await comoUsuario(b.admin);
    expect(await registrarMovimientoSueldo({ empleadoId: ana, periodo: anterior, tipo: "adelanto", monto: "300", nota: "" })).toEqual({ ok: true });
    expect(await guardarSueldo({ empleadoId: ana, periodo: mes, monto: "3000" })).toEqual({ ok: true });
    expect((await fila(anterior, ana)).resumen).toMatchObject({ sueldo: "2500.00", saldo: "2200.00" });
    expect((await fila(mes, ana)).resumen).toMatchObject({ sueldo: "3000.00", saldo: "500.00" });
    expect((await fila(anterior, beto)).resumen.sueldo).toBe("0.00");

    const [adelanto] = await db.select().from(movimientosSueldo).where(and(eq(movimientosSueldo.periodo, anterior), eq(movimientosSueldo.tipo, "adelanto")));
    expect((await anularMovimientoSueldo({ id: adelanto.id, motivo: "x" })).ok).toBe(false);
    expect(await anularMovimientoSueldo({ id: adelanto.id, motivo: "Se registro en el mes equivocado" })).toEqual({ ok: true });
    expect(await anularMovimientoSueldo({ id: adelanto.id, motivo: "Otra vez" })).toEqual({ ok: false, error: "El movimiento no existe o ya estaba anulado" });
    const despues = await fila(anterior, ana);
    expect(despues.resumen.saldo).toBe("2500.00");
    expect(despues.movimientos[0]).toMatchObject({ anulado: true, motivoAnulacion: "Se registro en el mes equivocado" });
  });

  it("no se registran meses mas alla del siguiente", async () => {
    await comoUsuario(b.admin);
    expect((await registrarMovimientoSueldo({ empleadoId: ana, periodo: periodoVecino(mes, 1), tipo: "adelanto", monto: "50", nota: "" })).ok).toBe(true);
    expect(await registrarMovimientoSueldo({ empleadoId: ana, periodo: periodoVecino(mes, 2), tipo: "adelanto", monto: "50", nota: "" })).toEqual({ ok: false, error: "Ese mes todavía no se puede registrar" });
  });

  it("baja con fecha y motivo: queda en el historial, sale de los meses siguientes y pierde el acceso al sistema", async () => {
    await comoUsuario(b.admin);
    expect((await darDeBajaTrabajador({ id: beto, fecha: hoy, motivo: "" })).ok).toBe(false); // motivo obligatorio
    expect((await darDeBajaTrabajador({ id: beto, fecha: "2999-01-01", motivo: "Despido" })).ok).toBe(false); // no en el futuro
    expect((await darDeBajaTrabajador({ id: rosa, fecha: "2026-01-01", motivo: "Antes de entrar" })).ok).toBe(false); // no antes de su ingreso
    expect(await darDeBajaTrabajador({ id: beto, fecha: hoy, motivo: "Despido por faltas reiteradas" })).toEqual({ ok: true });

    const f = await fila(mes, beto);
    expect(f).toMatchObject({ fechaBaja: hoy, motivoBaja: "Despido por faltas reiteradas" });
    expect(f.historial[0]).toMatchObject({ tipo: "baja", fecha: hoy, motivo: "Despido por faltas reiteradas", registradoPor: "Admin Prueba" });
    // El mes siguiente ya no aparece (salvo que se pidan los dados de baja).
    expect(await fila(periodoVecino(mes, 1), beto)).toBeUndefined();
    expect(await fila(periodoVecino(mes, 1), beto, true)).toMatchObject({ fechaBaja: hoy });
    // Su usuario quedo desactivado: ya no entra con su PIN.
    expect((await db.select().from(usuarios).where(eq(usuarios.id, b.cajeroSur.id)))[0].activo).toBe(false);
    expect(await darDeBajaTrabajador({ id: beto, fecha: hoy, motivo: "Otra vez" })).toEqual({ ok: false, error: "El trabajador no existe o ya estaba dado de baja" });
    expect((await db.select().from(auditoria).where(eq(auditoria.accion, "trabajador_baja"))).at(-1)?.detalle).toMatchObject({ persona: "Beto Sur", motivo: "Despido por faltas reiteradas" });

    // El administrador no puede darse de baja a si mismo (perderia su acceso).
    const [yo] = await db.select().from(empleados).where(eq(empleados.usuarioId, b.admin.id));
    const propia = await darDeBajaTrabajador({ id: yo.id, fecha: hoy, motivo: "Me voy" });
    expect(!propia.ok && propia.error).toMatch(/No se pudo quitar su acceso/);
    expect((await db.select().from(empleados).where(eq(empleados.id, yo.id)))[0].fechaBaja).toBeNull();
  });

  it("reincorporar: vuelve a la planilla y el historial conserva la baja anterior", async () => {
    await comoUsuario(b.admin);
    expect(await reincorporarTrabajador({ id: rosa, fecha: hoy })).toEqual({ ok: false, error: "El trabajador no existe o no estaba dado de baja" });
    expect(await reincorporarTrabajador({ id: beto, fecha: hoy })).toEqual({ ok: true });
    const f = await fila(periodoVecino(mes, 1), beto);
    expect(f).toMatchObject({ fechaBaja: null, motivoBaja: null, fechaIngreso: hoy });
    expect(f.historial.map((e) => e.tipo)).toEqual(["reincorporacion", "baja"]);
    await db.update(usuarios).set({ activo: true }).where(eq(usuarios.id, b.cajeroSur.id));
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

  it("cada alerta nueva se envía una sola vez a cada equipo: administrador y encargado reciben las mismas", async () => {
    // Las alertas que ya existían al preparar la base no cuentan para esta prueba.
    await db.update(alertas).set({ notificada: true });
    await db.insert(alertas).values([
      { tipo: "agotado", sucursalId: b.norte.id, productoId: b.creatina.id, mensaje: "Creatina Test: agotado en Sucursal Norte" },
      { tipo: "caja_diferencia", sucursalId: b.norte.id, mensaje: "Caja de Ana cerrada con faltante de Bs 20,00" },
      { tipo: "stock_bajo", sucursalId: b.bodega.id, productoId: b.proteina.id, mensaje: "Whey Test: quedan 2 en Bodega central" },
    ]);
    envios.length = 0;
    expect(await despacharAlertas()).toBe(9);

    const de = (nombre: string) => envios.filter((e) => e.endpoint.endsWith(`/${nombre}`)).map((e) => e.mensaje);
    expect(de("admin").map((m) => m.titulo).sort()).toEqual(["Agotado", "Diferencia en caja", "Stock bajo"]);
    expect(de("admin").find((m) => m.titulo === "Agotado")).toMatchObject({ cuerpo: "Creatina Test: agotado en Sucursal Norte", url: `/admin/inventario?resaltar=${b.creatina.id}&sucursal=${b.norte.id}` });
    expect(de("admin").find((m) => m.titulo === "Stock bajo")?.url).toBe(`/admin/bodega?resaltar=${b.proteina.id}`);
    for (const e of ["encargado-norte", "encargado-sur"]) expect(de(e).map((m) => m.url).sort()).toEqual(de("admin").map((m) => m.url).sort());

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
    expect(await despacharAlertas()).toBe(3);
    expect(envios.map((e) => e.mensaje.titulo)).toEqual(["5 alertas nuevas", "5 alertas nuevas", "5 alertas nuevas"]);
    expect(envios.map((e) => e.endpoint.split("/").pop()).sort()).toEqual(["admin", "encargado-norte", "encargado-sur"]);
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
