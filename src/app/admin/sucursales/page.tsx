import type { Metadata } from "next";
import { EnConstruccion } from "@/components/shell/en-construccion";

export const metadata: Metadata = { title: "Sucursales" };

export default function Pagina() {
  return <EnConstruccion titulo="Sucursales" fase={2} />;
}
