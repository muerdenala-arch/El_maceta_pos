@AGENTS.md

# El Maseta — Sistema de gestión de suplementos

PWA (celular y PC) para vender suplementos en varias sucursales con bodega central, roles
**Administrador**, **Encargado** de sucursal y **Cajero**, comprobantes (impresión 58/80 mm/carta, PDF, WhatsApp) y ventas
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
npm run db:importar -- planilla.xlsx [--aplicar] [--env archivo]   # catálogo por comando (sin --aplicar solo revisa)
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
- (Cupones: ver "Cupones y descuentos" más abajo; lo que sigue vale para los descuentos automáticos.)
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
  El guardado está en `lib/importacion/aplicar.ts` (lo comparten la pantalla y `npm run db:importar`). El comando corre con
  `src/db/ejecutar.mjs` (carga los módulos de la app con Vite: `@/…`, `server-only`, conexión con await), se detiene si una
  columna "Stock …" no coincide con una ubicación y audita a nombre del primer admin activo. `productos.descripcion`
  (texto opcional, 2000) se edita en Catálogo y se importa con la columna "Descripción".
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

## Venta fraccionada (frasco completo o unidades sueltas)

- `productos.fraccionado` + `unidad_fraccion` (capsula|tableta|scoop|sobre) + `unidades_por_envase` + `precio_unidad` (migración 0009,
  solo aditiva: por defecto nadie es fraccionado). Reglas puras y probadas en `lib/inventario/fraccion.ts`.
- **El stock de un producto fraccionado se guarda siempre en la unidad suelta** (inventario, lotes, movimientos, transferencias).
  Se muestra como "3 frascos + 45 cápsulas (405 cápsulas en total)" con `textoStock` / `<CantidadStock>`.
- Decisiones del dueño: al activar el fraccionado el stock se convierte (× unidades por envase) en la misma transacción
  (`convertirStockPorFraccion`; bloqueado con transferencias en camino; para quitarlo hay que tener envases completos);
  se valida **por total de unidades** (un envase descuenta todas las suyas); ingresos, transferencias y solicitudes se escriben
  en **envases completos** (el servidor multiplica); el ajuste cuenta envases + sueltas; **stock mínimo en envases**
  (`minimoEnUnidades`, también en las alertas).
- Venta: cada línea lleva `fraccion` (suelta) o no (envase); un producto puede ir de las dos formas en la misma venta.
  Precio de la BD (`precio_unidad` o `precio_venta`), `detalle_venta.fraccion` + `unidad_fraccion`, costo proporcional
  redondeado al centavo. **Las unidades sueltas no reciben promociones** (`aplicaA`). Anular devuelve las unidades que salieron.
  Offline igual: la línea viaja con `fraccion` y la copia local descuenta en unidades (`unidadesPedidas`).
- Punto de venta: tocar un producto fraccionado abre `DialogoFraccion` (frasco completo / por cápsulas + cantidad); el código de
  barras escaneado agrega el envase. Comprobante y PDF: "30 cápsulas x Bs 1,50" (`cantidadLinea`).
- Reportes: `unidades` = envases, `sueltas` + `netoSueltas` aparte (tabla de productos, Excel con columnas al final, PDF, dashboard).
- Límite conocido: el historial de movimientos muestra la cantidad cruda (en unidades sueltas desde que el producto es fraccionado).
- Pruebas: `fraccion.test.ts`, `test/fraccionada.integracion.test.ts`, `e2e/revision-fraccionada.spec.ts`.

## Combos de productos

- Menú "Combos" (solo admin): `app/admin/combos` (lista con buscador, activar/desactivar, formulario con buscador de productos,
  cantidades —también por unidades sueltas si el producto es fraccionado—, descuento % o Bs y cálculo en vivo; avisa si el precio
  final queda bajo el costo). Los combos no se borran. No confundir con la promoción "combo NxM" (2x1) de Promociones.
- Tablas `combos`, `combo_items` y `ventas_combos` + `detalle_venta.venta_combo_id` (migración 0010). Vigencia opcional en días de
  Bolivia, **ambas fechas inclusivas** (`date`, no timestamp).
- **El precio no se guarda: se calcula siempre** con los precios vigentes de sus productos. Reglas puras y probadas en
  `lib/combos/calculo.ts` (`precioCombo`, `repartirDescuento`, `combosDisponibles`, `cotizar`). `cotizar` es el mismo cálculo en el
  punto de venta (vista previa y venta sin conexión) y en el servidor (`cotizarCombos` en `lib/combos/consultas.ts`, que antes valida
  que el combo esté vigente y sus productos activos).
