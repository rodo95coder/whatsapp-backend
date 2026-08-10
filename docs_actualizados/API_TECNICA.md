# API técnica — WhatsApp Backend

Fecha de actualización: 2026-08-04

## Alcance y URL base

API HTTP multi-sesión basada en Express y WPPConnect. Cada `companyId` representa una sesión aislada de WhatsApp y su perfil local de Chromium.

```text
https://<dominio>/api
```

Las rutas de WhatsApp usan el prefijo `/whatsapp`, las de configuración de webhooks usan `/webhook` y las utilidades usan `/extra`.

## Autenticación y convenciones

Todas las rutas bajo `/api` excepto `/health` y `/readyz` requieren uno de estos headers:

```http
Authorization: Bearer <GLOBAL_TOKEN>
```

o:

```http
X-Global-Token: <GLOBAL_TOKEN>
```

Enviar JSON con:

```http
Content-Type: application/json
```

`companyId` debe tener entre 3 y 50 caracteres y usar solo letras, números, guion (`-`) y guion bajo (`_`).

Errores transversales:

| HTTP | Respuesta o significado |
| --- | --- |
| 401 | `{ "success": false, "message": "Token requerido" }` |
| 403 | `{ "success": false, "message": "Token inválido" }` |
| 400 | `companyId` inválido, body inválido o una opción con tipo incorrecto |
| 429 | Límite general de 100 solicitudes por minuto para `/api` |
| 500 | Error interno o fallo del motor WPPConnect; el texto de `message` depende de la ruta |

## Salud y disponibilidad

### `GET /health`

No requiere autenticación. Confirma que el proceso Node responde.

```json
{
  "ok": true,
  "uptime": 1234.56
}
```

### `GET /readyz`

No requiere autenticación. Es útil para monitoreo; no contiene datos de clientes ni números telefónicos.

```json
{
  "ok": true,
  "uptime": 1234.56,
  "sessions": {
    "total": 3,
    "connected": 2,
    "connecting": 1
  },
  "webhooks": {
    "pending": 0,
    "waiting": 0
  }
}
```

## Sesiones de WhatsApp

### `POST /whatsapp/init-session`

Inicia una sesión en segundo plano. No espera a que aparezca el QR ni a que el teléfono se autentique.

Body:

```json
{ "companyId": "demo1" }
```

Respuestas exitosas posibles:

```json
{ "success": true, "msg": "initializing" }
```

```json
{ "success": true, "msg": "already_initializing" }
```

```json
{ "success": true, "msg": "already_initialized" }
```

Flujo recomendado: llamar a `init-session`, consultar `/status` y, cuando el estado sea `QR_REQUIRED`, solicitar `/qr` periódicamente. Nunca iniciar repetidamente la misma sesión esperando un QR nuevo.

### `GET /whatsapp/:companyId/status`

Expone el estado normalizado del ciclo de vida. Una sesión que no existe devuelve `NOT_FOUND` como respuesta HTTP 200; no es una excepción.

Ejemplo de sesión conectada:

```json
{
  "success": true,
  "status": "CONNECTED",
  "reason": null,
  "updatedAt": "2026-08-04T12:00:00.000Z",
  "generationId": 4,
  "recoverable": true
}
```

Ejemplo de sesión inexistente:

```json
{
  "success": true,
  "status": "NOT_FOUND",
  "reason": null,
  "updatedAt": null,
  "generationId": null,
  "recoverable": false
}
```

#### Estados normalizados de la API

| Estado | Significado | Acción del consumidor |
| --- | --- | --- |
| `IDLE` | Runtime creado sin cliente activo. | Puede llamar a `init-session`. |
| `CONNECTING` | Chromium/WPPConnect está iniciando. | Esperar y volver a consultar. |
| `QR_REQUIRED` | Hay QR disponible para escanear. | Usar `/qr`. |
| `QRCODE_EXPIRED` | Se agotó el máximo de QR generados. | Llamar a `init-session` o `force-reset` según el diagnóstico. |
| `CONNECTED` | Sesión lista para enviar y verificar números. | Puede usar `/send` y rutas `/extra`. |
| `RECONNECTING` | Se programa una recuperación automática. | Esperar; no iniciar otra sesión en paralelo. |
| `SHUTTING_DOWN` | Se está cerrando el cliente o Chromium. | Esperar hasta `DISCONNECTED` o `IDLE`. |
| `DISCONNECTED` | Cliente no conectado. | Revisar `reason`; iniciar o esperar reconnect. |
| `FAILED` | Se agotaron los reintentos de reconnect. | Revisar logs y usar `force-reset` si corresponde. |
| `NOT_FOUND` | Nunca se creó el runtime o ya no existe en memoria. | Llamar a `init-session` si se desea crearla. |

