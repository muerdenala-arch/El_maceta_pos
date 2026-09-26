# Sistema de diseño — El Maseta

> Basado en las pantallas de referencia que eligió el dueño (login con PIN y panel de reportes).
> Si cambia, actualizar los tokens en `src/app/globals.css` y este archivo.

## Concepto

Modo oscuro casi negro (o crema cálido en modo claro) con **luces difusas** de fondo (naranja arriba
a la izquierda, verde abajo a la derecha). El **naranja** es el color de acción. Tarjetas muy
redondeadas, cifras grandes en negrita y fichas de color pastel con ícono.

## Color (tokens en `globals.css`)

| Token | Uso |
|---|---|
| `primary` | Naranja: botón principal (Ingresar, Cobrar, Guardar), puntos del PIN, íconos de título. |
| `nav-activo` / `nav-activo-foreground` | Elemento activo del menú: fondo crema, texto naranja. |
| `ficha-naranja` / `ficha-verde` / `ficha-rosa` / `ficha-neutra` (+ `-foreground`) | Fichas de ícono de las tarjetas de estadísticas. |
| `exito` | Venta realizada, en línea, caja cuadrada. |
| `aviso` | Stock bajo, pendientes de sincronizar, QR por confirmar, por vencer. |
| `destructive` | Anular, error de PIN, sin conexión, faltante en caja. |
| `resaltado` | Fondo del producto resaltado al llegar desde una alerta (`.fila-resaltada`). |
| `brillo-1/2/3` | Luces difusas del fondo (`<FondoAmbiental />`). |
| `sidebar-*` | Barra lateral. |
| `chart-1…5` | Gráficos; también el aro del logo. |

Nunca usar colores sueltos (`bg-orange-500`); siempre tokens para que el modo claro/oscuro funcione.

## Tipografía

- **Outfit** (`font-display`): títulos, marca, montos grandes (peso 800).
- **Nunito** (`font-sans`, por defecto): interfaz y texto.
- **JetBrains Mono** (`font-mono`): códigos de barras, números de comprobante.
- Montos y cantidades: clase `cifras` (cifras tabulares).

## Componentes base

- `Logo` — círculo con aro de colores; logo de Configuración o inicial del nombre (sin artículos).
- `FondoAmbiental` — luces difusas (login, pantalla de bloqueo).
- `TecladoPin` — teclado 3×4 con C y ⌫, puntos del PIN, sacudida en error, teclado físico.
- `SelectorTema` — interruptor tipo píldora sol/luna.
- `TarjetaEstadistica` — ficha de color + valor grande + título + detalle.
- `SelectorFecha` — píldoras "Hoy" y "Elegir fecha" (parámetro `?fecha=`).

## Forma y espacio

- Radio base `0.875rem`; tarjetas `rounded-3xl`; tarjeta de login `rounded-[2rem]`.
- Objetivos táctiles ≥ 44 px (teclas del PIN 56–64 px).
- Márgenes de página: `px-4` en celular, `px-8` desde `sm`.

## Movimiento (Motion)

- ≤ 250 ms en el punto de venta; ≤ 300 ms en el panel.
- Respetar "reducir movimiento" (`MotionConfig reducedMotion="user"` global).

## Estructura de pantalla

- **PC (≥ 1024 px)**: barra lateral con "Volver", fila de logo + campanita + recarga + tema,
  "Viendo sucursal" (admin) o "Tu sucursal" (cajero), menú, y abajo tarjeta de usuario con
  indicador de conexión y "Cerrar sesión".
- **Celular**: barra superior; el menú se abre como panel lateral. El cajero tiene además
  pestañas inferiores (Venta · Bodega · Gastos · Cierre).
