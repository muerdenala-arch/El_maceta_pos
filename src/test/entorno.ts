/**
 * Entorno de las pruebas de integración: reemplaza solo lo que Next provee por petición
 * (cookies, encabezados, refresh, redirect). Todo lo demás (acciones, consultas, BD) es el código real.
 */
import { vi } from "vitest";

type Estado = { galletas: Map<string, string> };
const estado = ((globalThis as { __pruebas?: Estado }).__pruebas ??= { galletas: new Map() });

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nombre: string) => (estado.galletas.has(nombre) ? { name: nombre, value: estado.galletas.get(nombre)! } : undefined),
    set: (nombre: string, valor: string) => void estado.galletas.set(nombre, valor),
    delete: (nombre: string) => void estado.galletas.delete(nombre),
  }),
  headers: async () => new Headers({ "user-agent": "pruebas-integracion" }),
}));

vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

vi.mock("next/cache", () => ({
  refresh: () => {},
  revalidatePath: () => {},
}));

/** `redirect()` corta la ejecución como en Next: se lanza un error reconocible. */
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
