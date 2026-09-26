import type { Metadata } from "next";
import { EnConstruccion } from "@/components/shell/en-construccion";

export const metadata: Metadata = { title: "Inventario" };

export default function Pagina() {
  return <EnConstruccion titulo="Inventario" fase={3} />;
}
