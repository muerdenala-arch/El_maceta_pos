# Resumen diario por WhatsApp con n8n

Todos los días a las 22:00 (hora de Bolivia) te llega a WhatsApp un aviso corto, **"Tu resumen de ventas de hoy está listo"**,
con el botón **Ver resumen**. Al tocarlo llega el resumen completo: ventas (efectivo y QR), ganancia, gastos, lo que queda del
día, ventas por sucursal, los 5 más vendidos, cajas sin cerrar o con diferencia y alertas pendientes.

También funciona a pedido: escribe cualquier mensaje a ese número y responde con el resumen de hoy; si el mensaje dice
"ayer", con el de ayer.

**Por qué en dos pasos.** WhatsApp oficial solo deja enviar texto libre a quien le escribió en las últimas 24 horas. Fuera de
ese plazo solo se pueden enviar plantillas aprobadas, que no admiten varias líneas. Tocar el botón cuenta como escribirle, y
abre el plazo para el resumen completo.

## Qué hace cada parte

| Parte | Qué hace |
| --- | --- |
| El Maseta | Entrega el resumen ya redactado en `GET /api/integraciones/resumen-diario?fecha=hoy` a quien traiga la clave. Solo lectura. |
| n8n | A las 22:00 envía la plantilla; cuando respondes, pide el resumen y te lo envía. |
| WhatsApp Business (Meta) | El número desde el que salen los mensajes. |

## Lo que necesitas (lo haces tú: son cuentas a tu nombre)

1. **n8n**: una cuenta en n8n Cloud o una instalación propia que esté siempre encendida.
2. **Meta Business + API de WhatsApp**: en developers.facebook.com crea una app de tipo "Business", agrega el producto
   WhatsApp y registra un **número dedicado** (no puede ser uno que ya uses en la app de WhatsApp normal). De ahí salen:
   - el **ID del número de teléfono** (Phone number ID),
   - un **token permanente** (usuario del sistema con permiso `whatsapp_business_messaging`).
3. **La plantilla** `resumen_listo` (Administrador de WhatsApp → Plantillas de mensajes → Crear):
   - Categoría: **Utilidad**. Idioma: **Español (es)**.
   - Cuerpo: `Tu resumen de ventas de hoy está listo.`
   - Botón de **respuesta rápida**: `Ver resumen`.
   - Enviar a revisión; Meta suele aprobarla en minutos u horas.
4. **La clave de integraciones** del sistema (`INTEGRACION_TOKEN`). Está guardada en el archivo `.env.integracion.local` de
   la carpeta del proyecto (no se sube a GitHub) y en Vercel.

## Pasos en n8n

### 1. Credenciales (Credentials → Add credential → "Header Auth")

Crea dos, las dos con el nombre de encabezado `Authorization`:

| Nombre de la credencial | Valor |
| --- | --- |
| `El Maseta` | `Bearer ` + la clave de `.env.integracion.local` |
| `WhatsApp Meta` | `Bearer ` + el token permanente de Meta |

### 2. Importar los flujos (Workflows → Import from File)

- `docs/n8n/1-aviso-diario.json`: el aviso de las 22:00.
- `docs/n8n/2-responder-resumen.json`: la respuesta con el resumen.

En cada nodo "WhatsApp: …" y "El Maseta: …" elige su credencial. Reemplaza en los nodos:

- `ID_DEL_NUMERO_DE_WHATSAPP` → el ID del número de teléfono de Meta.
- `591XXXXXXXX` → **tu** número personal, con código de país y sin `+` (donde quieres recibir el resumen). Está en los dos
  nodos de envío y en el nodo "¿Escribe el dueño?".

### 3. Agregar el disparador del segundo flujo

En "El Maseta - Responder con el resumen" agrega al inicio el nodo **WhatsApp Trigger** (evento: *messages*), con la
credencial que pide n8n (ID y secreto de la app de Meta), y conéctalo al nodo "¿Escribe el dueño?". n8n registra solo el
webhook en Meta al activar el flujo.

### 4. Probar y activar

1. En el segundo flujo pulsa "Listen for test event" y escríbele "hola" al número del negocio desde tu WhatsApp: debe llegar
   el resumen de hoy.
2. En el primer flujo pulsa "Execute workflow": debe llegar la plantilla con el botón; tócalo y llega el resumen.
3. Activa los dos flujos (interruptor "Active").

## Si algo no funciona

| Qué pasa | Causa probable |
| --- | --- |
| El nodo "El Maseta" responde 401 | La credencial no tiene `Bearer ` delante de la clave, o la clave no es la de producción. |
| Responde 503 | Falta `INTEGRACION_TOKEN` en Vercel (o tiene menos de 32 caracteres). |
| Meta responde error 131047 | Pasaron más de 24 horas desde tu último mensaje: toca el botón de la plantilla o escríbele primero. |
| Meta responde error 132001 | La plantilla `resumen_listo` no existe, no está aprobada o el idioma no es `es`. |
| No llega nada a las 22:00 | El flujo no está activo, o la zona horaria del flujo no es America/La_Paz (Workflow settings). |

## Seguridad

- La clave solo abre el resumen del día (números del negocio). No permite vender, cambiar precios ni ver clientes o PIN.
- Si la clave se filtra: genera otra, cámbiala en Vercel (`INTEGRACION_TOKEN`), vuelve a publicar y actualiza la credencial en n8n.
- El segundo flujo solo responde a tu número: los mensajes de cualquier otro se ignoran.

## Costos (confirmar precios actuales)

- n8n Cloud es de pago por mes; instalado en un servidor propio es gratis.
- WhatsApp cobra por cada plantilla de utilidad enviada (una por día); la respuesta dentro del plazo de 24 horas no se cobra.

Los archivos de `docs/n8n/` se escribieron a mano siguiendo el formato de n8n y no se pudieron probar dentro de n8n desde
aquí: si al importar un nodo aparece con aviso, ábrelo y vuelve a elegir sus opciones según esta guía.
