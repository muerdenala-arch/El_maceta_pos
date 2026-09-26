import { describe, expect, it } from "vitest";
import { esquemaLogin } from "./validaciones/auth";
import { fechaValida, formatoBs, hoyEnBolivia } from "./formato";

describe("formato", () => {
  it("formatea bolivianos", () => {
    expect(formatoBs("0")).toBe("Bs 0,00");
    expect(formatoBs("1234.5")).toBe("Bs 1.234,50");
    expect(formatoBs("-50.5")).toBe("-Bs 50,50");
  });

  it("usa la fecha de Bolivia (UTC-4), no la del servidor", () => {
    // 02:00 UTC del 27 = 22:00 del 26 en La Paz
    expect(hoyEnBolivia(new Date("2026-09-27T02:00:00Z"))).toBe("2026-09-26");
  });

  it("valida fechas del parámetro ?fecha", () => {
    expect(fechaValida("2026-02-28")).toBe("2026-02-28");
    expect(fechaValida("2026-02-30")).toBeNull();
    expect(fechaValida("hoy")).toBeNull();
    expect(fechaValida(undefined)).toBeNull();
  });
});

describe("validación de login", () => {
  it("acepta PIN de 4 a 6 dígitos y normaliza el usuario", () => {
    expect(esquemaLogin.parse({ usuario: "  Admin ", pin: "1234" })).toEqual({ usuario: "admin", pin: "1234" });
    expect(esquemaLogin.safeParse({ usuario: "a", pin: "123456" }).success).toBe(true);
  });

  it("rechaza PIN corto, largo o con letras", () => {
    for (const pin of ["123", "1234567", "12a4", ""]) {
      expect(esquemaLogin.safeParse({ usuario: "a", pin }).success).toBe(false);
    }
  });
});
