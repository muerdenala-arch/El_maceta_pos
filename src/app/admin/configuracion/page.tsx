import type { Metadata } from "next";
import { EnConstruccion } from "@/components/shell/en-construccion";

export const metadata: Metadata = { title: "Configuración" };

export default function Pagina() {
  return <EnConstruccion titulo="Configuración" fase={2} />;
}