- Venta: el combo se guarda como una fila en `ventas_combos` (nombre y precios al vender) y **una línea de `detalle_venta` por
  producto**, con el descuento del combo repartido al centavo → stock, anulación, costos y reportes por producto funcionan sin
  cambios. `esquemaVenta.combos = [{comboId, cantidad}]`; el carrito puede ser solo combos.
- **Promociones y cupones no tocan las líneas de un combo** (solo los productos sueltos). Si falta stock de un producto, el combo
  sale "No disponible" en el punto de venta y el servidor rechaza la venta completa.
- Comprobante: `lineasImprimibles(venta)` (`lib/comprobante/datos.ts`) agrega cada combo como una línea con el detalle de sus
  productos y "Descuento del combo"; lo usan pantalla, impresión y PDF.
- Sin conexión: la copia local (`Instantanea.combos`) y la venta en cola llevan `combos` + líneas con `combo` = su posición; al
  sincronizar se compara con lo que cobraría la BD (alerta `revision_offline` si difiere).
- Pruebas: `combos/calculo.test.ts`, `comprobante/combos.test.ts`, `test/combos.integracion.test.ts`, `e2e/revision-combos.spec.ts`.
- **Ojo al parchear con scripts**: un `` dentro de una cadena normal de Python es un carácter de retroceso invisible (pasó en una
  expresión regular); usar cadenas crudas o revisar caracteres de control.

## Cupones y descuentos (reemplaza las reglas de cupones de la Fase 5)

- **Promociones = descuentos automáticos** (sin código; entre sí no se acumulan, como antes). **Cupones = entidad propia**
  (`cupones`, migración 0011): código (escrito o generado), `tipo` porcentaje | monto, `monto_minimo`, vigencia opcional
  (fechas inclusivas en días de Bolivia), `usos_maximos`, `alcance` todo | productos | categorias (`producto_ids`/`categoria_ids`),
  `sucursal_ids` (vacío = todas), `acumula_promociones`, `acumula_combos`, `activo`. Ya no cuelgan de una promoción
  (`promocion_id` solo en los antiguos; `promociones.requiere_cupon` quedó sin uso en la interfaz).
- Decisiones del dueño: **monto fijo = Bs una sola vez** repartidos entre lo que cubre; **no acumulable = en cada producto queda
  el mayor** (cupón o automático), nunca los dos, y si no mejora nada no se gasta; **descuento manual = % sobre el total que
  queda**, sumado a lo demás; **sin límite por cliente**.
- Cálculo único, puro y probado: `calcularVenta` (`lib/promociones/venta.ts`) = promociones (motor.ts) + combos + cupón +
  descuento manual. Lo usan el diálogo de cobro (vista previa) y el servidor (cobro real). El mínimo de compra se mide sobre
  el total antes del cupón. Estados del cupón en el carrito: `aplicado`, `sin_efecto`, `no_aplica`, `minimo`.
- Lo que no depende del carrito (existe, activo, vigente, usos, sucursal) lo valida `buscarCupon` (`lib/promociones/consultas.ts`)
  con el motivo exacto (`motivoNoUsable` en `lib/promociones/cupones.ts`); `consumirCupon` gasta el uso de forma atómica.
  `consultarCupon` (cajero) no gasta. El servidor rechaza la venta si el cupón queda en `minimo` / `no_aplica`.
- Descuento manual del cajero: máximo en `configuracion.descuento_manual_maximo` (% ; 0 = apagado, valor por defecto), motivo
  obligatorio, auditoría `descuento_manual` (acción sensible). Viaja también en la venta sin conexión (la copia local trae el
  máximo); si al sincronizar supera el máximo → alerta `revision_offline`. Los cupones siguen necesitando conexión.
- Dónde queda guardado: `ventas.descuento_promociones | _combos | _cupon | _manual` (suman `descuento`) +
  `porcentaje_descuento_manual` + `motivo_descuento_manual`; `detalle_venta.descuento` = todo lo descontado en la línea, con
  `descuento_cupon` y `descuento_manual` aparte (**el neto de las líneas siempre suma el total de la venta**).
