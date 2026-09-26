import type { Metadata } from "next";
import { EnConstruccion } from "@/components/shell/en-construccion";

export const metadata: Metadata = { title: "Promociones" };

export default function Pagina() {
  return <EnConstruccion titulo="Promociones" fase={5} />;
}
