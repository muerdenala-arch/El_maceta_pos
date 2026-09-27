# Pruebas manuales en la tienda (Fase 9)

Lo que las pruebas automáticas no pueden comprobar porque depende del equipo real: el celular,
la impresora térmica, WhatsApp y el internet de verdad. Hacerlas **en el ambiente de pruebas**
(nunca con datos reales) antes del lanzamiento, y marcar cada punto.

Equipos: un celular Android con Chrome, una PC y la impresora térmica de la tienda.

## 1. Instalación y apertura

- [ ] En el celular, abrir el sistema en Chrome → menú ⋮ → **Instalar aplicación**. Aparece el ícono de El Maseta.
- [ ] Abrir desde el ícono: se ve a pantalla completa, sin la barra de Chrome.
- [ ] Iniciar sesión como cajero. Cerrar la app por completo (quitarla de recientes) y volver a abrirla: **pide el PIN**.
- [ ] Cambiar a modo claro, cerrar la app por completo y reabrirla: **sigue en modo claro**.

## 2. Venta sin internet (celular)

- [ ] Con internet, abrir caja y entrar al punto de venta; esperar unos segundos (se guardan pantallas y fotos).
- [ ] Activar el **modo avión**. Las fotos de los productos se siguen viendo y aparece "Sin conexión".
- [ ] Hacer una venta en efectivo y otra por QR. Ambas muestran comprobante provisional.
- [ ] Imprimir y descargar el PDF de una de ellas **sin internet**.
- [ ] Cerrar la app por completo y reabrirla todavía en modo avión: pide el PIN y lo acepta.
- [ ] Desactivar el modo avión: en menos de un minuto las ventas se sincronizan solas y reciben número definitivo.
- [ ] En la PC, como admin: las dos ventas aparecen **una sola vez** en Reportes, y la de QR figura "por confirmar" con su alerta.
- [ ] Probar también cortando el wifi del router en plena venta (no solo el modo avión).

## 3. Comprobantes

- [ ] Imprimir en la térmica de **58 mm** y de **80 mm** (Configuración → tamaño de la sucursal): el texto no se corta y el logo se ve.
- [ ] Imprimir en tamaño **carta** desde la PC.
- [ ] En el celular, **WhatsApp → Compartir el PDF**: se abre el menú del teléfono, se elige WhatsApp y el contacto, y el PDF llega **como archivo adjunto**.
- [ ] Desde la PC, WhatsApp con el número del cliente: abre WhatsApp Web con el mensaje y el enlace; el enlace abre el comprobante en otro celular sin iniciar sesión.

## 4. Caja y bloqueo

- [ ] Dejar el celular sin tocar 15 minutos (o con la pantalla apagada): al volver pide el PIN y el carrito sigue igual.
- [ ] Cerrar caja contando menos efectivo del esperado: muestra el faltante y al admin le llega la alerta.
- [ ] Dos cajeros de sucursales distintas vendiendo al mismo tiempo: cada sucursal lleva su propia numeración.

## 5. Otros

- [ ] Lector de código de barras (si hay): en el punto de venta, escanear agrega el producto.
- [ ] Foto de un producto sacada con la cámara del celular: se sube comprimida y se ve bien.
- [ ] Foto de un comprobante de gasto desde el celular.
- [ ] Botón de recarga (↻): actualiza los datos sin cerrar la sesión.
- [ ] Reportes: exportar a Excel y abrirlo en Excel/Google Sheets; exportar a PDF y abrirlo en el celular.

Anotar cualquier falla con: qué se hizo, qué se esperaba, qué pasó y una captura de pantalla.
