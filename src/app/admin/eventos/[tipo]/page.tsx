import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ZonaModulo } from "@/components/permisos/zona-modulo";
import { requerirModulo } from "@/lib/auth/modulo-servidor";
import { listarEventos, listarTorneos } from "@/lib/eventos/consultas";
import { juegoPorSlug } from "@/lib/eventos/tipos";
import { hoyEnBolivia } from "@/lib/formato";
import { listarSucursalesActivas } from "@/lib/sucursal-vista";
import { ListaRetos } from "./lista-retos";
import { ListaTorneos } from "./lista-torneos";

export async function generateMetadata(props: PageProps<"/admin/eventos/[tipo]">): Promise<Metadata> {
  return { title: juegoPorSlug((await props.params).tipo)?.titulo ?? "Eventos" };
}

/** Eventos de un tipo de juego (Reto Transformación o Torneo de Pulseada) y alta de uno nuevo. */
export default async function PaginaTipoEvento(props: PageProps<"/admin/eventos/[tipo]">) {
  const { soloLectura } = await requerirModulo("eventos");
  const juego = juegoPorSlug((await props.params).tipo);
  if (!juego) notFound();
  if (juego.tipo === "torneo_pulseada") {
    const [lista, sucursales] = await Promise.all([listarTorneos(), listarSucursalesActivas()]);
    return (
      <ZonaModulo soloLectura={soloLectura}>
        <ListaTorneos juego={juego} torneos={lista} sucursales={sucursales} hoy={hoyEnBolivia()} />
      </ZonaModulo>
    );
  }
  const [lista, sucursales] = await Promise.all([listarEventos(juego.tipo), listarSucursalesActivas()]);
  return (
    <ZonaModulo soloLectura={soloLectura}>
      <ListaRetos juego={juego} retos={lista} sucursales={sucursales} hoy={hoyEnBolivia()} />
    </ZonaModulo>
  );
}
