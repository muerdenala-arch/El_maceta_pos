import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Resaltar } from "@/components/busqueda/buscador";
import { Button } from "@/components/ui/button";
import { aCentavos } from "@/lib/dinero";
import { formatoBs } from "@/lib/formato";
import { textoCantidadVendida } from "@/lib/inventario/fraccion";
import type { VentasCajero, VentasDia, VentasProducto } from "@/lib/reportes/ventas";
import { cn } from "@/lib/utils";

/** Margen de ganancia sobre la venta neta, "32,5 %" (o "—" sin ventas). */
export function margen(ganancia: string, neto: string) {
  const n = aCentavos(neto);
  if (n <= 0n) return "—";
  return `${((Number(aCentavos(ganancia)) / Number(n)) * 100).toLocaleString("es-BO", { maximumFractionDigits: 1 })} %`;
}

const diaCorto = (dia: string) =>
  new Date(`${dia}T12:00:00Z`).toLocaleDateString("es-BO", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "short" });

function Tabla({ minimo, children }: { minimo: string; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-3xl border bg-card shadow-sm">
      <table className={cn("w-full text-sm", minimo)}>{children}</table>
    </div>
  );
}

const th = "px-3 py-3 text-right first:pl-4 first:text-left last:pr-4";
const td = "cifras px-3 py-2.5 text-right whitespace-nowrap first:pl-4 last:pr-4";

function Vacio({ columnas, texto }: { columnas: number; texto: string }) {
  return (
    <tr>
      <td colSpan={columnas} className="p-10 text-center text-muted-foreground">
        {texto}
      </td>
    </tr>
  );
}

