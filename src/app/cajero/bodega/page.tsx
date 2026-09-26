import type { Metadata } from "next";
import { EnConstruccion } from "@/components/shell/en-construccion";

export const metadata: Metadata = { title: "Bodega" };

export default function Pagina() {
  return <EnConstruccion titulo="Bodega" fase={3} />;
}
