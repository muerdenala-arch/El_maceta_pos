import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { configuracion } from "@/db/schema";
import { Pestanas } from "@/components/inventario/pestanas";
import { requerirSesion } from "@/lib/auth/sesion";
import { obtenerEvento, participantesDe, pesajesDe } from "@/lib/eventos/consultas";
import { juegoPorSlug } from "@/lib/eventos/tipos";
import { hoyEnBolivia } from "@/lib/formato";
import { EncabezadoReto } from "./encabezado-reto";
import { PestanaParticipantes } from "./participantes";
import { PestanaPesajes } from "./pesajes";
import { PestanaPosiciones } from "./posiciones";

export const metadata: Metadata = { title: "Reto Transformación" };

const VISTAS = ["participantes", "pesajes", "posiciones"] as const;

/** Detalle del reto: cabecera y pestañas Participantes, Pesajes y Tabla de posiciones. */
export default async function PaginaReto(props: PageProps<"/admin/eventos/[tipo]/[id]">) {
  await requerirSesion("admin");
  const { tipo, id } = await props.params;
  const juego = juegoPorSlug(tipo);
  const eventoId = Number(id);
  if (!juego || !Number.isInteger(eventoId) || eventoId <= 0) notFound();

  const [evento, participantes, pesajes, [negocio]] = await Promise.all([
    obtenerEvento(eventoId, juego.tipo),
    participantesDe(eventoId),
    pesajesDe(eventoId),
    db
      .select({ nombre: configuracion.nombreComercial, logoUrl: configuracion.logoUrl, nit: configuracion.nit, codigoPais: configuracion.codigoPais })
      .from(configuracion)
      .where(eq(configuracion.id, 1)),
  ]);
  if (!evento) notFound();

  const sp = await props.searchParams;
  const vista = VISTAS.find((v) => v === sp.vista) ?? (evento.estado === "finalizado" ? "posiciones" : "participantes");
  const base = `/admin/eventos/${juego.slug}/${evento.id}`;
  const datos = { evento, participantes, pesajes, hoy: hoyEnBolivia(), negocio: negocio ?? { nombre: "El Maseta", logoUrl: null, nit: null, codigoPais: "591" } };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href={`/admin/eventos/${juego.slug}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {juego.titulo}
      </Link>
      <EncabezadoReto {...datos} />
      <Pestanas
        actual={vista}
        opciones={[
          { valor: "participantes", titulo: "Participantes", href: `${base}?vista=participantes`, contador: participantes.filter((p) => p.activo).length },
          { valor: "pesajes", titulo: "Pesajes", href: `${base}?vista=pesajes` },
          { valor: "posiciones", titulo: evento.estado === "finalizado" ? "Resultados" : "Tabla de posiciones", href: `${base}?vista=posiciones` },
        ]}
      />
      {vista === "participantes" && <PestanaParticipantes {...datos} />}
      {vista === "pesajes" && <PestanaPesajes {...datos} />}
      {vista === "posiciones" && <PestanaPosiciones {...datos} />}
    </div>
  );
}
