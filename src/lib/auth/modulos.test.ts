import { describe, expect, it } from "vitest";
import { MODULOS_CON_CANDADO, moduloDeRuta, modulosValidos } from "./modulos";

describe("apartados compartidos con el encargado", () => {
  it("reconoce el apartado de una ruta del administrador, también en sus pantallas internas", () => {
    expect(moduloDeRuta("/admin/catalogo")).toBe("catalogo");
    expect(moduloDeRuta("/admin/eventos/torneo-pulseada/4?vista=llaves")).toBe("eventos");
    expect(moduloDeRuta("/admin/inventario/")).toBe("inventario");
  });

  it("lo que es solo del administrador no es un apartado compartido", () => {
    for (const r of ["/admin", "/admin/dashboard", "/admin/personal", "/admin/reportes", "/admin/gastos", "/admin/catalogos", "/cajero/venta", "/encargado/reportes", "/api/admin/exportar"]) {
      expect(moduloDeRuta(r), r).toBeNull();
    }
  });

  it("auditoría no tiene candado (es solo consulta) y la lista guardada se limpia", () => {
    expect(MODULOS_CON_CANDADO).not.toContain("auditoria");
    expect(modulosValidos(["qr", "personal", "catalogo", "qr", "auditoria"])).toEqual(["catalogo", "qr"]);
    expect(modulosValidos(null)).toEqual([]);
  });
});
