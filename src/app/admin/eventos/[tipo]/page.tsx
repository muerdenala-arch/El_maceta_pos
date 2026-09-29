import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/auth/sesion";
import { listarEventos } from "@/lib/eventos/consultas";
import { juegoPorSlug } from "@/lib/eventos/tipos";
import { hoyEnBolivia } from "@/lib/formato";
import { listarSucursalesActivas } from "@/lib/sucursal-vista";
import { ListaRetos } from "./lista-retos";

export async function generateMetadata(props: PageProps<"/admin/eventos/[tipo]">): Promise<Metadata> {
  return { title: juegoPorSlug((await props.params).tipo)?.titulo ?? "Eventos" };
}

/** Eventos de un tipo de juego (hoy: Reto Transformación) y alta de uno nuevo. */
export default async function PaginaTipoEvento(props: PageProps<"/admin/eventos/[tipo]">) {
  await requerirSesion("admin");
  const juego = juegoPorSlug((await props.params).tipo);
  if (!juego) notFound();
  const [lista, sucursales] = await Promise.all([listarEventos(juego.tipo), listarSucursalesActivas()]);
  return <ListaRetos juego={juego} retos={lista} sucursales={sucursales} hoy={hoyEnBolivia()} />;
}
