/**
 * Puerta de integraciones (n8n): el resumen del día se entrega solo con la clave INTEGRACION_TOKEN, sin sesión,
 * y trae los mismos números que Reportes. Contra una base real en memoria.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { agregarGasto } from "@/app/admin/gastos/acciones";
import { abrirCaja, registrarVenta } from "@/app/cajero/acciones";
import { GET } from "@/app/api/integraciones/resumen-diario/route";
import { decidirAcceso } from "@/lib/auth/rutas";
import { hoyEnBolivia } from "@/lib/formato";
import { comoUsuario, prepararBase, type Base } from "./base";

const CLAVE = "clave-de-prueba-para-integraciones-0123456789";
let b: Base;
beforeAll(async () => {
  b = await prepararBase();
});

const pedir = (clave: string | null, fecha?: string) =>
  GET(new Request(`http://localhost/api/integraciones/resumen-diario${fecha ? `?fecha=${fecha}` : ""}`, { headers: clave ? { Authorization: `Bearer ${clave}` } : {} }));

describe("resumen del día para n8n", () => {
  it("sin clave configurada en el servidor, la puerta está cerrada", async () => {
    delete process.env.INTEGRACION_TOKEN;
    expect((await pedir(CLAVE)).status).toBe(503);
    process.env.INTEGRACION_TOKEN = "corta";
    expect((await pedir("corta")).status).toBe(503); // una clave débil no vale
  });

  it("solo entra quien trae la clave; no depende de la sesión de nadie", async () => {
    process.env.INTEGRACION_TOKEN = CLAVE;
    expect(decidirAcceso("/api/integraciones/resumen-diario", null)).toEqual({ tipo: "seguir" });
    await comoUsuario(b.admin); // ni la sesión del administrador sirve sin la clave
    expect((await pedir(null)).status).toBe(401);
    expect((await pedir("otra-clave-cualquiera-de-mas-de-32-caracteres")).status).toBe(401);
    expect((await pedir(CLAVE.slice(0, -1))).status).toBe(401);
    await comoUsuario(null);
    expect((await pedir(CLAVE)).status).toBe(200);
  });

  it("valida la fecha", async () => {
    expect((await pedir(CLAVE, "mañana")).status).toBe(400);
    expect((await pedir(CLAVE, "2999-01-01")).status).toBe(400);
    expect((await pedir(CLAVE, "ayer")).status).toBe(200);
    expect((await pedir(CLAVE, hoyEnBolivia())).status).toBe(200);
  });

  it("trae los números del día y el mensaje ya redactado", async () => {
    await comoUsuario(b.cajeroNorte);
    await abrirCaja({ montoInicial: "100" });
    const venta = await registrarVenta({
      uuid: crypto.randomUUID(),
      lineas: [
        { productoId: b.proteina.id, cantidad: 1 },
        { productoId: b.creatina.id, cantidad: 2 },
      ],
      combos: [],
      metodoPago: "efectivo",
      montoRecibido: "600",
      qrId: null,
      cliente: null,
      cuponCodigo: null,
    } as never);
    expect(venta.ok).toBe(true);
    await comoUsuario(b.admin);
    expect(await agregarGasto({ sucursalId: b.norte.id, categoria: "Servicios", monto: "80", descripcion: "Luz", fotoUrl: null })).toEqual({ ok: true });
    await comoUsuario(null);

    const r = await (await pedir(CLAVE)).json();
    // 350 + 2 × 120 = 590; costo 280,50 + 2 × 80 = 440,50 → ganancia 149,50.
    expect(r).toMatchObject({
      fecha: hoyEnBolivia(),
      ventas: { cantidad: 1, total: "590.00", efectivo: "590.00", qr: "0.00", anuladas: 0 },
      ganancia: "149.50",
      gastos: { total: "80.00", cantidad: 1 },
      cajasAbiertas: [{ sucursal: "Sucursal Norte", esperado: "690.00" }],
      cajasConDiferencia: [],
    });
    expect(r.porSucursal).toEqual([
      { sucursal: "Sucursal Norte", cantidad: 1, total: "590.00" },
      { sucursal: "Sucursal Sur", cantidad: 0, total: "0.00" },
    ]);
    expect(r.masVendidos.map((p: { nombre: string }) => p.nombre)).toEqual(["Whey Test", "Creatina Test"]);
    expect(r.texto).toContain("*Ventas:* Bs 590,00 (1 venta)");
    expect(r.texto).toContain("*Ganancia:* Bs 149,50");
    expect(r.texto).toContain("*Queda del día:* Bs 69,50 (ganancia − gastos)");
    expect(r.texto).toContain("• Sin cerrar:");
    // Nada privado de más: ni costos por producto, ni clientes, ni usuarios.
    expect(JSON.stringify(r)).not.toMatch(/pin|telefono|costo/i);

    // Otro día: sin movimiento.
    const ayer = await (await pedir(CLAVE, "ayer")).json();
    expect(ayer.ventas.cantidad).toBe(0);
    expect(ayer.texto).toContain("no hubo ventas");
  });
});
