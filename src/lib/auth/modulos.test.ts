import { describe, expect, it } from "vitest";
import { MODULOS_CON_CANDADO, moduloDeRuta, modulosValidos, primerApartado } from "./modulos";

describe("apartados del administrador con candado para el encargado", () => {
  it("reconoce el apartado de una ruta, también en sus pantallas internas", () => {
    expect(moduloDeRuta("/admin/catalogo")).toBe("catalogo");
    expect(moduloDeRuta("/admin/dashboard")).toBe("dashboard");
    expect(moduloDeRuta("/admin/eventos/torneo-pulseada/4?vista=llaves")).toBe("eventos");
    expect(moduloDeRuta("/admin/personal")).toBe("personal");
    for (const r of ["/admin", "/admin/inicio", "/admin/catalogos", "/cajero/venta", "/api/admin/exportar"]) expect(moduloDeRuta(r), r).toBeNull();
  });

  it("todos los apartados del menú del administrador tienen candado", () => {
    expect(MODULOS_CON_CANDADO).toEqual(["dashboard", "reportes", "gastos", "catalogo", "inventario", "bodega", "promociones", "combos", "eventos", "personal", "sueldos", "qr", "sucursales", "auditoria", "configuracion"]);
  });

  it("la lista guardada se limpia y la entrada del encargado es su primer apartado abierto", () => {
    expect(modulosValidos(["qr", "inventado", "catalogo", "qr"])).toEqual(["catalogo", "qr"]);
    expect(modulosValidos(null)).toEqual([]);
    expect(primerApartado(["qr", "reportes"])).toBe("/admin/reportes");
    expect(primerApartado([])).toBeNull();
  });
});
