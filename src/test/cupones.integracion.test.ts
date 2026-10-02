/**
 * Cupones y descuentos contra la base en memoria: crear cupones (solo admin), validación para el cajero con el motivo
 * exacto, venta con cupón (porcentaje, monto fijo una sola vez, monto mínimo, alcance, acumulación, límite de usos),
 * descuento manual del cajero con su máximo y auditoría, y venta sin conexión con descuento manual.
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { guardarCombo } from "@/app/admin/combos/acciones";
import { guardarConfiguracion } from "@/app/admin/configuracion/acciones";
import { cambiarEstadoCupon, eliminarCupon, guardarCupon } from "@/app/admin/promociones/acciones";
import { anularVenta } from "@/app/admin/reportes/acciones";
import { POST as sincronizar } from "@/app/api/sync/route";
import { abrirCaja, consultarCupon, registrarVenta } from "@/app/cajero/acciones";
import { db } from "@/db";
import { alertas, auditoria, cajas, cupones, detalleVenta, promociones, ventas } from "@/db/schema";
import { hoyEnBolivia, inicioDiaBolivia } from "@/lib/formato";
import { cambiarStock } from "@/lib/inventario/stock";
import { reporteDescuentos } from "@/lib/reportes/ventas";
import { comoUsuario, prepararBase, type Base } from "./base";

let b: Base;
const HOY = hoyEnBolivia();
const dias = (n: number) => new Date(Date.parse(`${HOY}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const cupon = (extra: Partial<Parameters<typeof guardarCupon>[0]> = {}) => ({
  codigo: "DIEZ",
  descripcion: "10 % en toda la compra",
  tipo: "porcentaje" as const,
  valor: "10",
  montoMinimo: "",
  fechaInicio: null,
  fechaFin: null,
  usosMaximos: "" as const,
  alcance: "todo" as const,
  productoIds: [],
  categoriaIds: [],
  sucursalIds: [],
  acumulaPromociones: false,
  acumulaCombos: false,
  activo: true,
  ...extra,
});
const crear = async (extra: Partial<Parameters<typeof guardarCupon>[0]>) => {
  await comoUsuario(b.admin);
  const r = await guardarCupon(cupon(extra));
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.campos)}`);
  await comoUsuario(b.cajeroNorte);
};
const venta = (extra: Partial<Parameters<typeof registrarVenta>[0]>) =>
  registrarVenta({ uuid: randomUUID(), lineas: [], metodoPago: "efectivo", montoRecibido: "9000", clienteNombre: null, clienteTelefono: null, cuponCodigo: null, ...extra });
const usos = async (codigo: string) => (await db.select().from(cupones).where(eq(cupones.codigo, codigo)))[0].usosActuales;
const ultimaVenta = async () => (await db.select().from(ventas).orderBy(ventas.id)).at(-1)!;
/** 1 proteína (350) + 2 creatinas (240) = 590. */
const carrito = () => [
  { productoId: b.proteina.id, cantidad: 1 },
  { productoId: b.creatina.id, cantidad: 2 },
];

beforeAll(async () => {
  b = await prepararBase();
  // Stock de sobra para todas las ventas de la prueba.
  await db.transaction(async (tx) => {
    for (const p of [b.proteina.id, b.creatina.id]) await cambiarStock(tx, { productoId: p, ubicacionId: b.norte.id, delta: 200, tipo: "ingreso", usuarioId: b.admin.id, motivo: "Prueba" });
  });
  await comoUsuario(b.cajeroNorte);
  expect(await abrirCaja({ montoInicial: "100" })).toEqual({ ok: true });
});

