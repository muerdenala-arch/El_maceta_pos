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
- También: @vercel/blob (imágenes), jsPDF (comprobantes), Dexie (base local sin conexión), Playwright (e2e).
  SheetJS (`xlsx` desde cdn.sheetjs.com: la versión de npm está abandonada). Pendiente: Sentry (cuando exista cuenta/DSN).

## Comandos

```
npm run dev          # servidor de desarrollo (http://localhost:3000)
npm run build        # compilación de producción
npm run typecheck    # tsc --noEmit
npm run lint
npm test             # vitest: unitarias + integración (server actions contra PGlite en memoria)
npm run e2e          # compila, crea .pglite-e2e desde cero, levanta next start :3100 y corre Playwright
npm run db:generate  # genera migración SQL desde src/db/schema.ts
npm run db:migrate   # aplica migraciones (Neon: usa DATABASE_URL_DIRECTA; PGlite: la carpeta local)
npm run db:seed      # bodega, sucursal, admin, (cajero de prueba), configuración, categorías (idempotente)
npm run db:studio
```

Desarrollo sin Neon: `DATABASE_URL=pglite:./.pglite` (PostgreSQL embebido, `src/db/conexion.ts`).
PGlite no admite dos procesos: **detener `npm run dev` antes de `db:migrate`/`db:seed`**.
Credenciales de prueba locales: en `.env.local` (`SEED_*`), nunca en el código ni en el chat.

## Autenticación y permisos (Fase 1)

- Login **solo con PIN** (4–6 dígitos, bcrypt; con 6 dígitos entra solo): `buscarUsuarioPorPin` (`lib/auth/pin.ts`) encuentra
  al dueño por `usuarios.pin_huella` (HMAC con JWT_SECRET/PIN_SECRETO, `lib/auth/huella.ts`, índice único) y lo lleva a su
  pantalla por rol. Sin huella (o de otra clave) → bcrypt uno por uno y se guarda. **PIN únicos**: `pinEnUso` en crear usuario y
  restablecer PIN. PIN desconocido → fallo por origen (IP, tabla `intentos_ingreso`): 5 en 15 min → bloqueo 15 min.
- Sesión: JWT HS256 (`lib/auth/jwt.ts`) en cookie httpOnly `maseta_sesion`, duración `SESION_HORAS`.
- Tres barreras: `src/proxy.ts` (reglas puras en `lib/auth/rutas.ts`) → layouts con
  `requerirSesion(rol)` → cada server action con `autorizar(rol)`. `obtenerSesion()` revalida
  contra la BD (usuario activo, mismo rol y sucursal).
- 5 PIN incorrectos en el desbloqueo → `bloqueado_hasta` del usuario +15 min + auditoría (`lib/auth/pin.ts`).
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

## Comprobantes (Fase 4b)

- `lib/comprobante/consulta.ts` arma `DatosComprobante` (por venta o por token); `puedeVerVenta`: admin
  todo, cajero solo sus ventas del día. `registrarVenta` ya devuelve el comprobante.
- `<Comprobante>` (58/80 mm térmica o carta) sirve para pantalla e impresión. `<AccionesComprobante>`:
  imprimir (portal `.zona-impresion` en `<body>` + `@page` inyectado; CSS en globals), PDF con jsPDF en el
  dispositivo (`lib/comprobante/pdf.ts`, carga diferida, logo en JPEG, ~11 KB) y WhatsApp.
- WhatsApp: en celular, Web Share API con el PDF adjunto; si no, `wa.me/<591…>?text=` con la plantilla de
  Configuración y un **enlace a `/comprobante/[token]`** (página pública, token aleatorio de 144 bits) en vez de
  subir el PDF a Blob: siempre actualizado y sin almacenamiento extra.
- Reimpresión: cajero en `/cajero/ventas`; admin en `/admin/reportes` (pestaña Ventas).

## Promociones (Fase 5)

- Motor puro y probado: `lib/promociones/motor.ts` (`aplicarPromociones`). Lo usan el POS (vista previa) y
  `registrarVenta` (cobro real, con las promociones vigentes de la BD).
