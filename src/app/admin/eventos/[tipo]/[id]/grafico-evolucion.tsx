"use client";

import { useState } from "react";
import { fechaCorta } from "@/components/eventos/estado-evento";
import type { evolucion } from "@/lib/eventos/calculos";
import { cn } from "@/lib/utils";

type Serie = ReturnType<typeof evolucion>[number];

const COLORES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
/** Del 6.º en adelante se repiten los colores con otra línea (hay 5 colores de gráfico en el sistema de diseño). */
const TRAZOS = ["", "6 4", "2 3"];

const ANCHO = 640;
const ALTO = 260;
const M = { izq: 44, der: 12, arr: 12, aba: 28 };
const dia = (f: string) => Date.parse(`${f}T12:00:00Z`) / 86_400_000;

/** Evolución del peso (kg) o del porcentaje perdido de cada participante a lo largo del reto. */
export function GraficoEvolucion({ series, fechaInicio, fechaFin }: { series: Serie[]; fechaInicio: string; fechaFin: string }) {
  const [medida, setMedida] = useState<"porcentaje" | "peso">("porcentaje");
  const [resaltada, setResaltada] = useState<number | null>(null);
  const conDatos = series.filter((s) => s.puntos.length > 1);

  const valores = conDatos.flatMap((s) => s.puntos.map((p) => (medida === "peso" ? p.peso : p.porcentaje) / 100));
  const min = Math.min(...valores, medida === "porcentaje" ? 0 : Infinity);
  const max = Math.max(...valores, medida === "porcentaje" ? 1 : -Infinity);
  const margen = (max - min) * 0.08 || 1;
  const [y0, y1] = [min - margen, max + margen];
  const ultimoDia = Math.max(dia(fechaFin), ...conDatos.flatMap((s) => s.puntos.map((p) => dia(p.fecha))));
  const x = (f: string) => M.izq + ((dia(f) - dia(fechaInicio)) / Math.max(ultimoDia - dia(fechaInicio), 1)) * (ANCHO - M.izq - M.der);
  const y = (v: number) => M.arr + (1 - (v - y0) / (y1 - y0)) * (ALTO - M.arr - M.aba);
  const marcas = Array.from({ length: 5 }, (_, i) => y0 + ((y1 - y0) * i) / 4);

  if (conDatos.length === 0) {
    return <p className="rounded-3xl border border-dashed p-8 text-center text-sm text-muted-foreground">El gráfico aparece con el primer pesaje.</p>;
  }

  return (
    <figure className="space-y-3 rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <figcaption className="text-sm font-bold text-muted-foreground">Evolución durante el reto</figcaption>
        <div className="flex rounded-full border p-0.5 text-xs font-bold" role="group" aria-label="Medida del gráfico">
          {(["porcentaje", "peso"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={medida === m}
              onClick={() => setMedida(m)}
              className={cn("rounded-full px-3 py-1", medida === m ? "bg-nav-activo text-nav-activo-foreground" : "text-muted-foreground")}
            >
              {m === "porcentaje" ? "% perdido" : "Peso (kg)"}
            </button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="h-auto w-full" role="img" aria-label="Gráfico de líneas de la evolución de cada participante">
        {marcas.map((v) => (
          <g key={v}>
            <line x1={M.izq} x2={ANCHO - M.der} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
            <text x={M.izq - 6} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
              {v.toLocaleString("es-BO", { maximumFractionDigits: 1 })}
              {medida === "porcentaje" ? "%" : ""}
            </text>
          </g>
        ))}
        <text x={M.izq} y={ALTO - 8} className="fill-muted-foreground text-[10px]">
          {fechaCorta(fechaInicio).slice(0, 5)}
        </text>
        <text x={ANCHO - M.der} y={ALTO - 8} textAnchor="end" className="fill-muted-foreground text-[10px]">
          {fechaCorta(fechaFin).slice(0, 5)}
        </text>
        {conDatos.map((s, i) => {
          const tenue = resaltada !== null && resaltada !== s.participanteId;
          const puntos = s.puntos.map((p) => [x(p.fecha), y((medida === "peso" ? p.peso : p.porcentaje) / 100)] as const);
          return (
            <g key={s.participanteId} opacity={tenue ? 0.15 : 1} className="transition-opacity">
              <polyline
                points={puntos.map((p) => p.join(",")).join(" ")}
                fill="none"
                stroke={COLORES[i % COLORES.length]}
                strokeWidth={resaltada === s.participanteId ? 3.5 : 2.25}
                strokeDasharray={TRAZOS[Math.floor(i / COLORES.length) % TRAZOS.length]}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {puntos.map(([px, py], k) => (
                <circle key={k} cx={px} cy={py} r={3} fill={COLORES[i % COLORES.length]} />
              ))}
            </g>
          );
        })}
      </svg>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {conDatos.map((s, i) => (
          <li key={s.participanteId}>
            <button
              type="button"
              className="flex items-center gap-1.5 font-semibold"
              onMouseEnter={() => setResaltada(s.participanteId)}
              onMouseLeave={() => setResaltada(null)}
              onFocus={() => setResaltada(s.participanteId)}
              onBlur={() => setResaltada(null)}
              onClick={() => setResaltada((r) => (r === s.participanteId ? null : s.participanteId))}
            >
              <svg width="18" height="6" aria-hidden>
                <line x1="0" x2="18" y1="3" y2="3" stroke={COLORES[i % COLORES.length]} strokeWidth="3" strokeDasharray={TRAZOS[Math.floor(i / COLORES.length) % TRAZOS.length]} />
              </svg>
              {s.nombre}
            </button>
          </li>
        ))}
      </ul>
    </figure>
  );
}
