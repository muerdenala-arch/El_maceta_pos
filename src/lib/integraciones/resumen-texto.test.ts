import { describe, expect, it } from "vitest";
import { textoResumenDiario, type ResumenDiario } from "./resumen-texto";

const base: ResumenDiario = {
  fecha: "2026-10-05",
  negocio: "El Maseta",
  ventas: { cantidad: 12, total: "1250.00", efectivo: "900.00", qr: "350.00", descuentos: "40.00", anuladas: 1, totalAnuladas: "120.00", qrPorConfirmar: 2 },
  ganancia: "380.00",
  gastos: { total: "80.00", cantidad: 2 },
  porSucursal: [
    { sucursal: "Norte", cantidad: 8, total: "800.00" },
    { sucursal: "Sur", cantidad: 4, total: "450.00" },
  ],
  masVendidos: [
    { nombre: "Whey Chocolate", unidades: 3, sueltas: 0, neto: "1050.00" },
    { nombre: "Omega 3", unidades: 1, sueltas: 30, neto: "145.00" },
    { nombre: "Creatina", unidades: 0, sueltas: 1, neto: "4.00" },
  ],
  cajasAbiertas: [{ cajero: "Ana", sucursal: "Norte", esperado: "220.00" }],
  cajasConDiferencia: [
    { cajero: "Beto", sucursal: "Sur", diferencia: "-20.00" },
    { cajero: "Caro", sucursal: "Sur", diferencia: "5.50" },
  ],
  alertasPendientes: 4,
};

describe("resumen del día para WhatsApp", () => {
  it("un día normal, con todo", () => {
    expect(textoResumenDiario(base)).toBe(
      [
        "*El Maseta — Resumen del lunes, 5 de octubre de 2026*",
        "",
        "*Ventas:* Bs 1.250,00 (12 ventas)",
        "• Efectivo: Bs 900,00",
        "• QR: Bs 350,00 (2 por confirmar)",
        "• Descuentos dados: Bs 40,00",
        "• Anuladas: 1 (Bs 120,00)",
        "*Ganancia:* Bs 380,00",
        "*Gastos:* Bs 80,00 (2)",
        "*Queda del día:* Bs 300,00 (ganancia − gastos)",
        "",
        "*Por sucursal*",
        "• Norte: Bs 800,00 (8)",
        "• Sur: Bs 450,00 (4)",
        "",
        "*Más vendidos*",
        "1. Whey Chocolate — 3 u · Bs 1.050,00",
        "2. Omega 3 — 1 u + 30 sueltas · Bs 145,00",
        "3. Creatina — 1 suelta · Bs 4,00",
        "",
        "*Cajas*",
        "• Beto (Sur): faltan Bs 20,00",
        "• Caro (Sur): sobran Bs 5,50",
        "• Sin cerrar: Ana (Norte), esperado Bs 220,00",
        "",
        "*Alertas pendientes:* 4",
      ].join("\n"),
    );
  });

  it("un día sin movimiento queda corto y claro", () => {
    const vacio: ResumenDiario = {
      ...base,
      ventas: { cantidad: 0, total: "0.00", efectivo: "0.00", qr: "0.00", descuentos: "0.00", anuladas: 0, totalAnuladas: "0.00", qrPorConfirmar: 0 },
      ganancia: "0.00",
      gastos: { total: "0.00", cantidad: 0 },
      porSucursal: [],
      masVendidos: [],
      cajasAbiertas: [],
      cajasConDiferencia: [],
      alertasPendientes: 0,
    };
    expect(textoResumenDiario(vacio)).toBe(["*El Maseta — Resumen del lunes, 5 de octubre de 2026*", "", "*Ventas:* no hubo ventas", "*Gastos:* ninguno"].join("\n"));
  });

  it("con una sola sucursal no repite el desglose; si los gastos superan la ganancia, lo que queda es negativo", () => {
    const t = textoResumenDiario({ ...base, porSucursal: [{ sucursal: "Principal", cantidad: 12, total: "1250.00" }], gastos: { total: "500.00", cantidad: 1 } });
    expect(t).not.toContain("Por sucursal");
    expect(t).toContain("*Queda del día:* -Bs 120,00");
  });
});
