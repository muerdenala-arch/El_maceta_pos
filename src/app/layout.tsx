import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree, JetBrains_Mono } from "next/font/google";
import { Proveedores } from "@/components/proveedores";
import "./globals.css";

const titulos = Bricolage_Grotesque({
  variable: "--font-titulos",
  subsets: ["latin"],
});

const cuerpo = Figtree({
  variable: "--font-cuerpo",
  subsets: ["latin"],
});

const numeros = JetBrains_Mono({
  variable: "--font-numeros",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "El Maseta", template: "%s · El Maseta" },
  description: "Sistema de gestión y punto de venta de suplementos",
  applicationName: "El Maseta",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#16181d" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: next-themes agrega la clase del tema antes de hidratar
    <html
      lang="es"
      suppressHydrationWarning
      className={`${titulos.variable} ${cuerpo.variable} ${numeros.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Proveedores>{children}</Proveedores>
      </body>
    </html>
  );
}
