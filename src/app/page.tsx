import { redirect } from "next/navigation";

// En la Fase 1 se redirigirá según la sesión: admin → /admin/dashboard, cajero → /cajero/venta.
export default function Inicio() {
  redirect("/login");
}
