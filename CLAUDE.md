@AGENTS.md

# El Maseta — Sistema de gestión de suplementos

PWA (celular y PC) para vender suplementos en varias sucursales con bodega central, roles
**Administrador** y **Cajero**, comprobantes (impresión 58/80 mm/carta, PDF, WhatsApp) y ventas
sin internet. La especificación completa es `Plan_de_trabajo_Sistema_Suplementos.pdf` (del dueño);
este archivo resume lo esencial. **Ante cualquier ambigüedad, preguntar al dueño antes de asumir.**

## Stack

- Next.js 16 (App Router) + TypeScript + Turbopack. **Leer `node_modules/next/dist/docs/` antes de
  usar una API de Next**: en v16 `middleware.ts` se llama `proxy.ts` (runtime nodejs), y
  `params`/`searchParams`/`cookies()`/`headers()` son asíncronos.
- Tailwind CSS v4 + shadcn/ui (radix, estilo new-york) — componentes en `src/components/ui`.
- Motion (`motion/react`) — animaciones < 250 ms en el POS; `MotionConfig reducedMotion="user"` ya está global.
- next-themes (clase `.dark`), Drizzle ORM + Neon (`@neondatabase/serverless`, Pool/WebSocket para transacciones),
  Zod, jose (JWT en cookie httpOnly), bcryptjs (PIN), Vitest.
- Pendientes por fase: Vercel Blob (F2), @react-pdf/renderer (F4b), Serwist + Dexie (F6), SheetJS (F8),
  Playwright (F9), Sentry (cuando exista cuenta/DSN).

## Comandos

```
npm run dev          # servidor de desarrollo (http://localhost:3000)
npm run build        # compilación de producción
npm run typecheck    # tsc --noEmit
npm run lint
npm test             # vitest
npm run db:generate  # genera migración SQL desde src/db/schema.ts
npm run db:migrate   # aplica migraciones (Neon: usa DATABASE_URL_DIRECTA; PGlite: la carpeta local)
npm run db:seed      # bodega, sucursal, admin, (cajero de prueba), configuración, categorías (idempotente)
npm run db:studio
```

Desarrollo sin Neon: `DATABASE_URL=pglite:./.pglite` (PostgreSQL embebido, `src/db/conexion.ts`).
PGlite no admite dos procesos: **detener `npm run dev` antes de `db:migrate`/`db:seed`**.
Credenciales de prueba locales: en `.env.local` (`SEED_*`), nunca en el código ni en el chat.

## Autenticación y permisos (Fase 1)

- Login: usuario + PIN (4–6 dígitos, bcrypt). El usuario se recuerda por dispositivo (localStorage).
- Sesión: JWT HS256 (`lib/auth/jwt.ts`) en cookie httpOnly `maseta_sesion`, duración `SESION_HORAS`.
- Tres barreras: `src/proxy.ts` (reglas puras en `lib/auth/rutas.ts`) → layouts con
  `requerirSesion(rol)` → cada server action con `autorizar(rol)`. `obtenerSesion()` revalida
  contra la BD (usuario activo, mismo rol y sucursal).
- 5 PIN incorrectos → `bloqueado_hasta` +15 min (login y desbloqueo) + auditoría (`lib/auth/pin.ts`).
- Bloqueo por inactividad (15 min) y al reabrir la app: `components/seguridad/guardia-bloqueo.tsx`
  (capa encima con `inert`; el contenido no se desmonta → el carrito se conserva).
- Auditoría: `registrarAuditoria()` en `lib/auditoria.ts`.
- Admin elige sucursal con "Viendo sucursal" (cookie; `lib/sucursal-vista.ts`); el cajero siempre la suya.

## Reglas no negociables

- **Permisos en el servidor**: `proxy.ts` protege rutas por rol y *además* cada server action /
  route handler verifica sesión y rol. Nunca confiar solo en la interfaz.
