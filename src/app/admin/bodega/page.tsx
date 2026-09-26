import type { Metadata } from "next";
import { EnConstruccion } from "@/components/shell/en-construccion";

export const metadata: Metadata = { title: "Bodega central" };

export default function Pagina() {
  return <EnConstruccion titulo="Bodega central" fase={3} />;
}
