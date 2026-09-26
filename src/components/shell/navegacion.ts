import {
  BarChart3,
  Boxes,
  ClipboardCheck,
  LayoutDashboard,
  Package,
  QrCode,
  ReceiptText,
  ScrollText,
  Settings,
  ShoppingCart,
  Store,
  TicketPercent,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export type ItemNav = { href: string; titulo: string; icono: LucideIcon; fase: number };

/** Menú del administrador (sección 4 del plan). `fase` = fase en la que se construye. */
export const navAdmin: ItemNav[] = [
  { href: "/admin/dashboard", titulo: "Inicio", icono: LayoutDashboard, fase: 8 },
  { href: "/admin/reportes", titulo: "Reportes de venta", icono: BarChart3, fase: 8 },
  { href: "/admin/gastos", titulo: "Gastos diarios", icono: ReceiptText, fase: 4 },
  { href: "/admin/catalogo", titulo: "Catálogo", icono: Package, fase: 2 },
  { href: "/admin/inventario", titulo: "Inventario de sucursales", icono: Boxes, fase: 3 },
  { href: "/admin/bodega", titulo: "Bodega central", icono: Warehouse, fase: 3 },
  { href: "/admin/promociones", titulo: "Promociones y cupones", icono: TicketPercent, fase: 5 },
  { href: "/admin/personal", titulo: "Personal / Cajeros", icono: Users, fase: 2 },
  { href: "/admin/qr", titulo: "QR de cobro", icono: QrCode, fase: 4 },
  { href: "/admin/sucursales", titulo: "Sucursales", icono: Store, fase: 2 },
  { href: "/admin/auditoria", titulo: "Auditoría de caja", icono: ScrollText, fase: 7 },
  { href: "/admin/configuracion", titulo: "Configuración", icono: Settings, fase: 2 },
];

/** Menú del cajero (sección 5 del plan): Venta · Bodega · Gastos · Cierre de caja. */
export const navCajero: ItemNav[] = [
  { href: "/cajero/venta", titulo: "Venta", icono: ShoppingCart, fase: 4 },
  { href: "/cajero/bodega", titulo: "Bodega", icono: Warehouse, fase: 3 },
  { href: "/cajero/gastos", titulo: "Gastos", icono: ReceiptText, fase: 4 },
  { href: "/cajero/cierre", titulo: "Cierre de caja", icono: ClipboardCheck, fase: 4 },
];
