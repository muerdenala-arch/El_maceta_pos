import { Gift, Hand, Tag, TicketPercent } from "lucide-react";
import { formatoBs } from "@/lib/formato";
import type { ReporteDescuentos } from "@/lib/reportes/ventas";

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-BO", { timeZone: "America/La_Paz", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

const th = "px-3 py-3 text-right first:pl-4 first:text-left last:pr-4";
const td = "cifras px-3 py-2.5 text-right whitespace-nowrap first:pl-4 last:pr-4";

/** Pestaña "Descuentos" del reporte: cuánto se descontó por cada vía, por cupón, por promoción y los descuentos manuales. */
export function ReporteDeDescuentos({ r }: { r: ReporteDescuentos }) {
  const vias = [
    { titulo: "Descuentos automáticos", monto: r.totales.promociones, icono: Tag },
    { titulo: "Combos", monto: r.totales.combos, icono: Gift },
    { titulo: "Cupones", monto: r.totales.cupones, icono: TicketPercent },
    { titulo: "Descuentos manuales", monto: r.totales.manual, icono: Hand },
  ];
  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Descuentos por tipo">
        {vias.map(({ titulo, monto, icono: Icono }) => (
          <div key={titulo} className="rounded-3xl border bg-card p-4 shadow-sm">
            <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Icono className="size-4 text-primary" /> {titulo}
            </p>
            <p className="cifras mt-1 font-display text-2xl font-extrabold">{formatoBs(monto)}</p>
          </div>
        ))}
      </section>
      <p className="text-sm text-muted-foreground">
        Total descontado en el período: <strong className="cifras text-foreground">{formatoBs(r.totales.total)}</strong> (solo ventas completadas).
      </p>

      <div className="grid gap-5 lg:grid-cols-2">
        <Tabla titulo="Por cupón" vacio="No se usaron cupones en estas fechas." columnas={["Cupón", "Usos", "Descontado"]}>
          {r.cupones.map((c) => (
            <tr key={c.codigo} className="border-b last:border-0">
              <td className="py-2.5 pr-3 pl-4">
                <p className="font-mono font-bold">{c.codigo}</p>
                {c.descripcion && <p className="text-xs text-muted-foreground">{c.descripcion}</p>}
              </td>
              <td className={td}>{c.usos}</td>
              <td className={`${td} font-display font-extrabold`}>{formatoBs(c.total)}</td>
            </tr>
          ))}
        </Tabla>
        <Tabla titulo="Por descuento automático" vacio="Ningún descuento automático se aplicó en estas fechas." columnas={["Promoción", "Ventas", "Descontado"]}>
          {r.promociones.map((p) => (
            <tr key={p.id} className="border-b last:border-0">
              <td className="py-2.5 pr-3 pl-4 font-semibold">{p.nombre}</td>
              <td className={td}>{p.ventas}</td>
              <td className={`${td} font-display font-extrabold`}>{formatoBs(p.total)}</td>
            </tr>
          ))}
        </Tabla>
      </div>

      <Tabla titulo="Descuentos manuales de los cajeros" vacio="Ningún cajero dio descuentos manuales en estas fechas." columnas={["Venta", "Cajero · sucursal", "Motivo", "%", "Descontado"]} minimo="min-w-[44rem]">
        {r.manuales.map((m) => (
          <tr key={m.ventaId} className="border-b align-top last:border-0">
            <td className="cifras py-2.5 pr-3 pl-4 whitespace-nowrap">
              <span className="font-mono font-bold">#{m.numero}</span>
              <span className="block text-xs text-muted-foreground">{fechaHora(m.fecha)}</span>
            </td>
            <td className="px-3 py-2.5">
              <p className="font-semibold">{m.cajero}</p>
              <p className="text-xs text-muted-foreground">{m.sucursal}</p>
            </td>
            <td className="max-w-80 px-3 py-2.5 text-muted-foreground">{m.motivo}</td>
            <td className={td}>{m.porcentaje ? `${Number(m.porcentaje).toLocaleString("es-BO")} %` : "—"}</td>
            <td className={`${td} font-display font-extrabold`}>{formatoBs(m.monto)}</td>
          </tr>
        ))}
      </Tabla>
    </div>
  );
}

function Tabla({ titulo, columnas, vacio, minimo = "", children }: { titulo: string; columnas: string[]; vacio: string; minimo?: string; children: React.ReactNode[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-extrabold">{titulo}</h2>
      <div className="overflow-x-auto rounded-3xl border bg-card shadow-sm">
        <table className={`w-full text-sm ${minimo}`}>
          <thead>
            <tr className="border-b text-xs font-bold tracking-wide text-muted-foreground uppercase">
              {columnas.map((c) => (
                <th key={c} className={th}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {children}
            {children.length === 0 && (
              <tr>
                <td colSpan={columnas.length} className="p-8 text-center text-muted-foreground">
                  {vacio}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
