# El Maseta

Sistema de gestión y punto de venta para tiendas de suplementos: multi-sucursal con bodega central,
roles Administrador y Cajero, comprobantes imprimibles / PDF / WhatsApp y ventas sin internet.

## Puesta en marcha

1. Requisitos: Node.js 22 o superior, Git.
2. `npm install`
3. Copiar `.env.example` a `.env.local` y completar (URL de Neon, `JWT_SECRET`, PIN inicial del admin).
4. `npm run db:generate && npm run db:migrate && npm run db:seed`
5. `npm run dev` → http://localhost:3000

Guía para desarrolladores y reglas del proyecto: [CLAUDE.md](CLAUDE.md).
Sistema de diseño: [docs/sistema-de-diseno.md](docs/sistema-de-diseno.md).
