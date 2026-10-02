/**
 * Combos de productos contra la base en memoria: crear y editar (solo admin), vender (precio de la BD, descuento
 * repartido entre sus productos, stock de cada uno), no acumular con promociones, vigencia, anulación y venta sin conexión.
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { cambiarEstadoCombo, guardarCombo } from "@/app/admin/combos/acciones";
import { anularVenta } from "@/app/admin/reportes/acciones";
import { POST as sincronizar } from "@/app/api/sync/route";
import { abrirCaja, registrarVenta } from "@/app/cajero/acciones";
import { db } from "@/db";
import { alertas, cajas, combos, detalleVenta, promociones, ventas, ventasCombos } from "@/db/schema";
import { combosPos, listarCombos } from "@/lib/combos/consultas";
import { hoyEnBolivia, inicioDiaBolivia } from "@/lib/formato";
import { comoUsuario, prepararBase, stock, type Base } from "./base";

let b: Base;
let comboId: number;
const HOY = hoyEnBolivia();
const dias = (n: number) => new Date(Date.parse(`${HOY}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const base = () => ({
  nombre: "Combo Fuerza",
  descripcion: "Proteína + 2 creatinas",
  fotoUrl: null,
  tipoDescuento: "porcentaje" as const,
  valorDescuento: "10",
  fechaInicio: null,
  fechaFin: null,
  activo: true,
  items: [
    { productoId: b.proteina.id, cantidad: 1 },
    { productoId: b.creatina.id, cantidad: 2 },
  ],
});

const venta = (extra: Partial<Parameters<typeof registrarVenta>[0]>) =>
  registrarVenta({ uuid: randomUUID(), lineas: [], metodoPago: "efectivo", montoRecibido: "5000", clienteNombre: null, clienteTelefono: null, cuponCodigo: null, ...extra });

beforeAll(async () => {
  b = await prepararBase();
});

describe("combos", () => {
  it("solo el administrador los crea; se validan productos, descuento y fechas", async () => {
    await comoUsuario(b.cajeroNorte);
    expect((await guardarCombo(base())).ok).toBe(false);
    await comoUsuario(b.admin);
    expect((await guardarCombo({ ...base(), items: [] })).ok).toBe(false);
    expect((await guardarCombo({ ...base(), valorDescuento: "150" })).ok).toBe(false);
    expect((await guardarCombo({ ...base(), fechaInicio: dias(2), fechaFin: dias(1) })).ok).toBe(false);
    // Unidades sueltas de un producto que no es fraccionado.
    expect((await guardarCombo({ ...base(), items: [{ productoId: b.proteina.id, cantidad: 5, fraccion: true }] })).ok).toBe(false);
    expect(await db.select().from(combos)).toHaveLength(0);

    const r = await guardarCombo(base());
    if (!r.ok) throw new Error(r.error);
    comboId = r.datos.id;
    const [c] = await listarCombos();
    expect(c).toMatchObject({ nombre: "Combo Fuerza", tipoDescuento: "porcentaje", valorDescuento: "10.00", activo: true });
    expect(c.items).toHaveLength(2);
    expect((await combosPos(HOY)).map((x) => x.id)).toEqual([comboId]);
  });

  it("vender un combo: precio de la BD, descuento repartido y stock de cada producto", async () => {
    await comoUsuario(b.cajeroNorte);
    expect(await abrirCaja({ montoInicial: "100" })).toEqual({ ok: true });
    const r = await venta({ combos: [{ comboId, cantidad: 1 }], lineas: [{ productoId: b.creatina.id, cantidad: 1 }] });
    if (!r.ok) throw new Error(r.error);
    // Combo: 350 + 2 × 120 = 590 − 10 % = 531. Más una creatina suelta a 120.
    expect(r.datos.total).toBe("651.00");
    expect(await stock(b.proteina.id, b.norte.id)).toBe(9);
    expect(await stock(b.creatina.id, b.norte.id)).toBe(2); // 5 − 2 del combo − 1 suelta

    const [vc] = await db.select().from(ventasCombos).where(eq(ventasCombos.ventaId, r.datos.ventaId));
    expect(vc).toMatchObject({ comboId, nombre: "Combo Fuerza", cantidad: 1, precioNormal: "590.00", precioFinal: "531.00" });
    const lineas = await db.select().from(detalleVenta).where(eq(detalleVenta.ventaId, r.datos.ventaId)).orderBy(detalleVenta.id);
    expect(lineas.map((l) => [l.productoId, l.cantidad, l.precioUnitario, l.descuento, l.ventaComboId])).toEqual([
      [b.creatina.id, 1, "120.00", "0.00", null],
      [b.proteina.id, 1, "350.00", "35.00", vc.id],
      [b.creatina.id, 2, "120.00", "24.00", vc.id],
    ]);
    const [v] = await db.select().from(ventas).where(eq(ventas.id, r.datos.ventaId));
    expect(v).toMatchObject({ subtotal: "710.00", descuento: "59.00", total: "651.00" });

    // Comprobante: el combo con el detalle de sus productos; la creatina suelta, aparte.
    const c = r.datos.comprobante!.venta;
    expect(c.lineas.map((l) => l.nombre)).toEqual(["Creatina Test"]);
    expect(c.combos).toEqual([
      {
        nombre: "Combo Fuerza",
        cantidad: 1,
        precioNormal: "590.00",
        subtotal: "590.00",
        descuento: "59.00",
        productos: [
          { nombre: "Whey Test", cantidad: 1, unidad: null },
          { nombre: "Creatina Test", cantidad: 2, unidad: null },
        ],
      },
    ]);
  });

  it("si falta stock de un producto, el combo no se vende y no queda nada a medias", async () => {
    await comoUsuario(b.cajeroNorte);
    const antes = (await db.select().from(ventas)).length;
    // Quedan 2 creatinas: 2 combos piden 4.
    const r = await venta({ combos: [{ comboId, cantidad: 2 }] });
    expect(r.ok).toBe(false);
    expect((await db.select().from(ventas)).length).toBe(antes);
    expect(await stock(b.proteina.id, b.norte.id)).toBe(9);
    expect(await stock(b.creatina.id, b.norte.id)).toBe(2);
    // Carrito vacío o combo repetido: tampoco.
    expect((await venta({})).ok).toBe(false);
    expect((await venta({ combos: [{ comboId, cantidad: 1 }, { comboId, cantidad: 1 }] })).ok).toBe(false);
  });

  it("las promociones no se suman al combo (sí a los productos sueltos)", async () => {
    await db.insert(promociones).values({ nombre: "10 % en todo", tipo: "porcentaje", valor: "10", fechaInicio: inicioDiaBolivia(dias(-1)), fechaFin: inicioDiaBolivia(dias(1), true), alcance: "todo" });
    await comoUsuario(b.cajeroNorte);
    const r = await venta({ combos: [{ comboId, cantidad: 1 }], lineas: [{ productoId: b.proteina.id, cantidad: 1 }] });
    if (!r.ok) throw new Error(r.error);
    // Combo 531 (sin el 10 % extra) + proteína suelta 350 − 10 % = 315.
    expect(r.datos.total).toBe("846.00");
    expect(await stock(b.creatina.id, b.norte.id)).toBe(0);
    await db.update(promociones).set({ activo: false });
  });

  it("anular la venta devuelve el stock de los productos del combo", async () => {
    const [ultima] = await db.select().from(ventas).orderBy(ventas.id);
    await comoUsuario(b.admin);
    const todas = await db.select().from(ventas).orderBy(ventas.id);
    expect(await anularVenta({ id: todas[todas.length - 1].id, motivo: "Prueba de anulación" })).toEqual({ ok: true });
    expect(await stock(b.creatina.id, b.norte.id)).toBe(2);
    expect(await stock(b.proteina.id, b.norte.id)).toBe(9);
    expect(ultima).toBeDefined();
  });

  it("un combo inactivo o fuera de vigencia no se vende ni aparece en el punto de venta", async () => {
    await comoUsuario(b.admin);
    expect(await cambiarEstadoCombo({ id: comboId, activo: false })).toEqual({ ok: true });
    expect(await combosPos(HOY)).toEqual([]);
    await comoUsuario(b.cajeroNorte);
    const inactivo = await venta({ combos: [{ comboId, cantidad: 1 }] });
    expect(!inactivo.ok && inactivo.error).toMatch(/ya no está disponible/);

    await comoUsuario(b.admin);
    expect((await guardarCombo({ ...base(), id: comboId, fechaInicio: dias(-10), fechaFin: dias(-1) })).ok).toBe(true);
    expect(await combosPos(HOY)).toEqual([]);
    await comoUsuario(b.cajeroNorte);
    expect((await venta({ combos: [{ comboId, cantidad: 1 }] })).ok).toBe(false);
    expect(await stock(b.creatina.id, b.norte.id)).toBe(2);

    // De nuevo vigente, con descuento fijo de Bs 40: 590 − 40 = 550.
    await comoUsuario(b.admin);
    expect((await guardarCombo({ ...base(), id: comboId, tipoDescuento: "monto", valorDescuento: "40", fechaInicio: HOY, fechaFin: HOY })).ok).toBe(true);
    expect((await combosPos(HOY)).map((c) => c.valorDescuento)).toEqual(["40.00"]);
  });

  it("una venta sin conexión con un combo se sincroniza con su detalle; si el precio no coincide, avisa", async () => {
    await comoUsuario(b.cajeroNorte);
    const [caja] = await db.select().from(cajas).where(and(eq(cajas.cajeroId, b.cajeroNorte.id), eq(cajas.estado, "abierta")));
    const operacion = (precioFinal: string, descuentos: [string, string]) => {
      const uuid = randomUUID();
      const total = (590 - Number(descuentos[0]) - Number(descuentos[1])).toFixed(2);
      return {
        uuid,
        tipo: "venta",
        datos: {
          uuid,
          cajaId: caja.id,
          fecha: Date.now(),
          lineas: [
            { productoId: b.proteina.id, cantidad: 1, precioUnitario: "350.00", descuento: descuentos[0], promocionId: null, combo: 0 },
            { productoId: b.creatina.id, cantidad: 2, precioUnitario: "120.00", descuento: descuentos[1], promocionId: null, combo: 0 },
          ],
          combos: [{ comboId, nombre: "Combo Fuerza", cantidad: 1, precioNormal: "590.00", precioFinal }],
          metodoPago: "efectivo",
          montoRecibido: total,
          clienteNombre: null,
          clienteTelefono: null,
        },
      };
    };
    const enviar = async (operaciones: unknown[]) => (await sincronizar(new Request("http://localhost/api/sync", { method: "POST", body: JSON.stringify({ operaciones }) }))).json();
    const revisiones = () => db.select().from(alertas).where(and(eq(alertas.tipo, "revision_offline"), eq(alertas.resuelta, false)));

    // Cobrado igual que la BD (Bs 550): sin alerta.
    const bien = await enviar([operacion("550.00", ["23.73", "16.27"])]);
    expect(bien.resultados[0]).toMatchObject({ ok: true });
    expect(await revisiones()).toHaveLength(0);
    expect(await stock(b.creatina.id, b.norte.id)).toBe(0);
    const [vc] = await db.select().from(ventasCombos).where(eq(ventasCombos.ventaId, bien.resultados[0].ventaId));
    expect(vc).toMatchObject({ nombre: "Combo Fuerza", precioFinal: "550.00" });
    expect((await db.select().from(detalleVenta).where(eq(detalleVenta.ventaComboId, vc.id))).length).toBe(2);

    // Cobrado con el descuento viejo (Bs 531): se registra (stock negativo permitido) y queda la alerta de revisión.
    const distinto = await enviar([operacion("531.00", ["35.00", "24.00"])]);
    expect(distinto.resultados[0]).toMatchObject({ ok: true });
    expect(await revisiones()).toHaveLength(1);
  });
});