- Reglas (decididas con el dueño en mente; confirmar si cambian): **no se acumulan** (cada línea recibe la mejor
  promoción, asignación codiciosa por descuento total); **monto fijo = Bs por unidad**; **combo N×M** regala las
  unidades más baratas; el **cupón compite** con las automáticas y solo se consume si realmente gana.
- Vigencia en días de Bolivia: `fechaInicio` = 00:00 del primer día; `fechaFin` **exclusiva** (00:00 del día
  siguiente al último) → `inicioDiaBolivia` / `diaBolivia` en `lib/formato.ts`.
- Alcance: todo / producto / categoría + `sucursalId` opcional ("sucursal" en BD = todo en esa sucursal).
- Cupones: `validarCuponEn(codigo, sucursal, tx, { consumir })` suma el uso con condición atómica (no supera el
  límite con ventas simultáneas). Crear un cupón marca la promoción como "solo con cupón".
- `detalle_venta.promocion_id` y `ventas.cupon_id` quedan registrados; el comprobante muestra el importe bruto de
  cada línea, la promoción y el descuento debajo, y el cupón usado.

## Modo sin conexión (Fase 6)

- **Service worker propio** (`public/sw.js`, sin Serwist: su integración con Turbopack aún es experimental).
  Solo se registra en producción (`components/offline/registro-sw.tsx`; en dev: `NEXT_PUBLIC_SW=1`).
  `/_next/static` y fotos: caché primero. Pantallas `/cajero/*` y `/login`: red primero (4 s) y copia guardada.
  Peticiones RSC: solo red → sin internet Next hace "navegación de navegador" y el SW sirve la copia.
  **No activar `experimental.useOffline`** de Next (reintenta y congela la navegación sin internet).
- Base local Dexie `el-maseta` (`lib/offline/base.ts`): `instantaneas` (copia del POS con stock efectivo),
  `cola` (ventas/gastos pendientes), `ventasLocales` (comprobantes provisionales), `credenciales` (PBKDF2 del PIN).
- Venta sin internet: `lib/offline/venta-local.ts`, mismo UUID que el intento en línea (si la red cae a mitad,
  el servidor devuelve la misma venta al sincronizar). Cupones y fotos de gastos requieren conexión.
- Sincronización: `lib/offline/sincronizar.ts` → `POST /api/sync` (lotes, orden cronológico, idempotente).
  Servidor: `lib/caja/registro.ts` (`registrarVentaOffline`: respeta lo cobrado en el dispositivo, stock
  negativo permitido con alerta `stock_negativo`, QR → `qr_por_confirmar` + alerta, precio/descuento distinto
  a la BD → alerta `revision_offline`). La venta en línea y la offline comparten `insertarVenta`.
- `<Sincronizador>` (layout del cajero): sincroniza al iniciar, al volver la conexión y cada 30 s; precarga
  pantallas, archivos de la app, fotos y el generador de PDF. **Un solo `import()` del PDF**
  (`cargarGeneradorPdf`): Turbopack crea un fragmento por cada sitio de importación.
- Cierre de caja bloqueado con pendientes o sin conexión; cerrar sesión avisa y borra las pantallas guardadas.
- Prueba de extremo a extremo: `e2e/offline.spec.ts` (Playwright, contra `next start`; ver playwright.config.ts).

## Alertas y auditoría (Fase 7)

- Reglas puras en `lib/alertas/reglas.ts` (umbral de stock, 30 días de aviso, destino y módulo de cada tipo).
- `lib/alertas/motor.ts` **concilia** (crea / actualiza mensaje / resuelve): `cambiarStock` llama a
  `conciliarAlertasStock(tx, {producto, ubicación})` en la misma transacción; el layout admin llama a
  `conciliarAlertasSiCorresponde()` (inventario completo + vencimientos, máx. cada 5 min por instancia).
- Automáticas (`stock_bajo`, `agotado`, `por_vencer`, `stock_negativo`) se resuelven solas al corregirse;
  las demás (`caja_diferencia`, `qr_por_confirmar`, `revision_offline`, `solicitud_reposicion`) se marcan
  revisadas (✓, auditoría `alerta_revisada`) o se resuelven con su acción (confirmar QR, anular venta).
