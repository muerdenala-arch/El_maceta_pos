import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type EstadoEvento = "borrador" | "en_curso" | "finalizado";

const ESTILO: Record<EstadoEvento, { texto: string; clase: string }> = {
  borrador: { texto: "Borrador", clase: "bg-ficha-neutra text-ficha-neutra-foreground" },
  en_curso: { texto: "En curso", clase: "bg-exito text-exito-foreground" },
  finalizado: { texto: "Finalizado", clase: "bg-ficha-naranja text-ficha-naranja-foreground" },
};

export function EstadoEventoBadge({ estado, className }: { estado: EstadoEvento; className?: string }) {
  return <Badge className={cn(ESTILO[estado].clase, className)}>{ESTILO[estado].texto}</Badge>;
}

/** "2026-10-01" → "01/10/2026" */
export const fechaCorta = (f: string) => f.split("-").reverse().join("/");
