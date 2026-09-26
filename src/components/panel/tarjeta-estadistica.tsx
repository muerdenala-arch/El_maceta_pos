import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type TonoFicha = "naranja" | "verde" | "rosa" | "neutra";

const tonos: Record<TonoFicha, string> = {
  naranja: "bg-ficha-naranja text-ficha-naranja-foreground",
  verde: "bg-ficha-verde text-ficha-verde-foreground",
  rosa: "bg-ficha-rosa text-ficha-rosa-foreground",
  neutra: "bg-ficha-neutra text-ficha-neutra-foreground",
};

/** Tarjeta de estadística: ficha de color con ícono, valor grande y descripción. */
export function TarjetaEstadistica({
  icono: Icono,
  tono,
  valor,
  titulo,
  detalle,
}: {
  icono: LucideIcon;
  tono: TonoFicha;
  valor: string;
  titulo: string;
  detalle?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-40 flex-col rounded-3xl border bg-card p-5 shadow-sm">
      <span className={cn("flex size-10 items-center justify-center rounded-xl", tonos[tono])}>
        <Icono className="size-5" strokeWidth={2} />
      </span>
      <p className="cifras mt-4 font-display text-2xl leading-tight font-extrabold tracking-tight">{valor}</p>
      <p className="mt-auto pt-3 text-sm font-semibold">{titulo}</p>
      {detalle && <p className="mt-0.5 text-xs text-muted-foreground">{detalle}</p>}
    </div>
  );
}
