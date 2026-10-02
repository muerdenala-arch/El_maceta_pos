import {
  BarChart3,
  Boxes,
  ClipboardCheck,
  Gift,
  HandCoins,
  Truck,
  Wallet,
  LayoutDashboard,
  Package,
  PackageSearch,
  QrCode,
  ReceiptText,
  ScrollText,
  Settings,
  ShoppingCart,
  Store,
  TicketPercent,
  Trophy,
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
  { href: "/admin/combos", titulo: "Combos", icono: Gift, fase: 12 },
  { href: "/admin/eventos", titulo: "Eventos", icono: Trophy, fase: 11 },
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

/**
 * Menú del encargado de sucursal: supervisa su sucursal (/encargado/*) y además opera una caja como un cajero
 * (/cajero/*). No tiene catálogo, precios, personal, QR, cupones ni configuración.
 */
export const navEncargado: ItemNav[] = [
  { href: "/encargado/panel", titulo: "Inicio", icono: LayoutDashboard, fase: 13 },
  { href: "/cajero/venta", titulo: "Venta", icono: ShoppingCart, fase: 4 },
  { href: "/encargado/reportes", titulo: "Reportes de venta", icono: BarChart3, fase: 13 },
  { href: "/encargado/gastos", titulo: "Gastos de la sucursal", icono: ReceiptText, fase: 13 },
  { href: "/cajero/bodega", titulo: "Stock y pedidos", icono: PackageSearch, fase: 3 },
  { href: "/encargado/transferencias", titulo: "Transferencias", icono: Truck, fase: 13 },
  { href: "/cajero/gastos", titulo: "Registrar gasto", icono: HandCoins, fase: 4 },
  { href: "/cajero/cierre", titulo: "Cierre de caja", icono: ClipboardCheck, fase: 4 },
];

/** Pestañas inferiores del encargado en el celular (el resto, en el menú lateral). */
export const navEncargadoInferior: ItemNav[] = [
  { href: "/encargado/panel", titulo: "Inicio", icono: LayoutDashboard, fase: 13 },
  { href: "/cajero/venta", titulo: "Venta", icono: ShoppingCart, fase: 4 },
  { href: "/cajero/bodega", titulo: "Stock", icono: PackageSearch, fase: 3 },
  { href: "/admin/auditoria", titulo: "Cajas", icono: Wallet, fase: 13 },
];

/**
 * Apartados del administrador que también usa el encargado (lib/auth/modulos.ts): se agregan a su menú. Cada uno
 * tiene un candado que abre o cierra el administrador (cerrado = el encargado lo ve en solo lectura).
 */
export const navEncargadoCompartido: ItemNav[] = navAdmin.filter((i) =>
  ["catalogo", "inventario", "bodega", "promociones", "combos", "eventos", "qr", "sucursales", "auditoria", "configuracion"].includes(i.href.split("/")[2]),
);
