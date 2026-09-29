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
- Permitir login web de `admin` y mostrar el panel React de monitoreo

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
- `frontend/miapp/src/services/socket.js` (`sendUpdateProfile`)
- `frontend/miapp/src/App.jsx`
- `frontend/miapp/src/pages/Profile.jsx`
- `frontend/miapp/src/pages/Home.jsx`
- `frontend/miapp/src/components/Sidebar.jsx`
- `frontend/miapp/src/components/Message.jsx`
- `frontend/miapp/src/components/FileMessage.jsx`

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
- `frontend/miapp/src/utils/session.js`
- `frontend/miapp/src/services/socket.js` (cierre silencioso al reconectar)
- `frontend/miapp/src/App.jsx`
- `frontend/miapp/src/App.css` (banner)

### Backend
Sin cambios de protocolo: se reutiliza el mismo `login` al reconectar.

---

## 4. Estados de mensaje, no leídos y notificaciones

### Objetivo
Saber si un mensaje propio está **no enviado / enviado / visto**, y enterarte
cuando llega un mensaje de otro chat (o al salir / cerrar la app sin abrirlo).

### Backend
- Nuevo tipo del cliente:
  ```json
  { "type": "read_receipt", "chat": "user02" }
  ```
  `chat: null` (o `"broadcast"`) = sala general.
- Reenvío:
  - Privado → solo al peer:
    `{ "type": "read_receipt", "from": "<lector>", "chat": "<lector>" }`
  - Sala general → broadcast a los demás con `chat: null`
- No altera `broadcast` / `private_message` / `file`

Archivos back:
- `backend/client_handler.py`
- `docs/PROTOCOLO_MENSAJES.md`

### Frontend — estados (ticks)
- `✓` (una) → mensaje enviado; el destinatario **no** está conectado (queda en historial)
- `✓✓` gris → destinatario **conectado**, le llegó, aún **no** lo abrió
- `✓✓` azul → conectado, le llegó y **abrió el chat** (`read_receipt`)
- `!` → no salió por el socket
- Si el destinatario se conecta después, los `✓` de ese chat pasan a `✓✓` gris
- Al abrir el chat se marca leído y se manda `read_receipt`

### Frontend — bandeja y badges
- Campana en la sidebar con contador total
- Badge numérico por chat en la lista
- Panel de notificaciones: quién escribió y preview; toque abre ese chat
- “Marcar leídas” limpia contadores
- Si estás **viendo** ese chat (desktop siempre visible; móvil con chat abierto),
  **no** suma no leído y sí manda recibo de lectura
- Si estás en **otro** chat o en la **lista** (móvil), sí cuenta como no leído

### Frontend — toast emergente (arriba)
- Aparece solo cuando el mensaje **no** es del chat que estás viendo
- Muestra: foto/iniciales, nombre, preview truncado con `…`
- Fondo liquid glass; animación de bajada
- Toque → abre ese chat; × o ~5 s → se cierra
- Convive con la campana (el toast es el aviso inmediato; la bandeja el historial)

### Persistencia
- No leídos y items de bandeja en `localStorage` por usuario (`unreadStore`)
- Si sales de la app y vuelves a entrar con la misma cuenta, sigues viendo
  qué no habías abierto

Archivos front:
- `frontend/miapp/src/components/MessageStatus.jsx`
- `frontend/miapp/src/components/IncomingToast.jsx`
- `frontend/miapp/src/components/NotificationTray.jsx`
- `frontend/miapp/src/utils/messageStatus.js`
- `frontend/miapp/src/utils/unreadStore.js`
- `frontend/miapp/src/services/socket.js` (`sendReadReceipt`)
- `frontend/miapp/src/App.jsx`, `App.css`, `Sidebar.jsx`, `Home.jsx`

---

## 5. Botón +: nuevo mensaje y nuevo grupo

### Objetivo
El FAB `+` ya no abre solo un input de texto: menú con **Nuevo mensaje** o
**Nuevo grupo**, usando usuarios reales de SQLite.

### Backend
- Directorio de cuentas registradas (sin admins; excluye al solicitante):
  ```json
  { "type": "list_directory" }
  ```
  Respuesta:
  ```json
  {
    "type": "directory",
    "users": [
      { "username": "Ana", "avatarUrl": "", "description": "Hola" }
    ]
  }
  ```
- Mensaje de grupo (el grupo se crea en el cliente; el server solo reparte):
  ```json
  {
    "type": "group_message",
    "groupId": "abc-123",
    "groupName": "Equipo frontend",
    "members": ["Ana", "Carlos"],
    "message": "Reunión a las 5"
  }
  ```
  El servidor añade `from` y reenvía a cada miembro conectado (excepto el emisor).

