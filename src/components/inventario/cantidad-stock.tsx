import { stockCorto, textoStock, type Fraccionable } from "@/lib/inventario/fraccion";
import { cn } from "@/lib/utils";

/** Datos de fracción de un producto que puede no traerlos (listas ligeras): por defecto, no fraccionado. */
export const fraccionDe = (p: Partial<Fraccionable> | null | undefined): Fraccionable => ({
  fraccionado: !!p?.fraccionado,
  unidadFraccion: p?.unidadFraccion ?? null,
  unidadesPorEnvase: p?.unidadesPorEnvase ?? null,
});

/**
 * Cantidad de stock lista para mostrar. Producto normal: el número. Producto fraccionado: los envases en grande
 * y las unidades sueltas debajo ("3" + "+45 cápsulas"), con el detalle completo al pasar el mouse.
 */
export function CantidadStock({ unidades, producto, className, claseExtra }: { unidades: number; producto: Partial<Fraccionable> | null | undefined; className?: string; claseExtra?: string }) {
  const p = fraccionDe(producto);
  const { principal, extra } = stockCorto(unidades, p);
  return (
    <span className={cn("inline-flex flex-col items-end leading-tight", className)} title={p.fraccionado ? textoStock(unidades, p) : undefined}>
      <span>{principal}</span>
      {extra && <span className={cn("font-sans text-[10px] font-semibold whitespace-nowrap text-muted-foreground", claseExtra)}>{extra}</span>}
    </span>
  );
}