- Comprobante: en cada línea solo su promoción; en el pie `filasDescuento()` (Promociones, Combos, Cupón CÓDIGO, Descuento (5 %)).
- Pantallas: Promociones con pestañas "Descuentos automáticos" / "Cupones" (`lista-cupones.tsx`: buscador, estado
  activo/vencido/agotado/programado/inactivo, usos); Configuración → máximo del cajero; Reportes → pestaña "Descuentos"
  (`reporteDescuentos`: por tipo, por cupón, por promoción y lista de descuentos manuales).
- Pruebas: `promociones/venta.test.ts`, `promociones/cupones.test.ts`, `test/cupones.integracion.test.ts`, `e2e/revision-cupones.spec.ts`.

## Buscador único

- **Toda lista o tabla nueva usa `<Buscador>`** (`components/busqueda/buscador.tsx`): filtra al escribir (espera de 200 ms, sin
  Enter), ✕ y Esc limpian. Se pinta con `<Resaltar texto consulta>` y, sin resultados, `<SinResultados consulta onLimpiar>`.
- Reglas puras y probadas en `lib/busqueda.ts`: `coincide(consulta, campos)` (sin mayúsculas ni tildes; todas las palabras,
  en cualquier campo) y `tramos()` para resaltar sobre el texto original.
- Listas en memoria: estado local + `coincide`. Listas paginadas en el servidor (Reportes → Ventas, Auditoría → Acciones,
  Historial de movimientos): la consulta va en la URL (`useBusquedaUrl("q")`, con `replace`) y se filtra con
  `condicionBusqueda(consulta, columnas)` de `lib/busqueda-sql.ts` (mismas reglas con `translate`, sin extensión `unaccent`).
- Punto de venta: filtra sobre los productos ya cargados (también sin internet); `onEnter` agrega el código exacto o el único resultado.
- Pruebas: `lib/busqueda.test.ts`, `test/busqueda.integracion.test.ts`, `e2e/revision-buscador.spec.ts` (corre después de criterios).

## Nombres largos (marquesina)

- `<Marquesina>` (`components/texto/marquesina.tsx`) en vez de `truncate` / `line-clamp` para nombres de producto: mide si
  el texto se desborda (ResizeObserver); si entra, queda quieto; si no, se desplaza a 40 px/s con 1,5 s de pausa en cada
  extremo (Web Animations API, ida y vuelta). `siempre` = se mueve solo (tarjetas del punto de venta); si no, al pasar el
  mouse por el ancestro con `data-desplazar` (fila o tarjeta); en pantallas táctiles siempre se mueve solo.
- Degradado de los bordes con `mask-image` (clase `.marquesina` en globals.css): no depende del color de fondo ni del tema.
- "Reducir movimiento": no anima y muestra dos líneas (`motion-reduce:line-clamp-2`).
- Usado en: tarjetas y carrito del punto de venta, Catálogo, Inventario, Bodega (stock y vencimientos) y campanita.
  Prueba: `e2e/revision-marquesina.spec.ts`.

## Llegar desde una alerta (resaltado)

- `destinoAlerta` (`lib/alertas/reglas.ts`): stock bajo/agotado/negativo → `/admin/bodega?resaltar=ID` si la alerta es de la
  bodega (`enBodega`), o `/admin/inventario?resaltar=ID&sucursal=ID` si es de una sucursal. Siempre por parámetro en la URL
  (funciona al recargar). La campanita marca la alerta como leída y emite `EVENTO_RESALTAR`.
- `useResaltado(id)` (`components/alertas/use-resaltado.ts`): desplaza hasta la fila, la deja con la clase `fila-resaltada`
  (parpadeo ámbar ×5 + borde, en globals.css; con "reducir movimiento" solo resaltada) hasta un clic en otro lugar, y da una
  `clave` que cambia en cada llegada: la pantalla la usa para **quitar filtros/búsqueda** que oculten la fila y como `key`
  para reiniciar el parpadeo. En tablas, el parpadeo también va en los `<td>` (la celda fija tiene fondo propio).
- La cantidad que motivó la alerta lleva `data-en-alerta` y va en rojo. Usado en Inventario, Bodega (stock y vencimientos)
  y Auditoría → Cajas. Pruebas: `test/campanita.integracion.test.ts`, `e2e/revision-campanita.spec.ts`.

## Rol Encargado (encargado de sucursal)

- Tercer rol (`rolEnum`, `Rol` en `lib/auth/constantes.ts`; `ROLES_CAJA = cajero + encargado`, `NOMBRES_ROL`). Siempre con una
  sucursal. Lo crea el administrador desde Personal. Entra directo a `/cajero/venta` (el panel de inicio se quitó a pedido del dueño).