#### Razones observables

`reason` puede ser `null` o una razón de cierre como `ENGINE_DISCONNECTED`, `QR_TIMEOUT`, `INITIALIZATION_TIMEOUT`, `AUTHENTICATION_FAILED`, `FORCE_RESET`, `LOGOUT`, `SIGINT` o `SIGTERM`. Es un diagnóstico, no una enumeración cerrada: futuras versiones pueden añadir razones.

`generationId` cambia en cada intento de creación o cierre y protege contra callbacks antiguos. `recoverable` es `false` para una sesión inexistente y durante logout manual; no confirma que WhatsApp acepte una reconexión.

### `GET /whatsapp/:companyId/qr`

Devuelve un PNG base64 de 900×900 px, con fondo blanco y zona silenciosa, preparado para visualizadores como Postman. Solo está disponible mientras exista un QR vigente.

Respuesta correcta:

```json
{
  "success": true,
  "data": {
    "qrCode": "iVBORw0KGgoAAA...",
    "mimeType": "image/png",
    "width": 900,
    "height": 900,
    "format": "png",
    "companyId": "demo1"
  }
}
```

QR no disponible (`404`):

```json
{
  "success": false,
  "message": "QR no disponible"
}
```

Un `404` puede significar que aún está en `CONNECTING`, ya está en `CONNECTED`, el QR expiró o la sesión fue cerrada. Confirmar siempre con `/status`.

### `POST /whatsapp/:companyId/force-reset`

Cierra y limpia una única sesión. No reinicia PM2 ni altera las demás sesiones.

Body:

```json
{
  "deleteAuth": false,
  "deleteSessionMetadata": false,
  "restart": true
}
```

| Campo | Tipo | Efecto |
| --- | --- | --- |
| `deleteAuth` | boolean | Si es `true`, elimina el perfil Chrome y obliga a escanear QR otra vez. |
| `deleteSessionMetadata` | boolean | Si es `true`, elimina metadatos locales, incluido webhook configurado. |
| `restart` | boolean | Si es `true`, vuelve a iniciar la sesión después de cerrarla. |

Respuesta:

```json
{
  "success": true,
  "companyId": "demo1",
  "deleteAuth": false,
  "deleteSessionMetadata": false,
  "restart": true
}
```

Usar primero `deleteAuth: false`. Un timeout de Puppeteer no prueba que la autenticación sea inválida.

### `POST /whatsapp/:companyId/logout`

Es el cierre explícito del usuario. Intenta desvincular el dispositivo también desde WhatsApp y luego borra autenticación y metadatos locales.

No requiere body.

Respuesta normal:

```json
{
  "success": true,
  "message": "logout_success",
  "companyId": "demo1",
  "remoteLogout": {
    "attempted": true,
    "success": true,
    "error": null
  }
}
```

En algunos cierres WhatsApp navega/cierra la página antes de que WPPConnect responda. En ese caso puede incluir:

```json
{
  "remoteLogout": {
    "attempted": true,
    "success": true,
    "error": null,
    "warning": "WhatsApp closed the page while confirming logout"
  }
}
```

El warning no indica necesariamente que el logout falló; representa la navegación esperada de WhatsApp Web.

## Envío y confirmación de mensajes

### `POST /whatsapp/:companyId/send`

Envía texto, archivo base64 o archivo desde URL pública. Los números se normalizan a formato WhatsApp; se aceptan números simples, `@c.us` y `@lid`.

Body de texto:

```json
{
  "numbers": ["51971934057", "51953248987"],
  "text": "Mensaje de prueba"
}
```

Body de archivo base64:

```json
{
  "numbers": ["51971934057"],
  "text": "Adjunto",
  "fileName": "documento.pdf",
  "base64File": "JVBERi0xLjQK..."
}
```

