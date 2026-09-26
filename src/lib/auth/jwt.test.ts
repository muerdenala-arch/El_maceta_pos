import { SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { firmarSesion, verificarSesion } from "./jwt";

const SECRETO = "clave-de-prueba-solo-para-tests-0123456789";

beforeAll(() => {
  process.env.JWT_SECRET = SECRETO;
  process.env.SESION_HORAS = "12";
});

describe("sesión JWT", () => {
  it("firma y verifica la carga", async () => {
    const token = await firmarSesion({ uid: 7, rol: "cajero", sucursalId: 2 });
    expect(await verificarSesion(token)).toEqual({ uid: 7, rol: "cajero", sucursalId: 2 });
  });

  it("rechaza tokens vacíos, alterados o firmados con otra clave", async () => {
    const token = await firmarSesion({ uid: 1, rol: "admin", sucursalId: null });
    expect(await verificarSesion(undefined)).toBeNull();
    expect(await verificarSesion(`${token}x`)).toBeNull();

    const ajeno = await new SignJWT({ uid: 1, rol: "admin", sucursalId: null })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("otra-clave-distinta-de-al-menos-32-caracteres"));
    expect(await verificarSesion(ajeno)).toBeNull();
  });

  it("rechaza un cajero que intenta ascenderse a admin editando la carga", async () => {
    const token = await firmarSesion({ uid: 5, rol: "cajero", sucursalId: 1 });
    const [cabecera, , firma] = token.split(".");
    const cargaFalsa = Buffer.from(JSON.stringify({ uid: 5, rol: "admin", sucursalId: null })).toString("base64url");
    expect(await verificarSesion(`${cabecera}.${cargaFalsa}.${firma}`)).toBeNull();
  });

  it("rechaza tokens vencidos y cargas con forma inválida", async () => {
    const clave = new TextEncoder().encode(SECRETO);
    const vencido = await new SignJWT({ uid: 1, rol: "admin", sucursalId: null })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(clave);
    expect(await verificarSesion(vencido)).toBeNull();

    const rolInventado = await new SignJWT({ uid: 1, rol: "superusuario", sucursalId: null })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(clave);
    expect(await verificarSesion(rolInventado)).toBeNull();
  });
});