- Rutas (`lib/auth/rutas.ts`): `/admin` y `/api/admin` solo admin; `/encargado` y `/api/encargado` solo encargado; `/cajero`,
  `/api/cajero` y `/api/sync` cajero **y** encargado (opera una caja igual que un cajero: `autorizar(...ROLES_CAJA)`).
- Pantallas `/encargado/*` (panel, reportes, gastos, transferencias, cajas): todas empiezan con `requerirEncargado()`
  (`lib/encargado.ts`) y consultan con **su** `sucursal.id`, nunca con uno de la URL (`?sucursal=` se ignora). Reutilizan los
  componentes del admin con `sucursalFija` (BarraFiltros), `sinCostos` (productos; los costos se ponen en "0" antes de pasar
  al cliente), `soloLectura` (gastos) y `listarCajasAuditadas` (`lib/caja/auditadas.ts`). Sin costos, ganancia ni exportación.
- Inventario del encargado = `/cajero/bodega` (stock de su sucursal + bodega, "Pedir" reposición), con `?resaltar=ID`.
- Campanita: solo `TIPOS_ENCARGADO` (stock) de su sucursal, con su propio leído (`alertas.leida_encargado`) y destino
  `/cajero/bodega?resaltar=ID`. `listarAlertasPendientes(limite, sesion)` / `resumenAlertas(sesion)` filtran según la sesión.
- Transferencias: `recibirTransferencia` admite al encargado solo si el destino es su sucursal (otra → "no existe"); cancelar, solo admin.
- **Autorización con PIN** en la pantalla de quien vende (`pedirAutorizacion`, `lib/auth/autorizacion-acciones.ts` +
  `<DialogoAutorizacion>`): vale el PIN del encargado de esa sucursal o de un administrador; devuelve un permiso firmado de 10 min
  (`lib/auth/autorizacion.ts`, misma clave JWT, otra audiencia) atado a quien lo pidió, la sucursal, el propósito y la referencia
  (UUID del cobro + porcentaje, o id de la venta). 5 PIN incorrectos → 15 min sin autorizaciones para ese usuario
  (`intentos_ingreso`, origen `autorizacion:<uid>`), auditoría `autorizacion_fallida`. Requiere conexión.
- Descuento manual (decidido con el dueño): dos máximos en Configuración (`descuento_manual_maximo` del cajero y
  `descuento_manual_maximo_encargado`). `limitesDescuento`/`nivelDescuento` (`lib/caja/descuento-manual.ts`, probado): quien vende da
  hasta su máximo sin PIN; por encima, PIN del encargado (hasta el máximo del encargado) o de un administrador (cualquier %).
  `ventas.descuento_autorizado_por` + auditoría `descuento_manual` con `autorizadoPor`. Sin conexión solo vale el máximo propio.
- Anulación en sucursal (`anularVentaEnSucursal`, `app/cajero/ventas/acciones.ts`; núcleo común `anularVentaConStock` en
  `lib/caja/anulacion.ts`): **solo con la caja de la venta aún abierta** (después, solo el admin); el encargado anula cualquier
  venta de su sucursal; el cajero, solo las suyas y con PIN. Auditoría `venta_anulada` con `rol` y `autorizadoPor`.
- Pruebas: `encargado.integracion.test.ts`, el barrido de permisos (lista exacta de acciones del encargado), `rutas.test.ts` y
  `e2e/revision-encargado.spec.ts` (usuario `SEED_ENCARGADO_*` de .env.local).

## Apartados compartidos con el encargado y candados

- Pedido del dueño (después del rol Encargado): el encargado también entra a **Catálogo, Inventario de sucursales, Bodega central,
  Promociones y cupones, Combos, Eventos, QR de cobro, Sucursales, Auditoría de caja y Configuración** (`MODULOS_ENCARGADO`,
  `lib/auth/modulos.ts`). Siguen siendo solo del administrador: Inicio, Reportes y Gastos del admin, Personal, exportaciones y candados.
- **Candado por apartado, igual para todos los encargados** (`configuracion.encargado_modulos_abiertos`, migración 0013; vacío =
  todos cerrados, que es el valor por defecto). Cerrado = el encargado ve pero no cambia nada; abierto = trabaja en él. El
  administrador lo cambia con el candado de cada apartado en su menú (`<BotonCandado>` → `cambiarCandado`, auditoría
  `candado_encargado`). Auditoría no tiene candado (solo consulta; el encargado ve solo la pestaña Cajas de su sucursal).