Archivos back:
- `backend/database.py` (`list_directory_users`)
- `backend/client_handler.py` (`list_directory`, `group_message`)
- `docs/PROTOCOLO_MENSAJES.md`

### Frontend
- Menú Crear → Nuevo mensaje / Nuevo grupo
- Nuevo mensaje: lista + búsqueda sobre el directorio; al elegir se abre el chat
- Nuevo grupo: nombre + multi-selección de integrantes; aparece en la sidebar
- Grupos custom persistidos en `localStorage` (`localChats.customGroups`)
- Si te llega un `group_message` de un grupo nuevo, se añade solo a tu lista

Archivos front:
- `frontend/miapp/src/components/ComposeMenu.jsx`
- `frontend/miapp/src/components/NewMessageDialog.jsx`
- `frontend/miapp/src/components/NewGroupDialog.jsx`
- `frontend/miapp/src/utils/localChats.js`
- `frontend/miapp/src/services/socket.js` (`requestDirectory`, `sendGroupMessage`)
- `frontend/miapp/src/App.jsx`, `App.css`, `Sidebar.jsx`, `Home.jsx`

---

## 6. Archivos que “se enviaban” pero no llegaban

### Problema
En sala general el front mandaba `file` sin `to`, pero el back solo trataba bien
el privado. Además, archivos grandes llegaban en **varios frames** WebSocket y
el server fallaba con `invalid_json` al parsear un fragmento a medias.

### Backend
- `file` **sin** `to` (o vacío) → broadcast a la sala (como texto general)
- `file` **con** `to` → solo a ese usuario (o `user_not_found`)
- Lectura WebSocket reensambla mensajes fragmentados antes del JSON

Archivos back:
- `backend/client_handler.py` / cola (`process_message` para `file`)
- `backend/websocket_handler.py` (reensamblado de frames)

### Frontend
- Sala general: `sendFile(null, …)` (sin `to`)
- Privado: `sendFile(usuario, …)`
- UI: menú de tipo de archivo inline; nombres largos con ellipsis

---

## 7. Conexión desde el teléfono / PWA (puerto y host)

### Problema
En Mac el puerto **5000** suele estar ocupado (AirPlay). `localhost` en el
celular apunta al propio teléfono, no a la PC. El teclado en PWA empujaba el
layout y “desaparecía” el contacto.

### Ajustes
- Servidor típico de desarrollo: `--port 5001` / `CHAT_PORT=5001`
- Front: `VITE_WS_PORT` (default `5001`) y host = `window.location.hostname`
  (o `VITE_WS_URL` completo en `.env`)
- Viewport: `interactive-widget=overlays-content` + sync de altura
  (`visualViewport`) para que el chat no salte al abrir el teclado

Archivos:
- `frontend/miapp/src/services/socket.js`
- `frontend/miapp/.env.example`
- `frontend/miapp/index.html`
- `frontend/miapp/src/utils/viewport.js`
- `README.md` (arranque / LAN)

### Backend
Sin cambio de protocolo; solo host/puerto de escucha.

---

## 8. Lista de chats e historial persistente

### Decisión
La lista de contactos, grupos y perfiles sigue guardándose en el navegador para
conservar la organización local. Los mensajes ahora también se persisten en
SQLite para que los destinatarios desconectados los recuperen al volver a
iniciar sesión.

### Frontend
- `localStorage` (`localChats`): `chatUsers`, `contacts`, luego también
  `customGroups`
- Al login se restauran; al usar la app se van guardando
- El historial recibido se carga después del login mediante el evento `history`

Archivos front:
- `frontend/miapp/src/utils/localChats.js`
- `frontend/miapp/src/App.jsx`

### Backend
SQLite guarda usuarios, perfiles e historial de mensajes. Se conservan los
últimos 500 mensajes visibles por usuario.

---

## Resumen

| Cambio | Front | Back |
|---|---|---|
| Auth + chat real | Conecta y consume el protocolo | Endpoints/mensajes de chat |
| Foto y descripción públicas | Envía `update_profile`, pinta `profiles` | Persiste en SQLite y difunde en `user_list` |
| Sesión estable ~1 h | Guarda sesión, reconecta sola al caer el WS | Mismo `login` al reenganchar |
| Estados + notis (bandeja + toast) | Ticks, badges, campana, toast glass; `read_receipt` | Reenvía `read_receipt` |
| Nuevo mensaje / nuevo grupo | Menú +, directorio, grupos locales | `list_directory` / `directory`, `group_message` |
| Archivos sala + grandes | `file` sin/`con` `to` | Broadcast sin `to` + reensamble WS |
| Teléfono / PWA | Hostname + `VITE_WS_PORT`, viewport | Escucha en `5001` / LAN |
| Chats e historial | `localChats` y estado de mensajes en el front | `chat_messages` en SQLite + `history` al login |