Body de archivo remoto:

```json
{
  "numbers": ["51971934057"],
  "text": "Adjunto",
  "fileName": "documento.pdf",
  "fileUrl": "https://files.example.com/documento.pdf"
}
```

El archivo tiene un límite práctico de 10 MB. Las URL privadas, localhost o direcciones internas están bloqueadas.

Respuesta exitosa compacta:

```json
{
  "success": true,
  "summary": {
    "total": 2,
    "successful": 2,
    "failed": 0
  },
  "results": [
    {
      "number": "51971934057",
      "success": true,
      "status": "server",
      "deliveryConfirmed": false
    },
    {
      "number": "51953248987",
      "success": true,
      "status": "delivered",
      "deliveryConfirmed": true
    }
  ]
}
```

Resultado individual fallido dentro de una petición válida:

```json
{
  "number": "51971934057",
  "success": false,
  "error": "WPP transport failed: ERROR_UNKNOWN"
}
```

`success: true` significa que WhatsApp aceptó el transporte del mensaje. No significa por sí solo que el destinatario lo leyó.

#### Confirmación y ACK

| `status` | Significado | `deliveryConfirmed` |
| --- | --- | --- |
| `pending` | Aún no hay ACK útil. | `false` |
| `server` | WhatsApp aceptó el mensaje en su servidor. | `false` |
| `delivered` | WhatsApp informó entrega al dispositivo destino. | `true` |
| `read` | El destinatario lo leyó. | `true` |
| `played` | Reprodujo audio/video. | `true` |
| `error` / `unknown` | ACK de error o no reconocido. | `false` |

La entrega/lectura posterior depende de WhatsApp, conectividad y privacidad del destinatario. El backend no puede garantizar un ACK de lectura inmediato. Si se configura webhook, los cambios posteriores se notifican con `message.ack`.

Por defecto se oculta `messageId`, porque es interno. Para consultar el endpoint de tracking, enviar:

```json
{
  "numbers": ["51971934057"],
  "text": "Mensaje rastreable",
  "includeMessageId": true
}
```

El resultado individual agregará `messageId`.

### `GET /whatsapp/:companyId/messages/:messageId/status`

Consulta un mensaje rastreado en memoria. Solo funciona si se solicitó `includeMessageId: true` al enviar y mientras no haya expirado el tracking o reiniciado Node.

Respuesta:

```json
{
  "success": true,
  "message": {
    "messageId": "true_123@lid_ABC",
    "to": "123@lid",
    "status": "read",
    "createdAt": 1785828104000,
    "updatedAt": 1785828110000,
    "deliveryConfirmed": true
  }
}
```

No disponible o expirado (`404`):

```json
{ "success": false, "message": "Estado de mensaje no disponible o expirado" }
```

## Funciones adicionales

### `POST /extra/verify-number`

Body:

```json
{ "companyId": "demo1", "number": "51971934057" }
```

Respuesta:

```json
{ "success": true, "exists": true }
```

Requiere sesión activa; de lo contrario devuelve `400` con `Session not active`.

### `POST /extra/send-bulk`

Body:

```json
{
  "companyId": "demo1",
  "list": ["51971934057", "51953248987"],
  "text": "Mensaje masivo"
}
```

La respuesta es exactamente el mismo contrato de `/whatsapp/:companyId/send`.

### `POST /extra/send-template`

Body:

```json
{
  "companyId": "demo1",
  "number": "51971934057",
  "templateKey": "SALUDO_BASICO",
  "params": { "nombre": "Rodolfo" }
}
```

Plantillas soportadas: `SALUDO_BASICO`, `CODIGO_CONFIRMACION`, `PAGO_CONFIRMADO`. También se permite cualquier `templateKey` si `params.raw` contiene el texto final.

La respuesta es el contrato de envío para un único destinatario.

## Webhooks de ACK

### `POST /webhook/:companyId/webhook`

Configura una URL HTTPS/HTTP pública. No admite hosts locales, direcciones privadas ni URL con credenciales.

Body:

```json
{ "url": "https://integrador.example.com/webhooks/whatsapp" }
```

Respuesta:

```json
{
  "success": true,
  "message": "Webhook configurado",
  "url": "https://integrador.example.com/webhooks/whatsapp"
}
```