describe("cupones: administración", () => {
  it("solo el administrador los crea; valida descuento, alcance, fechas y código único", async () => {
    await comoUsuario(b.cajeroNorte);
    expect((await guardarCupon(cupon())).ok).toBe(false);
    await comoUsuario(b.admin);
    expect((await guardarCupon(cupon({ valor: "150" }))).ok).toBe(false);
    expect((await guardarCupon(cupon({ valor: "0" }))).ok).toBe(false);
    expect((await guardarCupon(cupon({ alcance: "productos" }))).ok).toBe(false);
    expect((await guardarCupon(cupon({ fechaInicio: dias(3), fechaFin: dias(1) }))).ok).toBe(false);
    expect((await guardarCupon(cupon({ codigo: "con espacios" }))).ok).toBe(false);
    expect(await db.select().from(cupones)).toHaveLength(0);

    expect(await guardarCupon(cupon({ codigo: "diez" }))).toEqual({ ok: true });
    const repetido = await guardarCupon(cupon());
    expect(!repetido.ok && repetido.campos).toEqual({ codigo: "Ese código ya existe" });
    const [c] = await db.select().from(cupones);
    expect(c).toMatchObject({ codigo: "DIEZ", tipo: "porcentaje", valor: "10.00", montoMinimo: "0.00", usosMaximos: null, alcance: "todo", activo: true, promocionId: null });
  });
});

describe("cupones: validación al instante para el cajero", () => {
  it("dice exactamente por qué no se puede usar", async () => {
    await crear({ codigo: "VENCIDO", fechaInicio: dias(-10), fechaFin: dias(-1) });
    await crear({ codigo: "FUTURO", fechaInicio: dias(2) });
    await crear({ codigo: "APAGADO", activo: false });
    await crear({ codigo: "SOLOSUR", sucursalIds: [b.sur.id] });
    await crear({ codigo: "UNAVEZ", usosMaximos: 1 });

    expect(await consultarCupon("NOEXISTE")).toEqual({ ok: false, error: "Ese cupón no existe" });
    expect(await consultarCupon("vencido")).toMatchObject({ ok: false, error: expect.stringMatching(/^Cupón vencido/) });
    expect(await consultarCupon("FUTURO")).toMatchObject({ ok: false, error: expect.stringMatching(/vale desde el/) });
    expect(await consultarCupon("APAGADO")).toEqual({ ok: false, error: "Este cupón está desactivado" });
    expect(await consultarCupon("SOLOSUR")).toEqual({ ok: false, error: "Este cupón no vale en esta sucursal" });
    const valido = await consultarCupon("diez");
    expect(valido).toMatchObject({ ok: true, datos: { codigo: "DIEZ", tipo: "porcentaje", valor: "10.00", acumulaPromociones: false } });
    // Consultar no gasta el cupón.
    expect(await usos("DIEZ")).toBe(0);
  });
});

