import { describe, expect, it } from "vitest";
import { aParametros, diasDelRango, leerFiltros, MAX_DIAS, rangoActivo, rangoRapido, textoRango } from "./filtros";

const HOY = "2026-09-26"; // sábado

describe("leerFiltros", () => {
  it("sin parámetros: hoy y la sucursal que se está viendo", () => {
    expect(leerFiltros({}, HOY, 3)).toEqual({
      desde: HOY,
      hasta: HOY,
      sucursalId: 3,
      cajeroId: null,
      metodo: null,
      productoId: null,
      categoria: null,
    });
  });

  it("?fecha= de los enlaces anteriores es un solo día", () => {
    const f = leerFiltros({ fecha: "2026-09-20" }, HOY, null);
    expect([f.desde, f.hasta]).toEqual(["2026-09-20", "2026-09-20"]);
  });

  it("solo desde: hasta hoy", () => {
    const f = leerFiltros({ desde: "2026-09-01" }, HOY, null);
    expect([f.desde, f.hasta]).toEqual(["2026-09-01", HOY]);
  });

  it("no pasa de hoy, ordena el rango y descarta fechas inválidas", () => {
    expect(leerFiltros({ desde: "2026-09-20", hasta: "2026-12-01" }, HOY, null).hasta).toBe(HOY);
    const f = leerFiltros({ desde: "2026-09-25", hasta: "2026-09-10" }, HOY, null);
    expect([f.desde, f.hasta]).toEqual(["2026-09-10", "2026-09-25"]);
    expect(leerFiltros({ desde: "2026-02-30" }, HOY, null).desde).toBe(HOY);
  });

  it("recorta el rango a un año", () => {
    const f = leerFiltros({ desde: "2020-01-01", hasta: HOY }, HOY, null);
    expect(diasDelRango(f.desde, f.hasta)).toBe(MAX_DIAS);
    expect(f.hasta).toBe(HOY);
  });

  it("sucursal=todas gana a la sucursal por defecto; ids inválidos se ignoran", () => {
    expect(leerFiltros({ sucursal: "todas" }, HOY, 3).sucursalId).toBeNull();
    expect(leerFiltros({ sucursal: "5" }, HOY, 3).sucursalId).toBe(5);
    expect(leerFiltros({ sucursal: "x", cajero: "-2", producto: "1.5" }, HOY, 3)).toMatchObject({ sucursalId: 3, cajeroId: null, productoId: null });
  });

  it("método solo efectivo o qr; acepta URLSearchParams", () => {
    expect(leerFiltros(new URLSearchParams("metodo=qr&cajero=7&producto=2"), HOY, null)).toMatchObject({ metodo: "qr", cajeroId: 7, productoId: 2 });
    expect(leerFiltros({ metodo: "tarjeta" }, HOY, null).metodo).toBeNull();
  });

  it("ida y vuelta por la URL", () => {
    const f = leerFiltros({ desde: "2026-09-01", hasta: "2026-09-15", sucursal: "3", cajero: "4", metodo: "efectivo", producto: "9", categoria: "Limpieza" }, HOY, null);
    expect(leerFiltros(aParametros(f), HOY, 99)).toEqual(f);
    expect(aParametros({ ...f, sucursalId: null }).get("sucursal")).toBe("todas");
  });
});

describe("rangos rápidos", () => {
  it("calcula semana (desde el lunes), mes y mes anterior", () => {
    expect(rangoRapido("ayer", HOY)).toEqual({ desde: "2026-09-25", hasta: "2026-09-25" });
    expect(rangoRapido("semana", HOY)).toEqual({ desde: "2026-09-21", hasta: HOY });
    expect(rangoRapido("semana", "2026-09-21")).toEqual({ desde: "2026-09-21", hasta: "2026-09-21" });
    expect(rangoRapido("semana", "2026-09-27")).toEqual({ desde: "2026-09-21", hasta: "2026-09-27" });
    expect(rangoRapido("mes", HOY)).toEqual({ desde: "2026-09-01", hasta: HOY });
    expect(rangoRapido("mes_anterior", HOY)).toEqual({ desde: "2026-08-01", hasta: "2026-08-31" });
    expect(rangoRapido("mes_anterior", "2026-03-10")).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
    expect(rangoRapido("30_dias", HOY)).toEqual({ desde: "2026-08-28", hasta: HOY });
  });

  it("reconoce el rango activo", () => {
    expect(rangoActivo(HOY, HOY, HOY)).toBe("hoy");
    expect(rangoActivo("2026-09-01", HOY, HOY)).toBe("mes");
    expect(rangoActivo("2026-09-02", HOY, HOY)).toBeNull();
  });

  it("texto del rango", () => {
    expect(textoRango(HOY, HOY)).toBe("26/09/2026");
    expect(textoRango("2026-09-01", HOY)).toBe("01/09/2026 – 26/09/2026");
  });
});
