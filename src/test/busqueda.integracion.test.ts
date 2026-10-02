/** Búsqueda en el servidor (listas paginadas): mismas reglas que en pantalla, contra PostgreSQL real. */
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { auditoria, sucursales } from "@/db/schema";
import { condicionBusqueda } from "@/lib/busqueda-sql";
import { listarMovimientos } from "@/lib/inventario/consultas";
import { comoUsuario, prepararBase, type Base } from "./base";

let b: Base;
beforeAll(async () => {
  b = await prepararBase();
  await comoUsuario(b.admin);
});

const coincideSql = async (consulta: string, ...textos: (string | null)[]) => {
  const filas = await db
    .select({ n: sql<number>`1` })
    .from(sucursales)
    .where(condicionBusqueda(consulta, textos.map((t) => sql`${t}`)))
    .limit(1);
  return filas.length === 1;
};

describe("condicionBusqueda", () => {
  it("ignora mayúsculas y tildes en ambos sentidos", async () => {
    expect(await coincideSql("proteina", "Proteína Whey")).toBe(true);
    expect(await coincideSql("PROTEÍNA", "proteina whey")).toBe(true);
    expect(await coincideSql("nandu almacen", "Almacén Ñandú")).toBe(true);
    expect(await coincideSql("creatina", "Proteína Whey")).toBe(false);
  });

  it("cada palabra puede estar en una columna distinta; nulos y comodines no rompen", async () => {
    expect(await coincideSql("whey ana", "Whey Gold", null, "Ana Norte")).toBe(true);
    expect(await coincideSql("whey beto", "Whey Gold", null, "Ana Norte")).toBe(false);
    expect(await coincideSql("100%", "Whey 100% pura")).toBe(true);
    expect(await coincideSql("%", "sin porcentaje")).toBe(false);
    expect(await coincideSql("a_b", "axb")).toBe(false);
    expect(condicionBusqueda("   ", [sql`'x'`])).toBeUndefined();
  });

  it("busca dentro del detalle (JSON) de la auditoría y en el historial de movimientos", async () => {
    await db.insert(auditoria).values({ accion: "ajuste_stock", usuarioId: b.admin.id, detalle: { motivo: "Conteo físico de bodega" } });
    const hallados = await db
      .select({ id: auditoria.id })
      .from(auditoria)
      .where(condicionBusqueda("fisico conteo", [auditoria.accion, auditoria.detalle]));
    expect(hallados).toHaveLength(1);

    const todos = await listarMovimientos({});
    expect(todos.movimientos.length).toBeGreaterThan(0);
    const nombre = todos.movimientos[0].producto;
    expect((await listarMovimientos({ producto: nombre.toUpperCase() })).movimientos.length).toBeGreaterThan(0);
    expect((await listarMovimientos({ producto: "no-existe-zzz" })).movimientos).toHaveLength(0);
  });
});