describe("venta con cupón", () => {
  it("porcentaje sobre toda la compra: descuenta, gasta un uso y queda en la venta y en cada línea", async () => {
    await comoUsuario(b.cajeroNorte);
    const r = await venta({ lineas: carrito(), cuponCodigo: "diez" });
    if (!r.ok) throw new Error(r.error);
    expect(r.datos.total).toBe("531.00");
    expect(await usos("DIEZ")).toBe(1);
    const v = await ultimaVenta();
    expect(v).toMatchObject({ subtotal: "590.00", descuento: "59.00", descuentoCupon: "59.00", descuentoPromociones: "0.00", descuentoManual: "0.00", total: "531.00" });
    expect(v.cuponId).not.toBeNull();
    const lineas = await db.select().from(detalleVenta).where(eq(detalleVenta.ventaId, v.id)).orderBy(detalleVenta.id);
    expect(lineas.map((l) => [l.descuento, l.descuentoCupon])).toEqual([
      ["35.00", "35.00"],
      ["24.00", "24.00"],
    ]);
    expect(r.datos.comprobante?.venta).toMatchObject({ cupon: "DIEZ", descuento: "59.00" });
  });

  it("monto fijo: se descuenta una sola vez; con monto mínimo y solo para ciertos productos", async () => {
    await crear({ codigo: "VEINTE", tipo: "monto", valor: "20", montoMinimo: "500" });
    await crear({ codigo: "SOLOCREA", alcance: "productos", productoIds: [b.creatina.id] });

    const r = await venta({ lineas: carrito(), cuponCodigo: "VEINTE" });
    expect(r.ok && r.datos.total).toBe("570.00");

    // 2 creatinas = 240: no llega al mínimo de 500. No se cobra y no se gasta el cupón.
    const antes = (await db.select().from(ventas)).length;
    const poco = await venta({ lineas: [{ productoId: b.creatina.id, cantidad: 2 }], cuponCodigo: "VEINTE" });
    expect(poco).toEqual({ ok: false, error: "Cupón VEINTE: monto mínimo no alcanzado: faltan Bs 260,00" });
    expect((await db.select().from(ventas)).length).toBe(antes);
    expect(await usos("VEINTE")).toBe(1);

    // Solo creatina: en una venta de proteína no aplica; en la mixta descuenta solo la creatina.
    const noAplica = await venta({ lineas: [{ productoId: b.proteina.id, cantidad: 1 }], cuponCodigo: "SOLOCREA" });
    expect(!noAplica.ok && noAplica.error).toMatch(/no aplica a los productos/);
    const mixta = await venta({ lineas: carrito(), cuponCodigo: "SOLOCREA" });
    expect(mixta.ok && mixta.datos.total).toBe("566.00"); // 590 − 10 % de 240
  });

  it("límite de usos: al agotarse se rechaza; anular la venta libera el uso", async () => {
    const primera = await venta({ lineas: carrito(), cuponCodigo: "UNAVEZ" });
    if (!primera.ok) throw new Error(primera.error);
    expect(await venta({ lineas: carrito(), cuponCodigo: "UNAVEZ" })).toEqual({ ok: false, error: "Cupón agotado: ya alcanzó su límite de usos" });

    await comoUsuario(b.admin);
    expect(await anularVenta({ id: primera.datos.ventaId, motivo: "Prueba de anulación" })).toEqual({ ok: true });
    expect(await usos("UNAVEZ")).toBe(0);
    await comoUsuario(b.cajeroNorte);
    expect((await venta({ lineas: carrito(), cuponCodigo: "UNAVEZ" })).ok).toBe(true);
  });

  it("con un descuento automático: si no se acumula gana el mayor por producto; si se acumula, se suman", async () => {
    // 20 % automático en la proteína (70).
    const [promo] = await db
      .insert(promociones)
      .values({ nombre: "20 % en Whey", tipo: "porcentaje", valor: "20", fechaInicio: inicioDiaBolivia(dias(-1)), fechaFin: inicioDiaBolivia(dias(1), true), alcance: "producto", productoId: b.proteina.id })
      .returning();
    await crear({ codigo: "SUMA", acumulaPromociones: true });

    // No acumulable (DIEZ): proteína se queda con el automático (70 > 35); creatina con el cupón (24).
    const mejor = await venta({ lineas: carrito(), cuponCodigo: "DIEZ" });
    expect(mejor.ok && mejor.datos.total).toBe("496.00");
    expect(await ultimaVenta()).toMatchObject({ descuentoPromociones: "70.00", descuentoCupon: "24.00", descuento: "94.00" });

    // Solo proteína: el cupón no mejora nada → se vende sin gastarlo.
    const usosAntes = await usos("DIEZ");
    const sinEfecto = await venta({ lineas: [{ productoId: b.proteina.id, cantidad: 1 }], cuponCodigo: "DIEZ" });
    expect(sinEfecto.ok && sinEfecto.datos.total).toBe("280.00");
    expect(await usos("DIEZ")).toBe(usosAntes);
    expect((await ultimaVenta()).cuponId).toBeNull();

    // Acumulable: 10 % sobre lo que queda (280 + 240 = 520 → 52).
    const suma = await venta({ lineas: carrito(), cuponCodigo: "SUMA" });
    expect(suma.ok && suma.datos.total).toBe("468.00");
    expect(await ultimaVenta()).toMatchObject({ descuentoPromociones: "70.00", descuentoCupon: "52.00" });
    await db.update(promociones).set({ activo: false }).where(eq(promociones.id, promo.id));
  });

  it("combos: el cupón solo los toca si está marcado como acumulable con combos", async () => {
    await comoUsuario(b.admin);
    const c = await guardarCombo({
      nombre: "Combo Fuerza",
      descripcion: "",
      fotoUrl: null,
      tipoDescuento: "monto",
      valorDescuento: "40",
      fechaInicio: null,
      fechaFin: null,
      activo: true,
      items: [
        { productoId: b.proteina.id, cantidad: 1 },
        { productoId: b.creatina.id, cantidad: 2 },
      ],
    });
    if (!c.ok) throw new Error(c.error);
    await crear({ codigo: "CONCOMBO", acumulaCombos: true });

    // Solo un combo en el carrito: DIEZ no aplica; CONCOMBO descuenta 10 % de 550.
    const combos = [{ comboId: c.datos.id, cantidad: 1 }];
    const no = await venta({ combos, cuponCodigo: "DIEZ" });
    expect(!no.ok && no.error).toMatch(/no aplica/);
    const si = await venta({ combos, cuponCodigo: "CONCOMBO" });
    expect(si.ok && si.datos.total).toBe("495.00");
    expect(await ultimaVenta()).toMatchObject({ descuentoCombos: "40.00", descuentoCupon: "55.00", descuento: "95.00" });
  });

  it("un cupón usado no se elimina (se desactiva); uno sin usar sí", async () => {
    await comoUsuario(b.admin);
    const porCodigo = async (codigo: string) => (await db.select().from(cupones).where(eq(cupones.codigo, codigo)))[0];
    expect((await eliminarCupon({ id: (await porCodigo("DIEZ")).id })).ok).toBe(false);
    expect(await eliminarCupon({ id: (await porCodigo("FUTURO")).id })).toEqual({ ok: true });
    expect(await cambiarEstadoCupon({ id: (await porCodigo("DIEZ")).id, activo: false })).toEqual({ ok: true });
    await comoUsuario(b.cajeroNorte);
    expect(await consultarCupon("DIEZ")).toEqual({ ok: false, error: "Este cupón está desactivado" });
  });
});

