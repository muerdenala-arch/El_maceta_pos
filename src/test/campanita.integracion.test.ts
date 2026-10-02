/** Campanita: cada alerta de stock lleva a donde está el problema (bodega o sucursal) y se marca como leída al tocarla. */
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { inventario } from "@/db/schema";
import { marcarAlertaLeida, obtenerAlertas } from "@/lib/alertas/acciones";
import { conciliarAlertasStock } from "@/lib/alertas/motor";
import { comoUsuario, prepararBase, type Base } from "./base";

let b: Base;
beforeAll(async () => {
  b = await prepararBase();
  await comoUsuario(b.admin);
  // Creatina agotada en la bodega y proteína agotada en la sucursal Sur.
  await db.insert(inventario).values({ productoId: b.creatina.id, ubicacionId: b.bodega.id, cantidad: 0 });
  await db.update(inventario).set({ cantidad: 0 }).where(and(eq(inventario.productoId, b.proteina.id), eq(inventario.ubicacionId, b.sur.id)));
  await conciliarAlertasStock(db);
});

const alertasDe = async () => {
  const r = await obtenerAlertas();
  if (!r.ok) throw new Error(r.error);
  return r.datos;
};

describe("campanita", () => {
  it("la alerta de la bodega lleva a Bodega central y la de una sucursal a su inventario, con el producto en la dirección", async () => {
    const { alertas } = await alertasDe();
    const destinos = alertas.filter((a) => a.tipo === "agotado").map((a) => a.destino);
    expect(destinos).toContain(`/admin/bodega?resaltar=${b.creatina.id}`);
    expect(destinos).toContain(`/admin/inventario?resaltar=${b.proteina.id}&sucursal=${b.sur.id}`);
  });

  it("al tocarla queda leída y baja el contador; un cajero no puede leer ni marcar alertas", async () => {
    const antes = await alertasDe();
    const alerta = antes.alertas.find((a) => !a.leida)!;
    expect(await marcarAlertaLeida({ id: alerta.id })).toEqual({ ok: true });
    const despues = await alertasDe();
    expect(despues.noLeidas).toBe(antes.noLeidas - 1);
    expect(despues.alertas.find((a) => a.id === alerta.id)?.leida).toBe(true);

    await comoUsuario(b.cajeroNorte);
    expect((await obtenerAlertas()).ok).toBe(false);
    expect((await marcarAlertaLeida({ id: alerta.id })).ok).toBe(false);
    await comoUsuario(b.admin);
  });
});
