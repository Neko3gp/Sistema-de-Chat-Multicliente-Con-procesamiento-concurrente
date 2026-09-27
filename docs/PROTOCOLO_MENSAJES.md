# Protocolo de mensajes (contrato frontend ↔ backend)

Transporte: **WebSocket** (`ws://<host>:5000`). Todo mensaje es un objeto JSON
en texto plano, con un campo `type` obligatorio que indica de qué se trata.

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
{ "type": "login_result", "ok": true, "reason": null }
```

Si las credenciales no son válidas:

```json
{ "type": "login_result", "ok": false, "reason": "invalid_credentials" }
```

### Errores
```json
{ "type": "error", "reason": "username_taken" }
```
Valores posibles de `reason` (agregar más conforme se necesiten):
`username_taken`, `invalid_credentials`, `user_not_found`,
`authentication_required`, `invalid_message`, `message_too_large`.

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
