import { describe, expect, it } from "vitest";
import { enlaceWhatsapp, fechaHoraComprobante, mensajeWhatsapp, nombreArchivo, telefonoWhatsapp, type DatosComprobante } from "./datos";

const datos = (plantilla: string, cliente: string | null): DatosComprobante => ({
  negocio: { nombre: "El Maseta", nit: null, logoUrl: null, mensajeAgradecimiento: "Gracias", plantillaWhatsapp: plantilla, codigoPais: "591" },
  sucursal: { nombre: "Norte", direccion: null, telefono: null, tamanoImpresion: "80mm" },
  venta: {
    id: 1, numero: 42, fecha: "2026-09-26T18:05:00Z", cajero: "María",
    cliente: cliente ? { nombre: cliente, telefono: "71234567" } : null,
    lineas: [], subtotal: "700.00", descuento: "0.00", total: "700.00",
    metodoPago: "efectivo", estadoPago: "pagado", montoRecibido: "800.00", cambio: "100.00", anulada: false, tokenPublico: "abc",
  },
});

describe("WhatsApp", () => {
  it("normaliza el número con código de país", () => {
    expect(telefonoWhatsapp("71234567", "591")).toBe("59171234567");
    expect(telefonoWhatsapp("+591 712-34567", "591")).toBe("59171234567");
    expect(telefonoWhatsapp("0 71234567", "591")).toBe("59171234567");
    expect(telefonoWhatsapp("123", "591")).toBeNull();
  });

  it("completa la plantilla y limpia el saludo si no hay nombre", () => {
    const p = "Hola {cliente}, gracias por comprar en {negocio}. Total {total}: {enlace}";
    expect(mensajeWhatsapp(datos(p, "Carlos Pérez"), "https://x/c/abc")).toBe(
      "Hola Carlos, gracias por comprar en El Maseta. Total Bs 700,00: https://x/c/abc",
    );
    expect(mensajeWhatsapp(datos(p, null), "https://x/c/abc")).toBe(
      "Hola, gracias por comprar en El Maseta. Total Bs 700,00: https://x/c/abc",
    );
  });

  it("codifica el mensaje en el enlace wa.me", () => {
    expect(enlaceWhatsapp("59171234567", "Hola & chau")).toBe("https://wa.me/59171234567?text=Hola%20%26%20chau");
  });
});

it("fecha en hora de Bolivia y nombre de archivo", () => {
  expect(fechaHoraComprobante("2026-09-26T18:05:00Z")).toBe("26/09/2026 14:05");
  expect(nombreArchivo(datos("{enlace}", null))).toBe("comprobante-el-maseta-000042.pdf");
});