### `GET /webhook/:companyId/webhook`

Respuesta configurada:

```json
{
  "success": true,
  "url": "https://integrador.example.com/webhooks/whatsapp",
  "updatedAt": "2026-08-04T12:00:00.000Z"
}
```

Sin configuración:

```json
{ "success": false, "message": "Webhook no configurado" }
```

Payload emitido hacia el integrador al cambiar un ACK:

```json
{
  "event": "message.ack",
  "companyId": "demo1",
  "messageId": "true_123@lid_ABC",
  "to": "123@lid",
  "status": "delivered",
  "timestamp": "2026-08-04T12:01:00.000Z"
}
```

La entrega de webhook se procesa en cola, con hasta tres intentos y timeout configurable. No bloquea el envío de mensajes ni los eventos de WhatsApp. Esta cola aún es de memoria: un reinicio puede descartar reintentos pendientes.

## Relación con WPPConnect

La API no entrega el texto original de todos los estados de WPPConnect. Normaliza solo los eventos útiles para el integrador:

| Evento WPPConnect observado | Estado expuesto por `/status` |
| --- | --- |
| `CONNECTED`, `MAIN`, `NORMAL`, `IN_CHAT`, `IS_LOGGED` | `CONNECTED` |
| `QR_READY`, `NOT_LOGGED` | `QR_REQUIRED` |
| `DISCONNECTED`, `UNPAIRED`, `BROWSER_CLOSE`, `CLOSED` | `DISCONNECTED` con `reason: ENGINE_DISCONNECTED` |
| `AUTOCLOSE_CALLED` durante creación | cierre con `reason: QR_TIMEOUT` |
| `Session Unpaired` inicial | No se interpreta automáticamente como fallo; puede ser parte de una sesión nueva esperando QR. |

Otros textos internos de WPPConnect se registran en logs y pueden no cambiar el estado público. Nunca consumir logs como contrato de integración.

## Configuración relevante

| Variable | Default | Uso |
| --- | --- | --- |
| `GLOBAL_TOKEN` | requerida | Token global de la API. |
| `QR_TIMEOUT_MS` | 180000 | Vigencia de la ventana de QR de WPPConnect. |
| `INIT_SESSION_TIMEOUT_MS` | 180000 | Límite externo para inicialización. |
| `SEND_MESSAGE_TIMEOUT_MS` | 15000 | Límite por envío individual. |
| `MAX_QUEUE_PER_SESSION` | 1000 | Cola máxima de operaciones de una sesión. |
| `MESSAGE_TRACKER_TTL_MS` | 24 h | Tiempo de consulta de ACK en memoria. |
| `WEBHOOK_TIMEOUT_MS` | 8000 | Timeout por intento de webhook. |
| `WEBHOOK_CONCURRENCY` | 2 | Webhooks simultáneos máximos. |
| `SESSION_RESTORE_CONCURRENCY` | 1 | Sesiones restauradas simultáneamente al iniciar. |
| `SLOW_REQUEST_MS` | 2000 | Umbral de log `http.slow`. |
| `CORS_ORIGINS` | vacío | Lista CSV opcional de orígenes permitidos. Vacío conserva el comportamiento actual. |

## Documentación complementaria recomendada

Para una operación completa, añadir y mantener estos artefactos junto con esta guía:

1. **Colección Postman/OpenAPI 3.1** con ejemplos ejecutables, variables de entorno y pruebas de contrato.
2. **Runbook de incidentes**: sesión bloqueada, QR vencido, reinicios, pérdida de perfil Chrome, errores de envío y recuperación con `force-reset`.
3. **Guía de despliegue y rollback**: versión de Node, Chromium, PM2, Nginx, variables de entorno, copias de `userSessions` y comandos de verificación.
4. **Política de seguridad y retención**: tratamiento de números, logs, tokens, backups de perfiles Chrome y URLs de archivos/webhooks.
5. **Matriz de monitoreo**: alertas de `session.capacity.warning`, `http.slow`, sesiones `FAILED`, cola de webhooks y uso de RAM de Chromium.
6. **Pruebas de aceptación** para cada endpoint, especialmente envío de texto/archivo, ACK, logout remoto y restauración de sesión.
