# Protocolo de mensajes (contrato frontend ↔ backend)

Transporte: **WebSocket** (`ws://<host>:<port>`, puerto predeterminado 5000).
`--host`/`--port` o `CHAT_HOST`/`CHAT_PORT` configuran la escucha del servidor;
los argumentos tienen prioridad. Todo mensaje es un objeto JSON
en texto plano, con un campo `type` obligatorio que indica de qué se trata.

La lectura inicial del handshake tiene un timeout de **10 segundos**. Si expira
o el handshake falla, se cierra la conexión. Después de un handshake exitoso,
se elimina ese timeout para permitir sesiones inactivas.

## Cliente → Servidor

### Login
```json
{ "type": "login", "username": "Usuario1", "password": "1234" }
```

### Registro
```json
{ "type": "register", "username": "Usuario1", "password": "1234" }
```

### Suscripción al monitor
```json
{ "type": "monitor_subscribe" }
```

El administrador queda suscrito automáticamente tras el login. Esta solicitud
es idempotente para un admin ya suscrito. Una conexión sin rol `admin` recibe
`{"type":"error","reason":"forbidden"}`, incluso antes del login.

### Administración de usuarios y grupos

Estos mensajes requieren una sesión autenticada con rol `admin`. Las respuestas
de cambio usan `admin_result` con `ok`, `action` y, si corresponde, `reason`.

```json
{ "type": "admin_list_users" }
{ "type": "admin_create_user", "username": "user21", "password": "test1234", "role": "user" }
{ "type": "admin_update_user", "username": "user21", "role": "user", "description": "Alumno" }
{ "type": "admin_delete_user", "username": "user21" }
```

El servidor responde a `admin_list_users` con `admin_users`, incluyendo rol,
perfil, fecha de creación y estado `online`. Un administrador no puede
eliminarse a sí mismo.

```json
{ "type": "admin_list_groups" }
{ "type": "admin_create_group", "name": "Equipo", "members": ["user01", "user02"] }
{ "type": "admin_update_group", "groupId": "abc-123", "name": "Equipo 2", "members": ["user01"] }
{ "type": "admin_delete_group", "groupId": "abc-123" }
```

Los grupos administrativos se guardan en SQLite y solo incluyen cuentas de
chat existentes. Una cuenta normal que intente usar estos mensajes recibe
`forbidden`.

Al iniciar sesión, un usuario recibe sus grupos actuales:

```json
{ "type": "group_list", "groups": [] }
```

Cuando un administrador agrega integrantes a un grupo, cada integrante
conectado recibe `group_added` con el grupo y el mensaje visible
`"Se te agregó a este grupo"`. `group_updated`, `group_removed` y `group_deleted` notifican
los cambios posteriores.

Si un administrador renombra una cuenta conectada, esa sesión recibe:

```json
{ "type": "username_changed", "username": "nuevo_nombre" }
```

El cliente debe actualizar su sesión y sus referencias locales al nuevo nombre.

### Mensaje general (broadcast)
```json
{ "type": "broadcast", "message": "Hola a todos" }
```

### Mensaje privado
```json
{ "type": "private_message", "to": "Usuario2", "message": "Hola" }
```

### Archivo (versión simple, base64 dentro del JSON)
```json
{
  "type": "file",
  "to": "Usuario2",
  "filename": "documento.pdf",
  "data": "<contenido en base64>"
}
```

Si se omite `to` (o va vacío), el archivo se difunde a la sala general como un
broadcast. Con `to`, llega al usuario si está conectado y queda guardado para
su siguiente login si la cuenta existe. Solo se responde `user_not_found` si
el destinatario no está registrado.

El archivo decodificado puede pesar como máximo **5 MiB (5 242 880 bytes)**.
Si supera ese límite, se responde `{"type":"error","reason":"file_too_large"}`
sin reenviar el archivo. Si `data` falta o no contiene base64 válido, se responde
`{"type":"error","reason":"invalid_message"}`.

### Directorio de usuarios registrados
```json
{ "type": "list_directory" }
```

Respuesta (sin admins; excluye al solicitante):

```json
{
  "type": "directory",
  "users": [
    { "username": "Ana", "avatarUrl": "", "description": "Hola" }
  ]
}
```

### Mensaje de grupo
```json
{
  "type": "group_message",
  "groupId": "abc-123",
  "groupName": "Equipo frontend",
  "members": ["Ana", "Carlos", "Luis"],
  "message": "Reunión a las 5"
}
```

El servidor añade `from` y reenvía a cada miembro conectado de `members`
(excepto el emisor). Los grupos se crean en el cliente; este mensaje solo
distribuye el texto.