- Campanita: `lib/alertas/acciones.ts` (leer al abrir, sondeo 60 s); cada alerta navega a su pantalla
  (`destinoAlerta`) con el elemento resaltado. El menú muestra insignias por módulo (`resumenAlertas`).
- Anular venta (`app/admin/reportes/acciones.ts`, solo admin, motivo obligatorio): estado `anulada`,
  devuelve stock (`cambiarStock` tipo `anulacion`), libera el uso del cupón, auditoría `venta_anulada`.
  Totales, cierres y panel solo cuentan ventas `completada`.
- `/admin/auditoria`: pestaña Cajas (esperado vs. contado; abiertas en vivo) y Acciones sensibles
  (claves en `lib/auditoria-acciones.ts`; no importar constantes de archivos cliente en páginas servidor).
- `useEffect(() => { el.scrollIntoView() })` **con llaves**: en Chrome devuelve una promesa y React la
  tomaría como función de limpieza.

## Reportes (Fase 8)

- Filtros en la URL, puros y probados: `lib/reportes/filtros.ts` (`leerFiltros`/`aParametros`, rangos rápidos,
  tope de 366 días, nunca después de hoy). Sin `sucursal` en la URL se usa "Viendo sucursal"; `sucursal=todas` fuerza todas.
  `<BarraFiltros>` (`components/reportes`) sirve a ventas y gastos, con botones de exportación.
- Consultas: `lib/reportes/ventas.ts` (resumen, por día, por producto, por cajero, lista, líneas) y `gastos.ts`.
  Solo cuentan ventas `completada` y gastos no anulados; las anuladas se listan aparte.
  **Agrupar por día con `ZONA_LITERAL`** (zona como literal): con parámetro, PostgreSQL no empareja SELECT y GROUP BY.
- Ganancia: `detalle_venta.costo_unitario` guarda el costo al vender (subconsulta en `insertarVenta`); ventas
  anteriores se completaron con el costo vigente (migración 0004). Sin costo guardado se usa el actual.
- Exportación: `GET /api/admin/exportar?reporte=ventas|gastos&formato=xlsx|pdf&…` (verifica sesión admin además del
  proxy). Excel (SheetJS, montos numéricos con formato; hojas Resumen/Ventas/Detalle/Productos/Por día/Por cajero)
  y PDF (jsPDF en el servidor, tablas con encabezado repetido, máx. 1500 filas). Lógica en `lib/reportes/documentos.ts`.
- Dashboard: más vendidos, cajas abiertas en vivo (`cajasAbiertas`) y alertas activas (`ESTILO_ALERTA` compartido
  con la campanita en `components/alertas/estilo.ts`).

## Pruebas (Fase 9)

- **Integración** (`src/test/*.integracion.test.ts`, proyecto "integracion" de vitest.config.mts): cada archivo crea
  una base PGlite en memoria con las migraciones reales (`src/test/base.ts`: `prepararBase`, `comoUsuario`, `stock`).
  `src/test/entorno.ts` simula solo lo de Next por petición (cookies, headers, refresh, redirect, connection);
  `server-only` apunta a `src/test/vacio.ts`. Se llaman las server actions y rutas reales.
- `permisos.integracion.test.ts` descubre **todas** las acciones "use server" y las invoca sin sesión y con el rol
  equivocado: una acción nueva sin declarar en `PERMITIDOS` hace fallar la prueba.
- **E2E** (`e2e/`): `preparar-base.ts` crea `.pglite-e2e` desde cero (usuarios con SEED_* de .env.local, 2 productos,
  QR, foto). `criterios.spec.ts` cubre los criterios de la sección 11; `offline.spec.ts`, la venta sin internet.
  Ayudas comunes en `e2e/ayudas.ts` (`desbloquear` confirma el PIN con Enter).
- No usar `page.clock` con la capa de bloqueo (congela la animación de salida): adelantar `Date.now` en la página.
- Lo que depende del equipo real (térmica, WhatsApp con adjunto, modo avión, app instalada): `docs/pruebas-manuales.md`.

## Lanzamiento (Fase 10)

