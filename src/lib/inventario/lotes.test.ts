import { describe, expect, it } from "vitest";
import { agruparPorVencimiento, completarLotes, diasParaVencer, planificarConsumo } from "./lotes";

describe("consumo FEFO", () => {
  const lotes = [
    { id: 1, vencimiento: null, cantidad: 10 },
    { id: 2, vencimiento: "2027-03-01", cantidad: 5 },
    { id: 3, vencimiento: "2026-12-01", cantidad: 4 },
    { id: 4, vencimiento: "2026-12-01", cantidad: 0 },
  ];

  it("saca primero lo que vence primero y deja al final lo que no tiene fecha", () => {
    expect(planificarConsumo(lotes, 7)).toEqual({
      usos: [
        { id: 3, vencimiento: "2026-12-01", cantidad: 4 },
        { id: 2, vencimiento: "2027-03-01", cantidad: 3 },
      ],
      faltante: 0,
    });
    expect(planificarConsumo(lotes, 12).usos.at(-1)).toEqual({ id: 1, vencimiento: null, cantidad: 3 });
  });

  it("informa lo que falta cuando los lotes no alcanzan", () => {
    expect(planificarConsumo(lotes, 25).faltante).toBe(6);
    expect(planificarConsumo([], 3)).toEqual({ usos: [], faltante: 3 });
  });
});

describe("lotes en tránsito", () => {
  it("agrupa por fecha", () => {
    expect(
      agruparPorVencimiento([
        { vencimiento: "2027-01-01", cantidad: 2 },
        { vencimiento: null, cantidad: 1 },
        { vencimiento: "2027-01-01", cantidad: 3 },
      ]),
    ).toEqual([
      { vencimiento: "2027-01-01", cantidad: 5 },
      { vencimiento: null, cantidad: 1 },
    ]);
  });

  it("completa con un lote sin fecha o recorta para cuadrar la cantidad", () => {
    expect(completarLotes([{ vencimiento: "2027-01-01", cantidad: 2 }], 5)).toEqual([
      { vencimiento: "2027-01-01", cantidad: 2 },
      { vencimiento: null, cantidad: 3 },
    ]);
    expect(
      completarLotes(
        [
          { vencimiento: "2027-05-01", cantidad: 4 },
          { vencimiento: "2027-01-01", cantidad: 4 },
        ],
        5,
      ),
    ).toEqual([
      { vencimiento: "2027-01-01", cantidad: 4 },
      { vencimiento: "2027-05-01", cantidad: 1 },
    ]);
  });
});

it("calcula días para vencer", () => {
  expect(diasParaVencer("2026-10-01", "2026-09-26")).toBe(5);
  expect(diasParaVencer("2026-09-20", "2026-09-26")).toBe(-6);
});