describe("descuento manual del cajero", () => {
  const configurar = async (maximo: string) => {
    await comoUsuario(b.admin);
    expect(
      await guardarConfiguracion({ nombreComercial: "El Maseta", nit: "", mensajeAgradecimiento: "¡Gracias!", plantillaWhatsapp: "Hola {cliente}: {enlace}", codigoPais: "591", logoUrl: null, descuentoManualMaximo: maximo }),
    ).toEqual({ ok: true });
    await comoUsuario(b.cajeroNorte);
  };

  it("apagado por defecto; con máximo configurado exige motivo y no deja pasarse", async () => {
    await comoUsuario(b.cajeroNorte);
    const apagado = await venta({ lineas: carrito(), descuentoManual: { porcentaje: "3", motivo: "Cliente frecuente" } });
    expect(!apagado.ok && apagado.error).toMatch(/no está habilitado/);

    await configurar("5");
    const mucho = await venta({ lineas: carrito(), descuentoManual: { porcentaje: "6", motivo: "Cliente frecuente" } });
    expect(mucho).toEqual({ ok: false, error: "El descuento manual máximo es 5 %" });
    expect((await venta({ lineas: carrito(), descuentoManual: { porcentaje: "5", motivo: "" } })).ok).toBe(false);
  });

  it("descuenta sobre el total que queda, se reparte en las líneas y queda en auditoría con el motivo", async () => {
    await comoUsuario(b.cajeroNorte);
    // 590 − 10 % (cupón SUMA) = 531 → 5 % = 26,55.
    const r = await venta({ lineas: carrito(), cuponCodigo: "SUMA", descuentoManual: { porcentaje: "5", motivo: "Caja golpeada" } });
    if (!r.ok) throw new Error(r.error);
    expect(r.datos.total).toBe("504.45");
    const v = await ultimaVenta();
    expect(v).toMatchObject({ descuentoCupon: "59.00", descuentoManual: "26.55", descuento: "85.55", porcentajeDescuentoManual: "5.00", motivoDescuentoManual: "Caja golpeada" });
    const lineas = await db.select().from(detalleVenta).where(eq(detalleVenta.ventaId, v.id));
    expect(lineas.reduce((s, l) => s + Number(l.descuentoManual), 0).toFixed(2)).toBe("26.55");
    expect(lineas.reduce((s, l) => s + Number(l.cantidad) * Number(l.precioUnitario) - Number(l.descuento), 0).toFixed(2)).toBe("504.45");
    const [a] = (await db.select().from(auditoria).where(eq(auditoria.accion, "descuento_manual"))).slice(-1);
    expect(a).toMatchObject({ usuarioId: b.cajeroNorte.id, detalle: { ventaId: v.id, monto: "26.55", motivo: "Caja golpeada" } });
  });

  it("sin conexión: se registra con su motivo; si pasó el máximo, avisa al administrador", async () => {
    await comoUsuario(b.cajeroNorte);
    const [caja] = await db.select().from(cajas).where(and(eq(cajas.cajeroId, b.cajeroNorte.id), eq(cajas.estado, "abierta")));
    const operacion = (porcentaje: string, manual: string) => {
      const uuid = randomUUID();
      return {
        uuid,
        tipo: "venta",
        datos: {
          uuid,
          cajaId: caja.id,
          fecha: Date.now(),
          lineas: [{ productoId: b.creatina.id, cantidad: 1, precioUnitario: "120.00", descuento: manual, descuentoManual: manual, promocionId: null }],
          descuentoManual: { porcentaje, motivo: "Sin conexión: cliente frecuente" },
          metodoPago: "efectivo",
          montoRecibido: "120.00",
          clienteNombre: null,
          clienteTelefono: null,
        },
      };
    };
    const enviar = async (o: unknown) => (await sincronizar(new Request("http://localhost/api/sync", { method: "POST", body: JSON.stringify({ operaciones: [o] }) }))).json();
    const revisiones = () => db.select().from(alertas).where(and(eq(alertas.tipo, "revision_offline"), eq(alertas.resuelta, false)));

    expect((await enviar(operacion("5", "6.00"))).resultados[0]).toMatchObject({ ok: true });
    expect(await ultimaVenta()).toMatchObject({ total: "114.00", descuentoManual: "6.00", descuentoPromociones: "0.00", motivoDescuentoManual: "Sin conexión: cliente frecuente" });
    expect(await revisiones()).toHaveLength(0);

    expect((await enviar(operacion("20", "24.00"))).resultados[0]).toMatchObject({ ok: true });
    const [alerta] = await revisiones();
    expect(alerta.mensaje).toMatch(/descuento manual de 20 %, mayor al máximo permitido \(5 %\)/);
  });
});

