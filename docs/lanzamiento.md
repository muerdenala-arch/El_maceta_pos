# Lanzamiento (Fase 10)

Orden recomendado. Las claves se escriben **solo** en `.env.produccion.local` (en esta PC) y en el panel de
Vercel; nunca en el código, en GitHub ni en chats.

## 1. Neon (base de datos)

1. En Neon, el proyecto debe estar en la región **AWS São Paulo (sa-east-1)**, la más cercana a Bolivia.
   Si lo creaste en otra región, conviene crear uno nuevo en São Paulo (todavía no tiene datos).
2. **Connect** → copiar la cadena **Pooled connection** → pegarla en `DATABASE_URL` de `.env.produccion.local`.
3. `DATABASE_URL_DIRECTA` es opcional: si queda vacía se usa la misma cadena sin `-pooler`.
4. En el mismo archivo, `SEED_ADMIN_PIN`: el PIN del administrador real (4 a 6 dígitos, que no sea fácil).
5. Crear las tablas y los datos iniciales (bodega, sucursal principal, administrador, categorías):

   ```
   npm run db:migrate -- --env .env.produccion.local
   npm run db:seed -- --env .env.produccion.local
   ```

6. Respaldos: en Neon → **Settings → Storage / History retention**, dejar la restauración a un punto en el tiempo
   con el máximo que permita el plan. Además, cada semana exportar a Excel los reportes de ventas y gastos.

## 2. Vercel (publicación)

1. **Add New → Project** → importar el repositorio `El_maceta_pos` de GitHub. Framework: Next.js (se detecta solo).
2. Antes de *Deploy*, en **Environment Variables** agregar (para Production y Preview):
   - `DATABASE_URL` = la cadena **pooled** de Neon.
   - `JWT_SECRET` = una clave aleatoria larga. Generarla en esta PC con
     `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` y copiarla.
   - `SESION_HORAS` = `12`.
3. **Deploy**. Después: **Storage → Create → Blob** → conectarlo al proyecto (crea `BLOB_READ_WRITE_TOKEN` solo)
   → **Deployments → Redeploy** para que la tome.
4. **Settings → Functions → Function Region**: São Paulo (`gru1`), la misma región que Neon.
5. Opcional: **Settings → Domains** para un dominio propio (por ejemplo `pos.elmaseta.com`).

Cada `git push` a `main` publica una versión nueva; las ramas generan versiones de prueba (Preview).
Para que las pruebas no toquen datos reales, en Neon crear una rama `pruebas` y usar su cadena en la variable
`DATABASE_URL` del ambiente **Preview** de Vercel.

## 3. Puesta en marcha

1. Entrar con el administrador → **Configuración**: nombre comercial, NIT, logo, mensaje del comprobante,
   plantilla de WhatsApp.
2. **Sucursales**: renombrar "Sucursal principal", agregar las demás (dirección, teléfono, tamaño de impresión).
3. **QR de cobro**: subir la imagen del QR de cada sucursal (sin QR no se puede cobrar por QR).
4. **Catálogo → Importar Excel**: descargar la planilla modelo, llenarla con los productos reales y su stock
   inicial por sucursal y bodega, revisarla y confirmar.
5. **Personal**: crear los cajeros (usuario, PIN y sucursal).
6. En cada celular de caja: abrir la página en Chrome → **Instalar aplicación** → entrar una vez con internet.
7. Hacer las pruebas de `docs/pruebas-manuales.md` y capacitar a los cajeros con `docs/guia-cajero.md`.