- Servidor (`lib/auth/modulo-servidor.ts`): páginas con `requerirModulo(m)` → `{ encargado, soloLectura, sucursalId }`; acciones con
  `autorizarModulo(m)` (lanza `ErrorCandado` → "Este apartado tiene candado…"), `autorizarUbicacion(id)` para el stock
  (su sucursal = Inventario, bodega = Bodega, otra sucursal = sin permiso) y `exigirSuSucursal`. **Toda acción nueva de uno de
  estos apartados usa `autorizarModulo`, no `autorizar("admin")`**.
- Límites del encargado aunque el candado esté abierto (decididos con el dueño: solo su sucursal y sin costos):
  catálogo sin costo ni margen (no viajan al navegador; el servidor conserva el costo, 0 en productos nuevos) y sin importar
  Excel; inventario y movimientos de su sucursal + bodega; transferencias solo bodega → su sucursal (cancela y atiende
  solicitudes solo las suyas); QR solo de su sucursal (los "para todas" los ve, no los cambia); Sucursales: edita la suya,
  no crea ni desactiva; Configuración sin los máximos de descuento; combos sin aviso de costo.
- Interfaz: la página envuelve su contenido en `<ZonaModulo soloLectura>` (`components/permisos/zona-modulo.tsx`): aviso arriba,
  `EncabezadoPagina` oculta sus botones (crear/guardar), `DialogoFormulario` muestra los datos deshabilitados sin Guardar y
  `useAccion` no envía nada. El menú del encargado suma `navEncargadoCompartido` con un candadito en los cerrados.
- `/admin/layout.tsx` admite admin y encargado; `rutas.ts` deja pasar al encargado solo a `moduloDeRuta(ruta) !== null`
  (y al Excel de eventos). Pruebas: `modulos.test.ts`, `rutas.test.ts`, `test/candados.integracion.test.ts`,
  `e2e/revision-encargado.spec.ts`.

## Mejoras pedidas después del rol Encargado

- **Encargado sin "Inicio"**: `inicioSegunRol("encargado")` = `/cajero/venta` (no existe `/encargado/panel`). Su menú: venta,
  reportes, gastos, stock, transferencias, registrar gasto, cierre + los apartados compartidos con candado.
- **Ingreso automático** (`app/(auth)/login/formulario-login.tsx`): con 6 dígitos entra al instante; con 4 o 5 prueba solo tras
  450 ms sin teclear (`iniciarSesion({ pin, automatico: true })`, sin mostrar error si falla). Para que escribir un PIN largo no
  gaste intentos, `registrarFalloOrigen(origen, pin)` guarda huella y largo del último PIN fallido (`intentos_ingreso.ultima_huella`,
  `ultimo_largo`): si el nuevo empieza con el anterior y llega en menos de 30 s, es el mismo intento. PIN distintos sí suman
  (5 → bloqueo). Las pruebas automáticas no registran `login_fallido` en auditoría.
- **Gastos sin caja**: `gastos.caja_id` es opcional. `agregarGasto` (`app/admin/gastos/acciones.ts`; admin en cualquier ubicación
  activa, encargado solo en su sucursal; auditoría `gasto_registrado`) crea un gasto que cuenta en reportes pero **no** en el
  efectivo esperado de ninguna caja (`totalesCaja` filtra por caja). Botón `<AgregarGasto>` en Gastos diarios (admin) y Gastos de
  la sucursal (encargado). Se marcan "Sin caja"; los anula el administrador en cualquier momento. Toda consulta que una
  `gastos` con `cajas` debe usar `leftJoin`.
- **Sueldos** (`/admin/sueldos?mes=AAAA-MM`, solo administrador): `usuarios.sueldo_mensual` (vigente), `sueldos_mes` (sueldo
  fijado de una persona en un mes: se crea al primer movimiento o al editar el sueldo viendo ese mes) y `movimientos_sueldo`
  (adelanto | descuento | bono | pago; se anulan con motivo, no se borran). Reglas puras y probadas en `lib/sueldos/calculo.ts`:
  a pagar = sueldo + bonos − descuentos; saldo = a pagar − adelantos − pagos. Hasta el mes siguiente al actual. No cuentan como
  gasto en los reportes (decisión del dueño). Auditoría: `sueldo_editado`, `sueldo_movimiento`, `sueldo_movimiento_anulado`.
