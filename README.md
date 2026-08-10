# WhatsApp backend

API multi-sesiÃ³n basada en Express y WPPConnect.

## RecuperaciÃ³n de una sesiÃ³n bloqueada

La inicializaciÃ³n estÃ¡ limitada por `INIT_SESSION_TIMEOUT_MS` (180000 ms por defecto). Si WPPConnect/Puppeteer no termina, el backend invalida ese intento, cierra Ãºnicamente el Chromium cuyo `user-data-dir` corresponde a la empresa y deja el estado en `DISCONNECTED` con una razÃ³n observable.

Consulta el estado:

```http
GET /api/whatsapp/:companyId/status
Authorization: Bearer <GLOBAL_TOKEN>
```

La respuesta incluye `status`, `reason`, `updatedAt`, `generationId` y `recoverable`.

Para recuperar una sola sesiÃ³n sin borrar su autenticaciÃ³n:

```http
POST /api/whatsapp/:companyId/force-reset
Authorization: Bearer <GLOBAL_TOKEN>
Content-Type: application/json

{ "deleteAuth": false, "deleteSessionMetadata": false, "restart": true }
```

`deleteAuth: true` elimina el perfil `userSessions/:companyId/chrome`; solo Ãºsalo si se desea forzar un nuevo QR. El reset no reinicia PM2 ni afecta otras sesiones.

Variables adicionales:

```env
INIT_SESSION_TIMEOUT_MS=180000
BROWSER_CLOSE_TIMEOUT_MS=10000
PUPPETEER_PROTOCOL_TIMEOUT_MS=60000
PUPPETEER_NO_SANDBOX=false
WPP_LOG_LEVEL=warn
SESSION_WATCHDOG_INTERVAL_MS=30000
SESSION_CAPACITY_WARN_FREE_MEMORY_MB=512
SESSION_CAPACITY_WARN_PROCESS_RSS_MB=800
SESSION_CAPACITY_WARN_COOLDOWN_MS=300000
WEBHOOK_CONCURRENCY=2
SESSION_RESTORE_CONCURRENCY=1
SLOW_REQUEST_MS=2000
CORS_ORIGINS=https://panel.empresa.com,https://app.empresa.com
```

## Respuesta de envío y confirmación

`POST /api/whatsapp/:companyId/send` devuelve por defecto solamente
`number`, `success`, `status` y `deliveryConfirmed` por destinatario. El
backend considera exitoso un mensaje cuando WhatsApp confirma que el
transporte lo aceptó; `deliveryConfirmed` solo es `true` al recibir ACK de
entrega, lectura o reproducción. Esos ACK posteriores se publican por el
webhook configurado.

Si un integrador necesita consultar el endpoint existente de estado de
mensaje, puede enviar `"includeMessageId": true` en el body de `/send`.

Al alcanzar cualquiera de los umbrales de capacidad, el backend no rechaza sesiones: deja un log `session.capacity.warning` con el total, conectadas, inicializándose, RSS de Node y memoria libre del sistema.
En Linux incluye además `browserRssMb` y `browserProcesses`, que abarcan el árbol de procesos Chromium de las sesiones activas.

## VerificaciÃ³n

Ejecuta `node --test` y `node_modules/.bin/eslint . --no-fix`. Para comprobar recuperaciÃ³n en desarrollo, usa una sesiÃ³n de prueba, inicia la sesiÃ³n, provoca/captura un timeout y confirma que el estado deja de ser `CONNECTING`; luego usa `force-reset` con `deleteAuth: false`.
