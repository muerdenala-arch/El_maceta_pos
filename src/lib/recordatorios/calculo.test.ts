import { describe, expect, it } from "vitest";
import { instanteBolivia, proximoAviso } from "./calculo";

const iso = (d: Date | null) => d?.toISOString() ?? null;
const en = (fecha: string, hora: string) => instanteBolivia(fecha, hora);

describe("próximo aviso", () => {
  it("la hora es de Bolivia (UTC−4)", () => {
    expect(iso(en("2026-10-05", "08:30"))).toBe("2026-10-05T12:30:00.000Z");
    expect(iso(en("2026-10-05", "22:00"))).toBe("2026-10-06T02:00:00.000Z");
  });

  it("una sola vez: su hora, y nada cuando ya pasó", () => {
    const p = { fecha: "2026-10-05", hora: "08:30", repeticion: "ninguna" };
    expect(iso(proximoAviso(p, en("2026-10-04", "20:00")))).toBe("2026-10-05T12:30:00.000Z");
    expect(proximoAviso(p, en("2026-10-05", "08:30"))).toBeNull();
    expect(proximoAviso(p, en("2026-10-09", "00:00"))).toBeNull();
  });

  it("diaria y semanal: el siguiente, sin acumular los que se saltaron", () => {
    const diaria = { fecha: "2026-10-05", hora: "07:00", repeticion: "diaria" };
    expect(iso(proximoAviso(diaria, en("2026-10-05", "07:00")))).toBe(iso(en("2026-10-06", "07:00")));
    expect(iso(proximoAviso(diaria, en("2026-10-09", "06:59")))).toBe(iso(en("2026-10-09", "07:00")));
    expect(iso(proximoAviso(diaria, en("2026-10-09", "12:00")))).toBe(iso(en("2026-10-10", "07:00")));
    const semanal = { fecha: "2026-10-05", hora: "07:00", repeticion: "semanal" };
    expect(iso(proximoAviso(semanal, en("2026-10-05", "09:00")))).toBe(iso(en("2026-10-12", "07:00")));
    expect(iso(proximoAviso(semanal, en("2026-10-30", "09:00")))).toBe(iso(en("2026-11-02", "07:00")));
  });

  it("mensual: el mismo día del mes; en meses más cortos, el último día", () => {
    const p = { fecha: "2026-01-31", hora: "10:00", repeticion: "mensual" };
    expect(iso(proximoAviso(p, en("2026-01-31", "10:00")))).toBe(iso(en("2026-02-28", "10:00")));
    expect(iso(proximoAviso(p, en("2026-02-28", "10:00")))).toBe(iso(en("2026-03-31", "10:00")));
    expect(iso(proximoAviso(p, en("2026-04-10", "10:00")))).toBe(iso(en("2026-04-30", "10:00")));
    expect(iso(proximoAviso(p, en("2026-12-31", "23:00")))).toBe(iso(en("2027-01-31", "10:00")));
    // De noche en Bolivia ya es el día siguiente en UTC: no debe saltarse el aviso del mes.
    const q = { fecha: "2026-10-01", hora: "23:30", repeticion: "mensual" };
    expect(iso(proximoAviso(q, en("2026-10-31", "22:00")))).toBe(iso(en("2026-11-01", "23:30")));
  });

  it("datos rotos: sin aviso", () => {
    expect(proximoAviso({ fecha: "x", hora: "y", repeticion: "diaria" }, new Date())).toBeNull();
  });
});
