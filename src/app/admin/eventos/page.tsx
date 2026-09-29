import { BicepsFlexed, ChevronRight, Scale, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { requerirSesion } from "@/lib/auth/sesion";
import { conteoPorTipo } from "@/lib/eventos/consultas";
import { TIPOS_JUEGO } from "@/lib/eventos/tipos";

export const metadata: Metadata = { title: "Eventos" };

const ICONOS = { Scale, Trophy, BicepsFlexed };

/** Catálogo de tipos de juego del módulo Eventos (lib/eventos/tipos.ts). */
export default async function PaginaEventos() {
  await requerirSesion("admin");
  const conteo = await conteoPorTipo();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <EncabezadoPagina icono={Trophy} titulo="Eventos" descripcion="Juegos y retos para tus clientes" />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TIPOS_JUEGO.map((j) => {
          const Icono = ICONOS[j.icono];
          const c = conteo[j.tipo] ?? { total: 0, enCurso: 0 };
          return (
            <li key={j.tipo}>
              <Link
                href={`/admin/eventos/${j.slug}`}
                className="group flex h-full flex-col rounded-3xl border bg-card p-5 shadow-sm transition-colors hover:bg-accent"
              >
                <span className="flex size-14 items-center justify-center rounded-2xl bg-ficha-verde text-ficha-verde-foreground">
                  <Icono className="size-7" />
                </span>
                <h2 className="mt-4 font-display text-xl font-extrabold">{j.titulo}</h2>
                <p className="mt-1 flex-1 text-sm text-muted-foreground">{j.descripcion}</p>
                <p className="mt-4 flex items-center justify-between text-sm font-semibold">
                  <span>
                    {c.total} {c.total === 1 ? j.singular : j.plural}
                    {c.enCurso > 0 && <span className="text-exito"> · {c.enCurso} en curso</span>}
                  </span>
                  <ChevronRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
