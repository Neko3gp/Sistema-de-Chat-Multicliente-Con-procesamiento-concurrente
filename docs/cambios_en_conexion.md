# Cambios nuevos: front ↔ backend

Cambios recientes donde el frontend y el backend tuvieron que coordinarse
(mismo protocolo). No incluye solo UI ni solo scripts de prueba.

---

## 1. Chat real (auth, lista, mensajes)

El front dejó de usar el modo demo y habla con el servidor por WebSocket.

### Backend (ya existía / se consumió)
- `login` / `register` → `login_result` / `register_result`
- `user_list` con nombres de usuarios conectados
- `broadcast`, `private_message`, `file`
- `error` con `reason`

### Frontend (nuevo cableado)
- Login/registro reales (`socket.js` + `App.jsx`)
- Pintar sala general, privados y lista online desde `user_list`
- Enviar mensajes/archivos por el socket
- Mostrar errores del servidor en la UI
- Rechazar login web de `admin` (monitor queda en CLI)

### Contrato
Ver `docs/PROTOCOLO_MENSAJES.md` (tipos de mensaje de chat).

---

## 2. Fotos de perfil y descripción (compartidas)

Antes la foto solo vivía en el navegador. Ahora se guarda en SQLite y la ven
todos los clientes conectados.

### Backend
- Tabla `users`: columnas `avatar_url` y `description`
- Mensaje nuevo del cliente:
  ```json
  {
    "type": "update_profile",
    "avatarUrl": "https://ejemplo.com/foto.jpg",
    "description": "Texto corto"
  }
  ```
- Respuesta:
  ```json
  {
    "type": "profile_result",
    "ok": true,
    "reason": null,
    "avatarUrl": "https://ejemplo.com/foto.jpg",
    "description": "Texto corto"
  }
  ```
- `user_list` ampliado (sin romper `users` como lista de strings):
  ```json
  {
    "type": "user_list",
    "users": ["user01", "user02"],
    "profiles": {
      "user01": { "avatarUrl": "...", "description": "..." },
      "user02": { "avatarUrl": "", "description": "" }
    }
  }
  ```
- `login_result` incluye `avatarUrl` y `description` del usuario
- Reglas: avatar solo `http://` o `https://`; descripción máx. 140 caracteres
- El correo **no** va al servidor ni a otros usuarios

Archivos back:
- `backend/database.py`
- `backend/client_handler.py`
- `backend/connection_manager.py`
- `docs/PROTOCOLO_MENSAJES.md`

### Frontend
- Al guardar perfil se envía `update_profile`
- Con `profiles` de `user_list` se actualizan contactos
- La foto aparece en lista de chats, cabecera, burbujas y ficha de contacto
- Usuario de sesión no se renombra desde la UI (lo fija el login)

Archivos front:
- `newfront/miapp/src/services/socket.js` (`sendUpdateProfile`)
- `newfront/miapp/src/App.jsx`
- `newfront/miapp/src/pages/Profile.jsx`
- `newfront/miapp/src/pages/Home.jsx`
- `newfront/miapp/src/components/Sidebar.jsx`
- `newfront/miapp/src/components/Message.jsx`
- `newfront/miapp/src/components/FileMessage.jsx`

---

## 3. Sesión que se cerraba a cada rato

### Problema
Al caerse el WebSocket (red, PWA, sleep del celular, reinicio breve del
servidor), el front trataba `connection_closed` como fin de sesión y mandaba
otra vez a la pantalla de login. Había que volver a escribir usuario y
contraseña con demasiada frecuencia.

### Solución (front)
- Sesión local de **1 hora** (`localStorage`, clave `chat-session`) con usuario
  y contraseña necesarios para rehacer el `login` del protocolo (no hay tokens).
- La ventana de 1 hora se **renueva** mientras hay actividad (mensajes,
  `user_list`, etc.).
- Si el socket se cierra y la sesión sigue vigente: **reconexión automática** +
  nuevo `login`, sin limpiar el chat ni pedir credenciales.
- Banner “Reconectando sesión…” durante el reintento.
- Al recargar la app, si la sesión no expiró, entra sola.
- “Cerrar sesión” limpia la sesión y no reconecta.
- Tras 1 hora sin renovar, sí pide login de nuevo.

Archivos front:
- `newfront/miapp/src/utils/session.js`
- `newfront/miapp/src/services/socket.js` (cierre silencioso al reconectar)
- `newfront/miapp/src/App.jsx`
- `newfront/miapp/src/App.css` (banner)

### Backend
Sin cambios de protocolo: se reutiliza el mismo `login` al reconectar.

---

## Resumen

| Cambio | Front | Back |
|---|---|---|
| Auth + chat real | Conecta y consume el protocolo | Endpoints/mensajes de chat |
| Foto y descripción públicas | Envía `update_profile`, pinta `profiles` | Persiste en SQLite y difunde en `user_list` |
| Sesión estable ~1 h | Guarda sesión, reconecta sola al caer el WS | Mismo `login` al reenganchar |