- **Notificaciones en el celular (Web Push)**: claves `NEXT_PUBLIC_VAPID_PUBLICA` / `VAPID_PRIVADA` (+ `VAPID_CONTACTO`); sin ellas
  todo queda apagado. El usuario las activa por dispositivo desde el pie de la campanita (`<ActivarNotificaciones>`,
  `lib/notificaciones/cliente.ts` → tabla `suscripciones_push`); al cerrar sesión se desactivan en ese equipo. Reciben: el
  administrador todas las alertas; el encargado las de stock de su sucursal. `despacharAlertas()` (`lib/notificaciones/despacho.ts`)
  toma las alertas con `notificada = false` (las marca primero: no se envían dos veces), más de 3 a la vez se resumen en una, y
  borra las suscripciones vencidas (404/410). Se dispara con `programarDespacho()` (usa `after()`) al terminar cualquier acción
  (`conPermiso`), en `/api/sync` y al conciliar alertas. El service worker (`public/sw.js`) muestra la notificación y al tocarla
  abre la pantalla de esa alerta. En iPhone/iPad solo funciona con la app instalada en la pantalla de inicio (iOS 16.4+).
- Pruebas: `test/mejoras.integracion.test.ts` (envío simulado con `vi.mock("web-push")`), `sueldos/calculo.test.ts`,
  `e2e/revision-mejoras.spec.ts`. El envío real a un teléfono solo se prueba a mano (`docs/pruebas-manuales.md`).

## Ajustes posteriores (pedidos por el dueño al usar la app)

- **Candado cerrado = el apartado no existe para el encargado** (antes era "solo lectura"): no sale en su menú
  (`navEncargadoCompartido` filtrado por `candados`) y `requerirModulo` lo redirige a su inicio. Abierto = le aparece y trabaja
  en él. Todos los apartados compartidos tienen candado, también Auditoría (al abrirse, solo las cajas de su sucursal).
  El modo solo lectura (`ZonaModulo soloLectura`, `SoloEdicion`, `DialogoFormulario`, `useAccion`) quedó sin uso pero funcional.
- **Pantallas de PIN sin botón** (`TecladoPin sinBoton`): ni "Ingresar" ni "Desbloquear". Al volver a la app
  (`guardia-bloqueo.tsx`) se ve igual que el ingreso, sin "Sesión bloqueada"; la capa sigue encima del contenido (el carrito no
  se pierde). El PIN se prueba solo: se compara sin gastar intentos con el verificador local (`coincidePinLocal`,
  `lib/offline/pin-local.ts`) y al coincidir se desbloquea; si no coincide se envía al servidor al llegar a 6 dígitos (0,5 s) o
  tras 1,6 s sin teclear. Enter sigue funcionando.
- **Inventario**: tocar la fila de un producto abre directo `DialogoAjuste` con ese producto y la sucursal que se está viendo
  (o la única columna de venta); tocar una cantidad abre el ajuste de esa ubicación.
- **Sueldos por trabajador** (migraciones 0015 y 0016): tabla `empleados` (nombre, cargo, sucursal, `usuario_id` opcional,
  `fecha_ingreso`, `sueldo_mensual`, `fecha_baja`, `motivo_baja`) + `eventos_empleado` (ingreso | baja | reincorporacion, con fecha,
  motivo y quién lo registró). `sueldos_mes` y `movimientos_sueldo` cuelgan de `empleado_id`. Todo usuario del sistema es un
  trabajador (`asegurarEmpleados()` agrega los que falten al abrir la pantalla); también se crean trabajadores sin usuario.
  "Cumple su mes" = mismo día del mes de su ingreso (`proximoPago`, puro y probado; último día si el mes es más corto).
  Baja (`darDeBajaTrabajador`): fecha no futura ni anterior al ingreso, motivo obligatorio, queda en el historial, sale de la
  planilla de los meses siguientes ("Ver dados de baja" los muestra) y **desactiva su usuario** con las reglas de Personal
  (por eso nadie se da de baja a sí mismo ni al último administrador). `reincorporarTrabajador` quita la baja y reinicia su
  fecha de ingreso; el usuario se reactiva a mano en Personal.
