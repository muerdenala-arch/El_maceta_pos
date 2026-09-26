import type { Metadata } from "next";
import { EnConstruccion } from "@/components/shell/en-construccion";

export const metadata: Metadata = { title: "Personal" };

export default function Pagina() {
  return <EnConstruccion titulo="Personal" fase={2} />;
}
