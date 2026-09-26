import type { Metadata } from "next";
import { EnConstruccion } from "@/components/shell/en-construccion";

export const metadata: Metadata = { title: "Auditoría" };

export default function Pagina() {
  return <EnConstruccion titulo="Auditoría" fase={7} />;
}
