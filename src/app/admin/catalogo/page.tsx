import type { Metadata } from "next";
import { EnConstruccion } from "@/components/shell/en-construccion";

export const metadata: Metadata = { title: "Catálogo" };

export default function Pagina() {
  return <EnConstruccion titulo="Catálogo" fase={2} />;
}
