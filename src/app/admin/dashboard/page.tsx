import type { Metadata } from "next";
import { EnConstruccion } from "@/components/shell/en-construccion";

export const metadata: Metadata = { title: "Inicio" };

export default function Pagina() {
  return <EnConstruccion titulo="Inicio" fase={8} />;
}