### Confirmación de lectura (visto)
```json
{ "type": "read_receipt", "chat": "Usuario2" }
```

Indica que el emisor abrió y leyó esa conversación. `chat` es el usuario del
chat privado. Para la sala general usar `null` (o omitir / `"broadcast"`):

```json
{ "type": "read_receipt", "chat": null }
```

El servidor reenvía al interesado:

- Privado: solo a `chat`, con
  `{"type":"read_receipt","from":"<lector>","chat":"<lector>"}`
  (tus mensajes hacia ese lector se marcan como vistos).
- Sala general: broadcast a los demás con
  `{"type":"read_receipt","from":"<lector>","chat":null}`.

### Indicador de escritura
```json
{ "type": "typing", "chat": "Usuario2", "isTyping": true }
```

Sala general: `chat: null`. Grupo:

```json
{
  "type": "typing",
  "groupId": "abc-123",
  "members": ["Ana", "Carlos"],
  "isTyping": true
}
```

El servidor solo reenvía el aviso (no lo guarda). En privado responde al peer
con `from` del que escribe y `chat` = ese usuario. `isTyping: false` cancela.

## Servidor → Cliente

El servidor agrega el campo `from` a los mensajes que reenvía:

```json
{ "type": "broadcast", "from": "Usuario1", "message": "Hola a todos" }
```

```json
{ "type": "private_message", "from": "Usuario1", "message": "Hola" }
```

### Lista de usuarios conectados
```json
{
  "type": "user_list",
  "users": ["Usuario1", "Usuario2", "Usuario3"],
  "profiles": {
    "Usuario1": { "avatarUrl": "https://ejemplo.com/a.jpg", "description": "Hola" },
    "Usuario2": { "avatarUrl": "", "description": "" }
  }
}
```

`users` sigue siendo la lista de nombres (compatible con clientes antiguos).
`profiles` aporta avatar y descripción públicos de cada conectado. El correo
no se comparte.

### Actualizar perfil público
```json
{
  "type": "update_profile",
  "avatarUrl": "https://ejemplo.com/foto.jpg",
  "description": "Hey ahí estoy usando Chat"
}
```

`avatarUrl` vacío quita la foto. Debe ser `http://` o `https://` (máx. 2048
caracteres). `description` admite hasta 140 caracteres. Respuesta:

```json
{
  "type": "profile_result",
  "ok": true,
  "reason": null,
  "avatarUrl": "https://ejemplo.com/foto.jpg",
  "description": "Hey ahí estoy usando Chat"
}
```

Tras un cambio válido el servidor vuelve a emitir `user_list` con `profiles`
actualizados.

### Resultado de registro
```json
{ "type": "register_result", "ok": true, "reason": null }
```

Si el usuario ya existe:

```json
{ "type": "register_result", "ok": false, "reason": "username_taken" }
```

### Resultado de login
```json
{
  "type": "login_result",
  "ok": true,
  "reason": null,
  "role": "user",
  "avatarUrl": "",
  "description": ""
}
```

El login correcto incluye `role`, con valor `user` o `admin` según la cuenta
almacenada en SQLite, más el perfil público guardado (`avatarUrl`,
`description`). El registro web crea cuentas `user`; enviar un campo
`role` desde el cliente no permite elegir privilegios. `reason` conserva su
valor `null` en respuestas exitosas. El administrador recibe su `login_result`
antes del snapshot; no aparece en `user_list`, no recibe mensajes de chat ni
archivos y no puede enviar mensajes de chat (recibe `forbidden`). Su sesión
también está protegida contra logins duplicados.

Si las credenciales no son válidas:

```json
{ "type": "login_result", "ok": false, "reason": "invalid_credentials" }
```

### Historial de mensajes

Después de un login correcto de un usuario, el servidor envía los mensajes
guardados en SQLite, incluidos los privados y de grupo enviados mientras el
destinatario estaba desconectado:

```json
{ "type": "history", "messages": [] }
```

El servidor conserva como máximo los últimos 500 mensajes visibles para cada
usuario. Los archivos también se guardan como parte del mensaje y respetan el
límite de 5 MiB.

Si el usuario ya tiene una sesión conectada, se conserva la conexión original:

```json
{ "type": "error", "reason": "already_connected" }
```

Una conexión autenticada tampoco puede iniciar otra sesión sobre el mismo socket.
La conexión rechazada permanece abierta y puede intentar otro usuario si aún no
está autenticada.