- **Migraciones con columnas renombradas**: `drizzle-kit generate` pregunta de forma interactiva y aquí no hay terminal. Se
  hace en dos pasos: primero una migración que solo agrega (dejando las columnas viejas en el schema, y con el traspaso de datos
  escrito a mano), luego otra que solo quita.

## Encargado = administrador con candados (versión vigente; reemplaza lo anterior sobre el encargado)

- Decisión del dueño: **el encargado no vende** y **tiene exactamente los mismos apartados que el administrador** (los 15 del
  menú: Inicio, Reportes, Gastos, Catálogo, Inventario, Bodega, Promociones (con cupones y combos), Eventos, Personal, Sueldos, Recordatorios, QR, Sucursales,
  Auditoría, Configuración = `MODULOS_ENCARGADO` en `lib/auth/modulos.ts`). Cada uno tiene un **candado** en el menú del
  administrador: cerrado (por defecto) = no le aparece y no abre ni por la dirección; abierto = le aparece y **trabaja igual que
  el administrador** (todas las sucursales, costos, exportaciones, Personal completo). Solo el administrador maneja candados.
- `rutas.ts`: `/admin` y `/api/admin` para admin y encargado (cada página/acción/ruta exige su candado); `/cajero` solo cajero
  (`ROLES_CAJA = ["cajero"]`). Entrada del encargado: `/admin/inicio` → `primerApartado(abiertos)` o aviso "Todavía no tienes
  apartados". Páginas: `requerirModulo(m)`; acciones: `autorizarModulo(m)` (`ErrorCandado`); stock: `autorizarUbicacion`
  (bodega → Bodega, sucursal → Inventario); exportar / plantilla / Excel de eventos revisan el candado del encargado.
- Ya no existen `/encargado/*`, `lib/encargado.ts`, `navEncargado*`, ni las restricciones "solo su sucursal / sin costos".
  Campanita, notificaciones y "Viendo sucursal": el encargado igual que el administrador.
- Lo que conserva del rol: su sucursal y su PIN para **autorizar** en la pantalla del cajero de su sucursal descuentos mayores
  al máximo del cajero (hasta `descuento_manual_maximo_encargado`) y anulaciones con la caja abierta (`pedirAutorizacion`).
- Pruebas: `modulos.test.ts`, `rutas.test.ts`, `test/candados.integracion.test.ts`, `test/encargado.integracion.test.ts`
  (PIN en la caja), `e2e/revision-encargado.spec.ts`.

## Elegir productos y categorías (lista con buscador)

- `<ListaSeleccion>` (`components/busqueda/lista-seleccion.tsx`): lista siempre a la vista con buscador; se filtra al escribir y
  cada toque marca o desmarca **sin borrar lo escrito** (se sigue eligiendo); al lado del nombre, gris, la categoría. `unica` =
  elegir uno. Usada en combos (productos), cupones (productos y categorías) y promociones (producto o categoría).
  `ProductoInventario.categoria` trae el nombre de la categoría.

## Combos dentro de Promociones, varios productos por descuento, cámara, tablet y Recordatorios

- **Combos = tercera pestaña de "Promociones y cupones"** (`/admin/promociones?vista=combos`; `lista-combos.tsx` y
  `combos-acciones.ts` viven en `app/admin/promociones/`). Ya no hay apartado ni candado "combos": usan
  `autorizarModulo("promociones")`. `/admin/combos` redirige a la pestaña. El menú queda con 15 apartados (sale Combos, entra Recordatorios).
- **Descuentos automáticos con varios productos o categorías**: `promociones.producto_ids` / `categoria_ids` (migración 0017, con
  traspaso de las columnas antiguas `producto_id` / `categoria_id`, que quedan sin uso y se guardan en null). `aplicaA` (motor.ts)
  acepta las dos formas (las copias sin conexión viejas traen `productoId`). Formulario con `ListaSeleccion` múltiple + fichas
  `Elegidos` que se quitan con un toque.
- **Los diálogos nunca son más anchos que la pantalla**: `DialogoFormulario` usa `grid-cols-[minmax(0,1fr)]` + `min-w-0` (antes un
  nombre largo sin corte empujaba el formulario fuera de la tablet) y `ListaSeleccion` parte los nombres largos (`break-words`).
  Contenido nuevo dentro de un diálogo: `min-w-0` y nada de `whitespace-nowrap` sin `truncate`.
- **"Tomar foto"** en `SubirImagen` (un segundo `<input capture="environment" data-camara>`): sirve en todos los lugares donde se
  sube una imagen (productos, QR, logo, gastos). En una PC abre el selector de archivos.
