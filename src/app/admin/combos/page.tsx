import { redirect } from "next/navigation";

/** Los combos ahora son una pestaña de "Promociones y cupones" (se conserva la dirección antigua). */
export default function PaginaCombos() {
  redirect("/admin/promociones?vista=combos");
}