- Paso a paso para el dueño: `docs/lanzamiento.md` (Neon São Paulo, Vercel `gru1`, variables, Blob, puesta en marcha);
  capacitación: `docs/guia-cajero.md`.
- Scripts contra producción: `npm run db:migrate -- --env .env.produccion.local` (y `db:seed`). `src/db/entorno-script.ts`
  carga solo ese archivo e imprime el servidor de destino, nunca la clave. El archivo está excluido por `.env*`.
- Importar catálogo: Catálogo → Importar Excel. Lógica pura y probada en `lib/importacion/productos.ts` (columnas sin
  importar tildes/mayúsculas, montos "280,50", fechas de Excel, errores por fila, solo productos nuevos);
  `importarProductos` revisa sin guardar y con `aplicar=1` crea categorías, productos y stock (lote con vencimiento)
  en una transacción. Plantilla: `GET /api/admin/plantilla-productos` (una columna "Stock <ubicación>" por ubicación).
- Encabezados de seguridad en `next.config.ts` (X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy).
- Velocidad: funciones de Vercel en `cle1` (vercel.json, junto a Neon us-east-2; al pasar la base a São Paulo cambiar a `gru1`);
  `loading.tsx` en admin y cajero (respuesta inmediata + precarga de enlaces del menú); `staleTimes.dynamic = 30`;
  `<RefrescoAutomatico>` hace `router.refresh()` cada 15 s (no con pestaña oculta, sin internet ni con diálogos abiertos).
- **Publicado** (2026-09-28): https://el-maceta-pos.vercel.app (Vercel equipo `dopac`, proyecto `el-maceta-pos`, se publica
  con cada push a `main`). Base: Neon `el_maseta_DB` en **Ohio (us-east-2), de pruebas** por decisión del dueño; la definitiva
  (São Paulo, clave nueva, PIN de admin nuevo) se crea cuando compre el dominio. Integración Neon→Vercel instalada
  (ramas por Preview). Blob `el-maceta-fotos` (iad1) conectado. CLI de Vercel enlazada en `.vercel/` (ignorada).

## Módulo Eventos (post-lanzamiento)

- Menú "Eventos" (solo admin). Tipos de juego en `lib/eventos/tipos.ts` (`reto_transformacion`, `torneo_pulseada`); rutas genéricas
  `/admin/eventos/[tipo]` (lista) y `/admin/eventos/[tipo]/[id]` (detalle con pestañas ?vista=participantes|pesajes|posiciones).
  Agregar un tipo: valor en `tipoJuegoEnum` + migración + entrada en `TIPOS_JUEGO` + su pantalla de detalle.
- Tablas `eventos` (fecha_fin generada = inicio + duración − 1, token_publico), `participantes_evento` (cédula única por
  evento, acepta_participar obligatorio) y `pesajes` (NUMERIC(5,2) 30–300 kg, un solo final por participante).
- Cálculos puros y probados en `lib/eventos/calculos.ts` (centésimas de kg, % con 2 decimales, ranking de competición:
  criterio → desempate por la otra medida → mismo puesto; movimiento vs jornada anterior; finalizado = solo pesaje final).
- Acciones en `app/admin/eventos/acciones.ts` (todas `autorizar("admin")`, evento bloqueado FOR UPDATE, `ErrorEvento` →
  resultado). Estados: borrador → en_curso → finalizado; finalizado bloquea pesajes, inscripciones, bajas y correcciones.
  Cambios > 10 % requieren `confirmarCambios`. Auditoría: evento_*, participante_*, pesajes_registrados, pesaje_corregido.
- Alerta `evento_por_finalizar` (automática) en `lib/eventos/alertas.ts`, conciliada con el resto de alertas.
- Resultados: PDF en el dispositivo (`lib/eventos/pdf.ts`, un solo import dinámico), Excel admin
  `/api/admin/eventos/[id]/excel` (con cédula y teléfono), página pública `/eventos/[token]` (solo nombre, kilos y %;
  `TablaPosiciones publica`). WhatsApp reutiliza `telefonoWhatsapp`/`enlaceWhatsapp` de los comprobantes.
