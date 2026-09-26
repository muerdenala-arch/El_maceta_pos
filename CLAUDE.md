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

## Patrón de módulos admin (Fase 2)

- `app/admin/<modulo>/page.tsx` (servidor: `requerirSesion("admin")` + consultas) →
  componente cliente → `app/admin/<modulo>/acciones.ts` ("use server").
- Cada acción: `conPermiso(async () => { await autorizar("admin"); safeParse(Zod); ... registrarAuditoria(); refresh(); return exito(); })`.
  Devuelven `Resultado` (`lib/acciones/resultado.ts`): errores por campo con `falloValidacion`,
  únicos de PostgreSQL con `esViolacionUnica(e, "nombre_indice")`.
- **`autorizar()` dentro de cada acción es obligatorio**: en producción Next puede ejecutar una
  acción desde cualquier página; el proxy no alcanza (verificado: un cajero invocando
  `cambiarSucursalVista` recibe "Sin permiso").
- Cliente: `useAccion()` + `Campo` + `DialogoFormulario` + `EncabezadoPagina` (`components/formularios`).
- Imágenes: `SubirImagen` comprime en el dispositivo (`lib/imagen-cliente.ts`) → `subirImagen`
  valida firma real y tamaño → Vercel Blob o `.subidas/` local servida por `/api/archivos/...`.
  En la BD solo URLs validadas por `urlImagen` (`lib/validaciones/comunes.ts`).
- Reglas: no se borran productos ni usuarios (se desactivan); categorías solo si no tienen productos;
  siempre queda ≥1 admin activo; nadie se desactiva ni cambia su propio rol; una sucursal con cajeros
  activos no se desactiva; cambios de precio → auditoría `cambio_precio`.

## Inventario (Fase 3)

- **Todo cambio de stock pasa por `cambiarStock(tx, …)`** (`lib/inventario/stock.ts`), dentro de
  `db.transaction`: suma atómica en `inventario`, lotes FEFO y registro en `movimientos_inventario`.
  Lanza `ErrorStock` si el stock quedaría negativo (salvo `permitirNegativo`: ajustes y, en F6, ventas offline).
- Lotes: entran con su vencimiento; salen primero los que vencen antes (reglas puras y probadas en
  `lib/inventario/lotes.ts`). Las transferencias guardan en `detalle_transferencia.lotes` las fechas que
  viajan, y se recrean en el destino al recibir (o en el origen al cancelar).
- Transferencia: al enviar sale del origen ("en camino"); al recibir entra al destino. Solo admin.
- Ajuste: a una cantidad contada, motivo obligatorio + auditoría `ajuste_stock`.
- Cajero (`/cajero/bodega`): solo lectura de su sucursal + bodega, sin precios; "Pedir" crea una alerta
  `solicitud_reposicion` (mensaje con formato fijo "Solicita N unidades…"), que el admin atiende desde Bodega.
- `/admin/inventario?resaltar=ID` resalta y desplaza hasta el producto (lo usarán las alertas en F7).
- Migraciones con PGlite: detener el servidor de desarrollo antes de `npm run db:migrate`.

## Caja y ventas (Fase 4)

- Cajero sin caja abierta → `requerirCajaAbierta()` lo lleva a `/cajero/apertura` (venta, gastos, cierre).
  Índice único parcial: una sola caja abierta por cajero.
- `registrarVenta` (`app/cajero/acciones.ts`): una transacción que toma **precios de la BD** (nunca del
  cliente), bloquea la fila de la sucursal para el número correlativo, crea/reutiliza el cliente por
  teléfono normalizado y descuenta stock con `cambiarStock`. Idempotente por `uuid` del dispositivo
  (un UUID por intento de cobro; verificado: 3 envíos simultáneos = 1 venta).
- Cálculos puros y probados en `lib/caja/calculos.ts` (totales, cambio, billetes bolivianos 10–200,
  cierre: esperado = inicial + efectivo − gastos; el QR no entra en el efectivo).
- Cierre: inmutable; si hay diferencia crea alerta `caja_diferencia`. Gastos se anulan (admin) solo con la
  caja abierta. El carrito del POS se guarda en localStorage por caja (sobrevive recargas).
- **Con PGlite, no usar `db` dentro de `db.transaction`** (se bloquea): pasar `tx` (ver `totalesCaja`).

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
  lib/               auditoria, almacenamiento, configuracion, dinero, formato, imagen-cliente,
                     sucursal-vista, acciones/, validaciones/, consultas/
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
- [x] 2. Estructura base (sucursales, personal, categorías, catálogo con fotos, configuración) · [ ] 3. Inventario · [ ] 4. Caja y ventas
- [ ] 4b. Comprobantes · [ ] 5. Promociones · [ ] 6. Offline · [ ] 7. Alertas y auditoría
- [ ] 8. Reportes · [ ] 9. Pruebas · [ ] 10. Lanzamiento

Entregar cada fase funcional y probada contra los criterios de aceptación (sección 11) antes de seguir.
