# Sistema de diseño — El Maseta

> Versión provisional (Fase 0). Puede refinarse con la skill UI/UX Pro Max (sección 15.4 del plan);
> si cambia, actualizar los tokens en `src/app/globals.css` y este archivo.

## Concepto: "Voltaje"

Tienda de suplementos deportivos → energía, precisión, rapidez. Base neutra "tinta" (gris azulado
muy oscuro) con un único acento **verde lima eléctrico** reservado para la acción principal y el
estado activo. Todo lo demás es neutro, para que el lima guíe la vista (botón *Cobrar*,
pestaña activa, producto resaltado).

## Color (tokens en `globals.css`)

| Token | Uso |
|---|---|
| `primary` / `primary-foreground` | Acción principal (Cobrar, Guardar, Abrir caja), elemento activo. Texto tinta sobre lima (contraste > 10:1). |
| `secondary`, `muted`, `accent` | Acciones secundarias, fondos de apoyo, hover. |
| `destructive` | Anular, eliminar, sin conexión, faltante en caja. |
| `exito` | Venta realizada, en línea, caja cuadrada. |
| `aviso` | Stock bajo, pendientes de sincronizar, QR por confirmar, por vencer. |
| `resaltado` | Fondo del producto resaltado al llegar desde una alerta (`.fila-resaltada`). |
| `sidebar-*` | Barra lateral: siempre oscura en ambos modos. |
| `chart-1…5` | Gráficos de reportes. |

Nunca usar colores sueltos (`bg-green-500`); siempre tokens para que el modo oscuro funcione.

## Tipografía

- **Bricolage Grotesque** (`font-display`): títulos, marca, totales grandes.
- **Figtree** (`font-sans`, por defecto): interfaz y texto.
- **JetBrains Mono** (`font-mono`): códigos de barras, números de comprobante.
- Montos y cantidades: clase `cifras` (cifras tabulares) para alinear columnas.

## Forma y espacio

- Radio base `0.75rem`; tarjetas de producto `rounded-2xl`.
- Objetivos táctiles ≥ 44 px en el punto de venta (`size="lg"` en botones del POS).
- Márgenes de página: `p-4` en celular, `p-6` desde `sm`.

## Movimiento (Motion)

- Duración ≤ 250 ms en el POS (agregar al carrito, venta realizada); ≤ 300 ms en el panel admin.
- Easing de salida suave (`easeOut`); sin rebotes largos.
- Respetar "reducir movimiento" (ya configurado globalmente con `MotionConfig reducedMotion="user"`).

## Estructura de pantalla

- **Admin**: barra lateral oscura en PC (≥ 1024 px); en celular, menú desplegable en la barra superior.
- **Cajero**: barra lateral en PC; en celular, pestañas inferiores (Venta · Bodega · Gastos · Cierre).
- **Barra superior** (ambos roles): indicador de conexión, recarga, campanita (solo admin), tema.
