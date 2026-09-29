"use client";

import { useMemo } from "react";
import { Llaves } from "@/components/eventos/llaves-torneo";
import { nombresDe, type TorneoProps } from "./tipos";

/** Llaves por rondas (eliminación) o fechas (todos contra todos). Se recorre de lado en el celular. */
export function PestanaLlaves({ torneo, llaves, participantes }: TorneoProps) {
  const nombres = useMemo(() => nombresDe(participantes), [participantes]);
  if (!torneo.sorteado) return <p className="rounded-2xl bg-muted p-4 text-sm">Las llaves aparecen al sortear.</p>;
  return <Llaves llaves={llaves} formato={torneo.formato} nombres={nombres} />;
}
