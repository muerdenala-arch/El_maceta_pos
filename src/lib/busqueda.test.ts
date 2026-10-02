import { describe, expect, it } from "vitest";
import { coincide, normalizarBusqueda, tramos } from "./busqueda";

describe("búsqueda", () => {
  it("ignora mayúsculas, tildes y espacios de más", () => {
    expect(normalizarBusqueda("  PROTEÍNA   Whey ")).toBe("proteina whey");
    expect(coincide("proteina", ["Proteína Gold"])).toBe(true);
    expect(coincide("PROTEÍNA", ["proteina gold"])).toBe(true);
    expect(coincide("ñandu", ["Nandu"])).toBe(true);
  });

  it("todas las palabras deben aparecer, en cualquier campo", () => {
    expect(coincide("whey choco", ["Whey Gold", null, "Chocolate"])).toBe(true);
    expect(coincide("whey vainilla", ["Whey Gold", "Chocolate"])).toBe(false);
    expect(coincide("7790", ["Creatina", 7790001])).toBe(true);
    expect(coincide("   ", ["lo que sea"])).toBe(true);
    expect(coincide("x", [null, undefined, ""])).toBe(false);
  });

  it("resalta sobre el texto original, aunque tenga tildes", () => {
    expect(tramos("Proteína Whey", "teina")).toEqual([
      { texto: "Pro", resaltado: false },
      { texto: "teína", resaltado: true },
      { texto: " Whey", resaltado: false },
    ]);
    expect(tramos("Creatina", "")).toEqual([{ texto: "Creatina", resaltado: false }]);
    expect(tramos("Creatina", "zzz")).toEqual([{ texto: "Creatina", resaltado: false }]);
  });

  it("resalta varias palabras y coincidencias repetidas o pegadas", () => {
    expect(
      tramos("BCAA 2:1:1 bcaa", "bcaa 1")
        .filter((t) => t.resaltado)
        .map((t) => t.texto),
    ).toEqual(["BCAA", "1", "1", "bcaa"]);
    expect(tramos("aaa", "aa")).toEqual([{ texto: "aaa", resaltado: true }]);
    expect(tramos("SALUD 💚 Bienestar", "bien").find((t) => t.resaltado)?.texto).toBe("Bien");
  });
});