- **Recordatorios** (`/admin/recordatorios`, apartado `recordatorios` con candado): notas personales de quien las crea (cada uno
  ve solo las suyas; no van a auditoría y sí se pueden borrar) con día, hora (Bolivia) y repetición ninguna | diaria | semanal |
  mensual. Tabla `recordatorios` (`proxima_en` = próximo aviso; null = ya avisado y no se repite; `dispositivos` = a cuántos
  equipos llegó el último). Reglas puras y probadas en `lib/recordatorios/calculo.ts` (`proximoAviso`: no acumula los saltados;
  mensual = mismo día, último día en meses cortos).
- Envío: `despacharRecordatorios()` (`lib/recordatorios/despacho.ts`) toma cada recordatorio vencido con un UPDATE condicionado a
  su `proxima_en` (varios disparadores a la vez = un solo aviso) y lo envía a los equipos de su dueño; con más de 15 min de
  retraso el aviso dice para cuándo era. Lo común del envío está en `lib/notificaciones/envio.ts`. `despacharTodo()` (alertas +
  recordatorios) se dispara: al terminar cualquier acción (`programarDespacho`), con `GET /api/recordatorios/despachar`
  (público, sin datos, idempotente) que llama `<PulsoAvisos>` cada minuto desde cualquier app abierta (admin o cajero), y
  **cuando el dueño pase a Vercel Pro** con un cron por minuto en `vercel.json`
  (`"crons": [{ "path": "/api/recordatorios/despachar", "schedule": "* * * * *" }]`; en el plan Hobby ese cron hace fallar la
  publicación). Hasta entonces, con la app cerrada en todos los equipos el aviso sale apenas alguien la abre.
- Pruebas: `recordatorios/calculo.test.ts`, `test/recordatorios.integracion.test.ts`, `e2e/revision-recordatorios.spec.ts`.

## Auditoría del sistema (2026-10-03): reglas que salieron de ella

- **Una caja abierta nunca queda sin nadie que la cierre**: `editarUsuario` no cambia rol ni sucursal de quien tiene una caja
  abierta; `cerrarCajaPendiente` (`app/admin/auditoria/acciones.ts`, apartado Auditoría, motivo obligatorio, auditoría
  `caja_cerrada_admin` grave) la cierra desde Auditoría → Cajas (botón "Cerrar caja" en las abiertas). El cálculo del cierre es
  uno solo: `cerrarCajaAbierta` (`lib/caja/cierre.ts`), compartido con el cierre del cajero.
- `listarCajasAuditadas` muestra **siempre las cajas abiertas** (primero), aunque se hayan abierto fuera del rango de fechas.
- Una sucursal no se desactiva con una caja abierta ni con una transferencia en camino (además de la regla de usuarios activos).
- Una categoría no se elimina si la usa un descuento automático o un cupón (`categoria_ids` no tiene llave foránea).
- Editar un recordatorio que se repite conserva su día de partida (define el día de la semana o del mes).
- `GET /api/recordatorios/despachar` trabaja como mucho una vez cada 15 s por instancia (es público).
- Comprobación de datos usada (solo lectura): inventario = suma de movimientos = suma de lotes; total de la venta = subtotal −
  descuento = neto de sus líneas; descuento = suma de sus partes; usos de cupón = ventas completadas que lo usaron; un solo
  correlativo por sucursal. Pruebas: `test/auditoria-sistema.integracion.test.ts`.

## Botón atrás por niveles

- `lib/navegacion/niveles.ts` (`padreDe`, probado): apartados del menú → inicio del rol; pantallas internas → un nivel arriba.
  `<NavegacionPorNiveles>` (en el Shell) corrige el `popstate` hacia el padre (ignora el popstate repetido sin cambio de ruta).
- **Pestañas, filtros, fechas y paginación usan `replace`** (no suman pasos); el menú usa `replace` salvo desde el inicio.
  Todo control nuevo que solo cambie `?parámetros` debe usar `router.replace` / `<Link replace>`. Prueba: `e2e/navegacion.spec.ts`.

## Reglas no negociables

- **Permisos en el servidor**: `proxy.ts` protege rutas por rol y *además* cada server action /
  route handler verifica sesión y rol. Nunca confiar solo en la interfaz.
- Encargado: solo los apartados que el administrador le deja con el candado abierto, y no vende (ver "Encargado = administrador con candados").
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