- Colores del podio: tokens `medalla-oro/plata/bronce` en globals.css. `PodioMedallas` y `CompartirResultados`
  (`components/eventos`) son comunes a reto y torneo; el PDF se carga solo con `cargarPdfEventos` (`lib/eventos/cargar-pdf.ts`).

## Torneo de Pulseada (1 contra 1)

- Formatos por torneo: eliminación directa (+3.er lugar), doble eliminación (llave de perdedores, gran final y final de
  desempate si gana el de perdedores) y todos contra todos (puntos por victoria configurables). Categoría libre, peso opcional.
  Combates al mejor de 1/3/5 (por defecto 3); **2 faltas en un asalto = asalto al rival** (lo calcula la mesa del juez).
- Motor puro y probado: `lib/eventos/pulseada.ts`. **El estado se reconstruye siempre** desde `torneos.sorteo` (ids = siembra)
  + la historia en orden (resultados del juez en `combates` con `registrado_por`, por `terminado_en`, y bajas con
  `participantes_evento.dado_de_baja_en`). Pases libres se resuelven solos; el retirado pierde por W.O. lo que le queda.
  `reconstruir` lanza `ErrorTorneo` si un resultado ya no encaja → una corrección se bloquea si el combate siguiente se jugó.
- Claves de combate: `G{ronda}-{i}`, `P{ronda}-{i}`, `GF`, `GF2`, `T3`, `L{fecha}-{k}`. `guardarLlaves` hace upsert por clave.
- Desempates (todos contra todos): resultado entre empatados → diferencia de asaltos → asaltos a favor → menos faltas → mismo puesto.
- Acciones en `app/admin/eventos/torneo-acciones.ts`; datos del servidor en `lib/eventos/torneo-datos.ts`. Sorteo al azar
  (crypto), se puede volver a sortear mientras no haya resultados; sin inscripciones después del sorteo. Las acciones del
  reto rechazan torneos. Auditoría: torneo_sorteado, combate_registrado, combate_corregido (grave).
- Pantalla `[id]/torneo/*`: Competidores, Combates (mesa del juez), Llaves/Fechas, Clasificación/Resultados.
  `Llaves` y `ClasificacionTorneo` (`components/eventos`) sirven también a la página pública (solo nombres y marcadores).
  Excel: hojas Clasificación, Combates y Competidores. Prueba e2e: `e2e/pulseada.spec.ts`.

## Botón atrás por niveles

- `lib/navegacion/niveles.ts` (`padreDe`, probado): apartados del menú → inicio del rol; pantallas internas → un nivel arriba.
  `<NavegacionPorNiveles>` (en el Shell) corrige el `popstate` hacia el padre (ignora el popstate repetido sin cambio de ruta).
- **Pestañas, filtros, fechas y paginación usan `replace`** (no suman pasos); el menú usa `replace` salvo desde el inicio.
  Todo control nuevo que solo cambie `?parámetros` debe usar `router.replace` / `<Link replace>`. Prueba: `e2e/navegacion.spec.ts`.

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
- [x] 2. Estructura base (sucursales, personal, categorías, catálogo con fotos, configuración) · [x] 3. Inventario · [x] 4. Caja y ventas
- [x] 4b. Comprobantes (impresión 58/80/carta, PDF en el dispositivo, WhatsApp, reimpresión, página pública) · [x] 5. Promociones (porcentaje, Bs por unidad, combos NxM, cupones con límite, vigencia, alcance) · [x] 6. Offline (PWA instalable, ventas y gastos sin internet, sincronización idempotente, PIN local) · [x] 7. Alertas y auditoría (campanita conciliada, insignias, anular venta, confirmar QR, auditoría de cajas y acciones sensibles)
- [x] 8. Reportes (filtros por fecha/sucursal/cajero/método/producto, Excel y PDF, ganancia, dashboard ampliado, gastos por rango) · [x] 9. Pruebas (26 de integración con BD real en memoria, barrido de permisos de las 41 acciones, 10 e2e de criterios de aceptación, checklist manual) · [ ] 10. Lanzamiento (publicado en Vercel con base de pruebas; falta: base definitiva + dominio, carga de productos reales, capacitación)

Entregar cada fase funcional y probada contra los criterios de aceptación (sección 11) antes de seguir.