describe("reporte de descuentos", () => {
  it("separa lo descontado por promociones, combos, cupones y descuentos manuales, y cuadra con las ventas", async () => {
    await comoUsuario(b.admin);
    const r = await reporteDescuentos({ desde: HOY, hasta: HOY, sucursalId: null, cajeroId: null, metodo: null, productoId: null, categoria: null });
    const completadas = await db.select().from(ventas).where(eq(ventas.estado, "completada"));
    const suma = (campo: "descuentoPromociones" | "descuentoCombos" | "descuentoCupon" | "descuentoManual" | "descuento") =>
      completadas.reduce((s, v) => s + Number(v[campo]), 0).toFixed(2);
    expect(r.totales).toEqual({ promociones: suma("descuentoPromociones"), combos: suma("descuentoCombos"), cupones: suma("descuentoCupon"), manual: suma("descuentoManual"), total: suma("descuento") });
    // El desglose suma el total descontado.
    expect((Number(r.totales.promociones) + Number(r.totales.combos) + Number(r.totales.cupones) + Number(r.totales.manual)).toFixed(2)).toBe(r.totales.total);

    const diez = r.cupones.find((c) => c.codigo === "DIEZ")!;
    expect(diez).toMatchObject({ usos: 2, total: "83.00" }); // 59 + 24
    expect(r.cupones.reduce((s, c) => s + Number(c.total), 0).toFixed(2)).toBe(r.totales.cupones);
    expect(r.promociones).toEqual([{ id: expect.any(Number), nombre: "20 % en Whey", ventas: 3, total: "210.00" }]);
    expect(r.manuales.map((m) => [m.monto, m.motivo])).toEqual([
      ["24.00", "Sin conexión: cliente frecuente"],
      ["6.00", "Sin conexión: cliente frecuente"],
      ["26.55", "Caja golpeada"],
    ]);
  });
});