### Errores
```json
{ "type": "error", "reason": "username_taken" }
```
Valores posibles de `reason` (agregar más conforme se necesiten):
`username_taken`, `invalid_credentials`, `user_not_found`,
`authentication_required`, `invalid_message`, `file_too_large`,
`already_connected`, `forbidden`.

Cada conexión tiene una cola de salida de hasta 1000 mensajes y un escritor
exclusivo. Si la cola se llena, se cierra esa conexión y se actualiza `user_list`;
no se garantiza entregar mensajes pendientes ni un error antes del cierre.

### Monitor: estado inicial
```json
{
  "type": "monitor_snapshot",
  "log": [{"ts": "2026-09-27T20:00:00+00:00", "thread": "client-user01", "level": "INFO", "msg": "..."}],
  "stats": {},
  "users": ["user01", "user02"]
}
```

`log` contiene hasta 200 entradas recientes, en orden cronológico; `stats`
contiene los mismos campos numéricos que `monitor_stats`, sin `type`.
`users` incluye únicamente sesiones de chat. Los timestamps usan ISO 8601 UTC.

### Monitor: eventos en vivo
```json
{
  "type": "monitor_event",
  "event": "message",
  "ts": "2026-09-27T20:00:00+00:00",
  "thread": "client-user01",
  "user": "user01",
  "detail": {"message_type": "private_message", "to": "user02", "bytes": 120}
}
```

`event` puede ser `connect`, `disconnect`, `login_failed`, `message`,
`broadcast`, `file` o `error`. Antes de autenticar, `user` puede ser `null`.
`connect` distingue TCP (`detail.phase: "tcp"`, dirección IP:puerto) y login
correcto (`detail.phase: "login"`). Un `message` registra el tipo y tamaño del
JSON recibido, nunca el texto, contraseña o base64. Los broadcasts incluyen
`recipients`; los archivos incluyen `filename`, `to`, `bytes` decodificados y
`duration_ms` desde el inicio de serialización hasta completar `sendall` (no es
un acuse de recibo del destinatario). Los errores y desconexiones incluyen
`reason`. La cola del monitor admite 1000 eventos y descarta los más antiguos
al saturarse; el stream no es un historial garantizado. El snapshot y los
eventos próximos a la suscripción pueden describir el mismo hecho.

### Monitor: estadísticas cada 2 segundos
```json
{
  "type": "monitor_stats", "connected": 12, "threads": 30,
  "queue_size": 0, "msgs_total": 1340, "msgs_per_sec": 21.5,
  "bytes_total": 480000, "cpu_percent": 12.4, "mem_mb": 58.2
}
```

`connected` cuenta usuarios de chat, excluye administradores; `threads` incluye
todos los hilos activos del proceso y `queue_size` mide la cola de entrada del
chat. `msgs_total` y `bytes_total` acumulan mensajes autenticados de tipo
`broadcast`, `private_message`, `group_message` o `file` y sus bytes JSON UTF-8
originales, incluidos los que después se rechacen por archivo o destino
inválido. No
cuentan login, registro, suscripción ni envíos del monitor. `msgs_per_sec`
corresponde al intervalo de muestreo, y los totales comienzan en cero al arrancar.

`cpu_percent` mide CPU del proceso y puede superar 100 si utiliza varios
núcleos. Con `psutil` opcional, `mem_mb` es RSS actual en MiB; con la biblioteca
estándar se usa CPU de `time.process_time()` y RSS máximo de `resource.getrusage`.
En plataformas sin `resource` ni `psutil`, la memoria se informa como 0.
Las tasas reflejan la última muestra; los demás contadores se consultan al
crear cada mensaje, por lo que el snapshot no es una transacción global.

Los logs se escriben en consola y en `logs/server.log` relativo a la raíz del
proyecto. `CHAT_LOG_DIR` permite cambiar ese directorio (usado por las pruebas).

## Notas para el frontend

- Todo el ciclo de vida se maneja con un solo `WebSocket` abierto por sesión
  (ver `newfront/miapp/src/services/socket.js`).
- No hay que reconectar entre mensajes: se registra o inicia sesión usando el
  mismo socket y, solo después de un `login_result` exitoso, se envían mensajes
  de chat.
- Los mensajes `broadcast`, `private_message`, `group_message` y `file` requieren
  autenticación.
- El límite implementado de archivos es 5 MiB decodificados; la conexión se
  cierra si su cola de salida de 1000 mensajes se llena.
- Cualquier campo nuevo que se necesite (por ejemplo para salas privadas a
  futuro) debe agregarse aquí primero para que ambos lados sepan qué esperar.
