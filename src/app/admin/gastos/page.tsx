import type { Metadata } from "next";
import { EnConstruccion } from "@/components/shell/en-construccion";

export const metadata: Metadata = { title: "Gasto diario" };

export default function Pagina() {
  return <EnConstruccion titulo="Gasto diario" fase={4} />;
}
