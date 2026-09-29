import { describe, expect, it } from "vitest";
import { decidirAcceso } from "./rutas";

const admin = { rol: "admin" as const };
const cajero = { rol: "cajero" as const };

describe("decidirAcceso", () => {
  it("sin sesión: páginas privadas redirigen al login y la API responde 401", () => {
    expect(decidirAcceso("/admin/dashboard", null)).toEqual({ tipo: "redirigir", destino: "/login" });
    expect(decidirAcceso("/cajero/venta", null)).toEqual({ tipo: "redirigir", destino: "/login" });
    expect(decidirAcceso("/", null)).toEqual({ tipo: "redirigir", destino: "/login" });
    expect(decidirAcceso("/api/sync", null)).toEqual({ tipo: "no_autenticado" });
  });

  it("el login es público, pero con sesión lleva al inicio del rol", () => {
    expect(decidirAcceso("/login", null)).toEqual({ tipo: "seguir" });
    expect(decidirAcceso("/login", admin)).toEqual({ tipo: "redirigir", destino: "/admin/dashboard" });
    expect(decidirAcceso("/login", cajero)).toEqual({ tipo: "redirigir", destino: "/cajero/venta" });
  });

  it("el comprobante público y las imágenes no requieren sesión", () => {
    expect(decidirAcceso("/comprobante/abc123", null)).toEqual({ tipo: "seguir" });
    expect(decidirAcceso("/api/archivos/logo/x.webp", null)).toEqual({ tipo: "seguir" });
    expect(decidirAcceso("/icono/512", null)).toEqual({ tipo: "seguir" });
    expect(decidirAcceso("/sin-conexion", null)).toEqual({ tipo: "seguir" });
    expect(decidirAcceso("/eventos/tokenAleatorio123456", null)).toEqual({ tipo: "seguir" });
  });

  it("módulo Eventos: el cajero no entra ni a las pantallas ni al Excel; sin sesión, tampoco", () => {
    for (const ruta of ["/admin/eventos", "/admin/eventos/reto-transformacion", "/admin/eventos/reto-transformacion/1?vista=pesajes"]) {
      expect(decidirAcceso(ruta.split("?")[0], cajero)).toEqual({ tipo: "redirigir", destino: "/cajero/venta" });
      expect(decidirAcceso(ruta.split("?")[0], null)).toEqual({ tipo: "redirigir", destino: "/login" });
    }
    expect(decidirAcceso("/api/admin/eventos/1/excel", cajero)).toEqual({ tipo: "prohibido" });
    expect(decidirAcceso("/api/admin/eventos/1/excel", null)).toEqual({ tipo: "no_autenticado" });
  });

  it("un cajero no entra a pantallas ni API de administrador, ni escribiendo la URL", () => {
    for (const ruta of ["/admin", "/admin/dashboard", "/admin/personal", "/admin/configuracion/x"]) {
      expect(decidirAcceso(ruta, cajero)).toEqual({ tipo: "redirigir", destino: "/cajero/venta" });
    }
    expect(decidirAcceso("/api/admin/reportes", cajero)).toEqual({ tipo: "prohibido" });
  });

  it("no confunde prefijos parecidos (/administrar no es /admin)", () => {
    expect(decidirAcceso("/administrar", cajero)).toEqual({ tipo: "seguir" });
  });

  it("cada rol accede a lo suyo", () => {
    expect(decidirAcceso("/admin/catalogo", admin)).toEqual({ tipo: "seguir" });
    expect(decidirAcceso("/cajero/cierre", cajero)).toEqual({ tipo: "seguir" });
    expect(decidirAcceso("/cajero/venta", admin)).toEqual({ tipo: "redirigir", destino: "/admin/dashboard" });
    expect(decidirAcceso("/", cajero)).toEqual({ tipo: "redirigir", destino: "/cajero/venta" });
  });
});
