import type { Metadata } from "next";
import { EnConstruccion } from "@/components/shell/en-construccion";

export const metadata: Metadata = { title: "Apertura de caja" };

export default function Pagina() {
  return <EnConstruccion titulo="Apertura de caja" fase={4} />;
}
