# Protocolo de mensajes (contrato frontend ↔ backend)

Transporte: **WebSocket** (`ws://<host>:5000`). Todo mensaje es un objeto JSON
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

El archivo decodificado puede pesar como máximo **5 MiB (5 242 880 bytes)**.
Si supera ese límite, se responde `{"type":"error","reason":"file_too_large"}`
sin reenviar el archivo. Si `data` falta o no contiene base64 válido, se responde
`{"type":"error","reason":"invalid_message"}`.

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
{ "type": "user_list", "users": ["Usuario1", "Usuario2", "Usuario3"] }
```

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
{ "type": "login_result", "ok": true, "reason": null, "role": "user" }
```

El login correcto incluye `role`, con valor `user` o `admin` según la cuenta
almacenada en SQLite. El registro web crea cuentas `user`; enviar un campo
`role` desde el cliente no permite elegir privilegios. `reason` conserva su
valor `null` en respuestas exitosas. El aislamiento del administrador y sus
mensajes de monitoreo se implementarán en T5.

Si las credenciales no son válidas:

```json
{ "type": "login_result", "ok": false, "reason": "invalid_credentials" }
```

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
`authentication_required`, `invalid_message`, `message_too_large`, `file_too_large`,
`already_connected`.

Cada conexión tiene una cola de salida de hasta 1000 mensajes y un escritor
exclusivo. Si la cola se llena, se cierra esa conexión y se actualiza `user_list`;
no se garantiza entregar mensajes pendientes ni un error antes del cierre.

## Notas para el frontend

- Todo el ciclo de vida se maneja con un solo `WebSocket` abierto por sesión
  (ver `frontend/src/services/socket.js`).
- No hay que reconectar entre mensajes: se registra o inicia sesión usando el
  mismo socket y, solo después de un `login_result` exitoso, se envían mensajes
  de chat.
- Los mensajes `broadcast`, `private_message` y `file` requieren autenticación.
- Los tamaños máximos y las validaciones de campos se implementarán en el
  backend y deben reflejarse aquí cuando queden definidos.
- Cualquier campo nuevo que se necesite (por ejemplo para salas privadas a
  futuro) debe agregarse aquí primero para que ambos lados sepan qué esperar.
