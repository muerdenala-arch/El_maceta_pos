import { describe, expect, it } from "vitest";
import { esquemaConfiguracion, esquemaCrearUsuario, esquemaEditarUsuario, esquemaProducto } from "./admin";

const productoBase = {
  nombre: "Whey Gold",
  marca: "",
  categoriaId: null,
  sabor: " ",
  presentacion: "2 lb",
  precioVenta: "350,5",
  precioCosto: "280",
  codigoBarras: "",
  stockMinimo: 3,
  fotoUrl: null,
  activo: true,
};

describe("producto", () => {
  it("normaliza montos con coma y textos vacíos a null", () => {
    const r = esquemaProducto.parse(productoBase);
    expect(r.precioVenta).toBe("350.5");
    expect(r.marca).toBeNull();
    expect(r.sabor).toBeNull();
    expect(r.codigoBarras).toBeNull();
  });

  it("rechaza montos negativos, con 3 decimales o con texto", () => {
    for (const precioVenta of ["-5", "10.999", "diez", ""]) {
      expect(esquemaProducto.safeParse({ ...productoBase, precioVenta }).success).toBe(false);
    }
  });

  it("solo acepta fotos subidas por la app", () => {
    const ok = ["/api/archivos/productos/0b6f0d1e-2c3a-4b5c-8d9e-0f1a2b3c4d5e.webp", "https://abc123.public.blob.vercel-storage.com/productos/x.webp"];
    const mal = ["https://sitio-cualquiera.com/foto.jpg", "/api/archivos/../../.env.local", "javascript:alert(1)"];
    for (const fotoUrl of ok) expect(esquemaProducto.safeParse({ ...productoBase, fotoUrl }).success).toBe(true);
    for (const fotoUrl of mal) expect(esquemaProducto.safeParse({ ...productoBase, fotoUrl }).success).toBe(false);
  });

  it("stock mínimo entero y no negativo", () => {
    expect(esquemaProducto.safeParse({ ...productoBase, stockMinimo: -1 }).success).toBe(false);
    expect(esquemaProducto.safeParse({ ...productoBase, stockMinimo: 1.5 }).success).toBe(false);
  });
});

describe("usuarios", () => {
  const base = { nombre: "María López", usuario: "Maria.Lopez", rol: "cajero" as const, sucursalId: 2, pin: "4821" };

  it("normaliza el usuario a minúsculas", () => {
    expect(esquemaCrearUsuario.parse(base).usuario).toBe("maria.lopez");
  });

  it("un cajero necesita sucursal", () => {
    const r = esquemaCrearUsuario.safeParse({ ...base, sucursalId: null });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["sucursalId"]);
  });

  it("un administrador queda sin sucursal aunque se envíe una", () => {
    expect(esquemaCrearUsuario.parse({ ...base, rol: "admin" }).sucursalId).toBeNull();
    expect(esquemaEditarUsuario.parse({ id: 1, nombre: "A", rol: "admin", sucursalId: 3 }).sucursalId).toBeNull();
  });

  it("rechaza usuarios con espacios o muy cortos", () => {
    for (const usuario of ["ma", "maria lopez", "maría"]) {
      expect(esquemaCrearUsuario.safeParse({ ...base, usuario }).success).toBe(false);
    }
  });
});

describe("configuración", () => {
  it("la plantilla de WhatsApp debe incluir {enlace}", () => {
    const base = {
      nombreComercial: "El Maseta",
      nit: "",
      mensajeAgradecimiento: "Gracias",
      codigoPais: "591",
      logoUrl: null,
    };
    expect(esquemaConfiguracion.safeParse({ ...base, plantillaWhatsapp: "Hola {cliente}" }).success).toBe(false);
    expect(esquemaConfiguracion.safeParse({ ...base, plantillaWhatsapp: "Hola: {enlace}" }).success).toBe(true);
  });
});