export function TablaProductos({ filas, consulta = "", sinCostos = false }: { filas: VentasProducto[]; consulta?: string; /** Encargado: sin costo, ganancia ni margen. */ sinCostos?: boolean }) {
  const maximo = Math.max(...filas.map((f) => Number(f.neto)), 0);
  return (
    <Tabla minimo={sinCostos ? "min-w-[36rem]" : "min-w-[52rem]"}>
      <thead>
        <tr className="border-b text-xs font-bold tracking-wide text-muted-foreground uppercase">
          <th className={th}>Producto</th>
          <th className={th}>Unidades</th>
          <th className={th}>Bruto</th>
          <th className={th}>Descuentos</th>
          <th className={th}>Neto</th>
          {!sinCostos && (
            <>
              <th className={th}>Costo</th>
              <th className={th}>Ganancia</th>
              <th className={th}>Margen</th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {filas.map((p, i) => (
          <tr key={p.id} className="border-b last:border-0">
            <td className="py-2.5 pr-3 pl-4">
              <div className="flex items-center gap-3">
                <span className="cifras w-6 text-right text-xs font-bold text-muted-foreground">{i + 1}</span>
                <div className="min-w-0">
                  <p className="font-semibold">
                    <Resaltar texto={p.nombre} consulta={consulta} />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <Resaltar texto={[p.marca, p.sabor, p.presentacion].filter(Boolean).join(" · ")} consulta={consulta} />
                  </p>
                  <div className="mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-muted-foreground/15">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${maximo > 0 ? (Number(p.neto) / maximo) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
            </td>
            <td className={cn(td, "font-bold")}>
              {p.unidades}
              {p.sueltas > 0 && (
                <span className="block text-xs font-semibold text-muted-foreground" title={`Sueltas: ${formatoBs(p.netoSueltas)}`}>
                  + {textoCantidadVendida(p.sueltas, p.unidadFraccion ?? "capsula")} · {formatoBs(p.netoSueltas)}
                </span>
              )}
            </td>
            <td className={td}>{formatoBs(p.bruto)}</td>
            <td className={cn(td, aCentavos(p.descuento) > 0n && "text-destructive")}>{aCentavos(p.descuento) > 0n ? `−${formatoBs(p.descuento)}` : "—"}</td>
            <td className={cn(td, "font-display font-extrabold")}>{formatoBs(p.neto)}</td>
            {!sinCostos && (
              <>
                <td className={cn(td, "text-muted-foreground")}>{formatoBs(p.costo)}</td>
                <td className={cn(td, "font-bold", aCentavos(p.ganancia) < 0n ? "text-destructive" : "text-exito")}>{formatoBs(p.ganancia)}</td>
                <td className={td}>{margen(p.ganancia, p.neto)}</td>
              </>
            )}
          </tr>
        ))}
        {filas.length === 0 && <Vacio columnas={sinCostos ? 5 : 8} texto="No se vendieron productos con estos filtros." />}
      </tbody>
    </Tabla>
  );
}

export function TablaDias({ filas }: { filas: VentasDia[] }) {
  const maximo = Math.max(...filas.map((f) => Number(f.total)), 0);
  return (
    <div className="space-y-4">
      {filas.length > 1 && (
        <figure className="rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
          <figcaption className="text-sm font-bold text-muted-foreground">Ventas por día</figcaption>
          <div className="mt-4 flex h-48 items-end gap-1 overflow-x-auto" role="img" aria-label="Gráfico de ventas por día">
            {filas.map((d) => (
              <div key={d.dia} className="flex h-full min-w-5 flex-1 flex-col justify-end" title={`${diaCorto(d.dia)}: ${formatoBs(d.total)}`}>
                <div className="w-full rounded-t-md bg-primary/85 transition-colors hover:bg-primary" style={{ height: `${maximo > 0 ? Math.max((Number(d.total) / maximo) * 100, 2) : 0}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted-foreground">
            <span>{diaCorto(filas[0].dia)}</span>
            <span>{diaCorto(filas.at(-1)!.dia)}</span>
          </div>
        </figure>
      )}
      <Tabla minimo="min-w-[36rem]">
        <thead>
          <tr className="border-b text-xs font-bold tracking-wide text-muted-foreground uppercase">
            <th className={th}>Día</th>
            <th className={th}>Ventas</th>
            <th className={th}>Efectivo</th>
            <th className={th}>QR</th>
            <th className={th}>Total</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((d) => (
            <tr key={d.dia} className="border-b last:border-0">
              <td className={cn(td, "font-semibold first-letter:uppercase")}>{diaCorto(d.dia)}</td>
              <td className={td}>{d.cantidad}</td>
              <td className={td}>{formatoBs(d.efectivo)}</td>
              <td className={td}>{formatoBs(d.qr)}</td>
              <td className={cn(td, "font-display font-extrabold")}>{formatoBs(d.total)}</td>
            </tr>
          ))}
          {filas.length === 0 && <Vacio columnas={5} texto="Sin ventas en estas fechas." />}
        </tbody>
      </Tabla>
    </div>
  );
}

export function TablaCajeros({ filas, consulta = "" }: { filas: VentasCajero[]; consulta?: string }) {
  return (
    <Tabla minimo="min-w-[40rem]">
      <thead>
        <tr className="border-b text-xs font-bold tracking-wide text-muted-foreground uppercase">
          <th className={th}>Cajero · sucursal</th>
          <th className={th}>Ventas</th>
          <th className={th}>Anuladas</th>
          <th className={th}>Efectivo</th>
          <th className={th}>QR</th>
          <th className={th}>Total</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((c) => (
          <tr key={`${c.id}-${c.sucursal}`} className="border-b last:border-0">
            <td className="py-2.5 pr-3 pl-4">
              <p className="font-semibold">
                <Resaltar texto={c.cajero} consulta={consulta} />
              </p>
              <p className="text-xs text-muted-foreground">
                <Resaltar texto={c.sucursal} consulta={consulta} />
              </p>
            </td>
            <td className={td}>{c.cantidad}</td>
            <td className={cn(td, c.anuladas > 0 && "font-bold text-destructive")}>{c.anuladas}</td>
            <td className={td}>{formatoBs(c.efectivo)}</td>
            <td className={td}>{formatoBs(c.qr)}</td>
            <td className={cn(td, "font-display font-extrabold")}>{formatoBs(c.total)}</td>
          </tr>
        ))}
        {filas.length === 0 && <Vacio columnas={6} texto="Sin ventas en estas fechas." />}
      </tbody>
    </Tabla>
  );
}

/** Anterior / siguiente con enlaces (?pagina=N). */
export function Paginacion({ pagina, hayMas, href }: { pagina: number; hayMas: boolean; href: (pagina: number) => string }) {
  if (pagina <= 1 && !hayMas) return null;
  return (
    <nav className="flex items-center justify-end gap-2" aria-label="Paginación">
      <span className="text-sm text-muted-foreground">Página {pagina}</span>
      {pagina > 1 ? (
        <Button variant="outline" size="icon" asChild>
          <Link href={href(pagina - 1)} replace scroll={false} aria-label="Página anterior">
            <ChevronLeft className="size-4" />
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="icon" disabled aria-label="Página anterior">
          <ChevronLeft className="size-4" />
        </Button>
      )}
      {hayMas ? (
        <Button variant="outline" size="icon" asChild>
          <Link href={href(pagina + 1)} replace scroll={false} aria-label="Página siguiente">
            <ChevronRight className="size-4" />
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="icon" disabled aria-label="Página siguiente">
          <ChevronRight className="size-4" />
        </Button>
      )}
    </nav>
  );
}
