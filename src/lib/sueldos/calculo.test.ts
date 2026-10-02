import { describe, expect, it } from "vitest";
import { antiguedad, nombrePeriodo, periodoDe, periodoValido, periodoVecino, proximoPago, resumenSueldo, totalesPlanilla } from "./calculo";

describe("sueldo del mes", () => {
  it("a pagar = sueldo + bonos − descuentos; saldo = a pagar − adelantos − pagos", () => {
    const r = resumenSueldo("2500.00", [
      { tipo: "adelanto", monto: "500.00" },
      { tipo: "adelanto", monto: "200.50" },
      { tipo: "descuento", monto: "100.00" },
      { tipo: "bono", monto: "150.00" },
      { tipo: "pago", monto: "1000.00" },
    ]);
    expect(r).toEqual({ sueldo: "2500.00", bonos: "150.00", descuentos: "100.00", adelantos: "700.50", pagos: "1000.00", aPagar: "2550.00", entregado: "1700.50", saldo: "849.50" });
  });

  it("los movimientos anulados no cuentan y el saldo puede quedar negativo (se entregó de más)", () => {
    const r = resumenSueldo("1000", [
      { tipo: "adelanto", monto: "800", anulado: true },
      { tipo: "adelanto", monto: "700" },
      { tipo: "pago", monto: "400" },
    ]);
    expect(r.adelantos).toBe("700.00");
    expect(r.saldo).toBe("-100.00");
    expect(resumenSueldo("", []).saldo).toBe("0.00");
  });

  it("totales del mes", () => {
    const t = totalesPlanilla([resumenSueldo("1000", [{ tipo: "pago", monto: "1000" }]), resumenSueldo("2000.10", [{ tipo: "adelanto", monto: "0.10" }])]);
    expect(t).toMatchObject({ sueldo: "3000.10", pagos: "1000.00", adelantos: "0.10", saldo: "2000.00" });
  });
});

describe("periodos", () => {
  it("valida, deriva del día y navega entre meses (también entre años)", () => {
    expect(periodoValido("2026-10")).toBe(true);
    for (const malo of ["2026-13", "2026-1", "26-10", "2026-10-01", null, 202610]) expect(periodoValido(malo)).toBe(false);
    expect(periodoDe("2026-10-02")).toBe("2026-10");
    expect(periodoVecino("2026-01", -1)).toBe("2025-12");
    expect(periodoVecino("2026-12", 1)).toBe("2027-01");
    expect(nombrePeriodo("2026-10")).toBe("octubre de 2026");
  });
});

describe("cuándo cumple su mes", () => {
  it("es el mismo día del mes en que entró; hoy cuenta", () => {
    expect(proximoPago("2026-03-15", "2026-10-02")).toEqual({ fecha: "2026-10-15", dias: 13 });
    expect(proximoPago("2026-03-15", "2026-10-15")).toEqual({ fecha: "2026-10-15", dias: 0 });
    expect(proximoPago("2026-03-15", "2026-10-16")).toEqual({ fecha: "2026-11-15", dias: 30 });
    expect(proximoPago("2025-06-20", "2026-12-25")).toEqual({ fecha: "2027-01-20", dias: 26 });
  });

  it("si entró un 31 (o 30, 29) y el mes es más corto, es el último día del mes", () => {
    expect(proximoPago("2026-01-31", "2026-02-10").fecha).toBe("2026-02-28");
    expect(proximoPago("2026-01-31", "2026-04-01").fecha).toBe("2026-04-30");
    expect(proximoPago("2023-12-30", "2028-02-01").fecha).toBe("2028-02-29"); // bisiesto
  });

  it("quien acaba de entrar (o entrará) cumple su primer mes un mes después de su ingreso", () => {
    expect(proximoPago("2026-10-01", "2026-10-02").fecha).toBe("2026-11-01");
    expect(proximoPago("2026-10-20", "2026-10-02").fecha).toBe("2026-11-20");
    expect(proximoPago("2026-12-05", "2026-10-02").fecha).toBe("2027-01-05");
  });

  it("antigüedad en palabras", () => {
    expect(antiguedad("2023-08-02", "2026-10-02")).toBe("3 años y 2 meses");
    expect(antiguedad("2026-05-10", "2026-10-02")).toBe("4 meses");
    expect(antiguedad("2025-10-02", "2026-10-02")).toBe("1 año");
    expect(antiguedad("2026-09-20", "2026-10-02")).toBe("12 días");
    expect(antiguedad("2026-11-01", "2026-10-02")).toBe("aún no empieza");
  });
});