- Cajero: una sola sucursal; solo apertura, venta, sus comprobantes del día, consulta de stock,
  gastos, cierre y cerrar sesión. **Nunca** ve costos, reportes globales, configuración ni personal.
- Montos en `NUMERIC(12,2)` (helper `dinero()` en el schema); nunca `float`. Operar con
  `lib/dinero.ts` (centavos en bigint) y mostrar con `formatoBs()` de `lib/formato.ts`.
- Fechas de negocio en hora de Bolivia (`America/La_Paz`), ver `lib/formato.ts`.
- Ventas, gastos y cierres **no se borran**: se anulan con motivo (y queda en `auditoria`).
- Una venta = una transacción (stock + detalle + pago); si algo falla no queda nada a medias.
- Ventas y gastos llevan `uuid_dispositivo` único → idempotencia en la sincronización offline.
- Validación con Zod compartida entre formulario y servidor.
- Secretos solo en variables de entorno (`.env.local` / Vercel). `.env.example` documenta cuáles.
- Imágenes en Vercel Blob; en la BD solo la URL.
- Comprobante público: `token_publico` aleatorio, nunca el número correlativo.

## Modelo de datos (src/db/schema.ts)

- La **bodega central es una fila de `sucursales` con `tipo = 'bodega'`**; `inventario`, `lotes`,
  `movimientos_inventario` y `transferencias` usan `ubicacion_id` → `sucursales.id`.
- `movimientos_inventario.cantidad`: positivo entra, negativo sale.
- `cajas`: índice único parcial → una sola caja abierta por cajero.
- `configuracion`: tabla de una fila (id = 1).

## Estructura

```
src/
  app/(auth)/login
  app/admin/*        12 módulos del administrador (sección 4)
  app/cajero/*       apertura, venta, bodega, gastos, cierre (sección 5)
  app/comprobante/[token]   vista pública
  app/api/sync       recepción de la cola offline
  components/ui      shadcn
  components/barra   selector de tema, recarga, indicador de conexión, campanita
  components/marca   logo, fondo ambiental
  components/panel   tarjetas de estadística, selector de fecha
  components/seguridad  teclado PIN, guardia de bloqueo, cerrar sesión
  components/shell   layout por rol + navegación (navegacion.ts indica la fase de cada módulo)
  db/                schema, index (cliente), seed, migraciones/
  lib/auth           jwt, rutas (reglas por rol), sesion, pin, acciones (login/desbloqueo/logout)
  lib/               auditoria, configuracion, dinero, formato, sucursal-vista, validaciones/, consultas/
  proxy.ts           protección de rutas por rol (Next 16: antes "middleware")
docs/sistema-de-diseno.md
```

## Diseño

Ver `docs/sistema-de-diseno.md` (basado en las referencias del dueño: oscuro con luces difusas,
naranja, menú activo crema, fichas pastel; fuentes Outfit / Nunito / JetBrains Mono). Usar tokens
(`bg-primary`, `bg-nav-activo`, `bg-ficha-verde`, `text-muted-foreground`…), nunca colores sueltos. Montos con la clase `cifras` (tabular-nums).
Todo debe funcionar en celular (375 px) y en modo oscuro.

## Fases (sección 13) — estado

- [x] 0. Preparación (proyecto, BD, diseño base, estructura). Pendiente del dueño: cuentas Neon/Vercel,
      plugins UI/UX Pro Max y 21st.dev, Sentry.
- [x] 1. Autenticación y roles (+ panel de inicio con estadísticas reales, adelantado de la Fase 8)
- [ ] 2. Estructura base · [ ] 3. Inventario · [ ] 4. Caja y ventas
- [ ] 4b. Comprobantes · [ ] 5. Promociones · [ ] 6. Offline · [ ] 7. Alertas y auditoría
- [ ] 8. Reportes · [ ] 9. Pruebas · [ ] 10. Lanzamiento

Entregar cada fase funcional y probada contra los criterios de aceptación (sección 11) antes de seguir.
