# Backend — Chat Multicliente (Cómputo Paralelo y Distribuido)


## 1. Decisión de arquitectura

- **Transporte:** WebSocket implementado a mano sobre `socket.AF_INET` + `SOCK_STREAM`.
  No usamos ninguna librería externa de WebSocket: el handshake y los frames se
  codifican/decodifican manualmente en `websocket_handler.py`. Esto nos permite
  cumplir literalmente los requisitos del profe (sockets TCP, threading, locks,
  queue) **y** que React se pueda conectar directo con `new WebSocket(...)`.
- **Concurrencia:** un `threading.Thread` por cliente conectado (sin límite fijo).
- **Sincronización:** `threading.Lock` sobre el diccionario de clientes conectados.
- **Cola de mensajes:** `queue.Queue` + un hilo worker que procesa y reenvía.
- **Persistencia:** SQLite, solo para usuarios (`username`, `password_hash`).
- **Formato de mensajes:** JSON con un campo `type`. Contrato completo en
  [`PROTOCOLO_MENSAJES.md`](./PROTOCOLO_MENSAJES.md) — es lo que el frontend
  necesita para poder trabajar en paralelo sin esperarte.

## 2. Estructura de archivos que vas a trabajar

```
backend/
├── main.py                 # arranca el servidor
├── tcp_server.py           # socket, accept loop, crea un thread por cliente
├── websocket_handler.py    # handshake + encode/decode de frames WebSocket
├── client_handler.py       # lógica de cada hilo de cliente + procesamiento de mensajes
├── connection_manager.py   # dict de clientes conectados + Lock
├── message_queue_manager.py# Queue + hilo worker
├── database.py             # SQLite: init, crear usuario, verificar usuario
└── requirements.txt        # (vacío — todo es librería estándar de Python)
```

Este documento describe el estado del esqueleto y las tareas que deben
completarse antes de considerar el backend terminado. La base permite que el
frontend avance en paralelo, pero las funciones marcadas como pendientes no
deben presentarse como implementadas.

## 3. Pasos a seguir, en orden

1. **Probar el esqueleto tal cual está.**
   `cd backend && python main.py` — debe levantar el servidor en el puerto 5000
   sin errores y crear `chat.db` automáticamente.
2. **Probar el handshake WebSocket** con un cliente mínimo (puede ser la consola
   del navegador): `new WebSocket("ws://localhost:5000")` — debe abrir la
   conexión sin error.
3. **Implementar registro/login real** (`RF-01`, `RF-02`): `database.py` ya
   contiene `create_user` / `verify_user`, pero `client_handler.py` todavía no
   valida la contraseña. También debe bloquear mensajes antes del login,
   rechazar usuarios duplicados y devolver respuestas consistentes.
4. **Broadcast y mensajes privados** (`RF-06`, `RF-07`): ya está la lógica base
   en `process_message`. Prueba con dos o más conexiones simultáneas.
5. **Lista de usuarios conectados** (`RF-05`): la base ya genera un mensaje
   `"user_list"`; falta integrarlo con el frontend y verificar los casos de
   entrada, salida y desconexión inesperada.
6. **Manejo de desconexión** (`RF-10`): ya está el `finally` en
   `client_handler.py` que limpia al usuario del `ConnectionManager`; falta
   notificar correctamente a los demás clientes y evitar que una conexión
   antigua elimine una sesión nueva con el mismo usuario.
7. **Transferencia de archivos** (`RF-09`): decide si se manda como frames
   binarios de WebSocket (opcode `0x2`, no implementado todavía en
   `websocket_handler.py`) o codificado en base64 dentro de un mensaje JSON
   (más simple de implementar, un poco más pesado en tráfico). Para el
   alcance del proyecto, base64 dentro de JSON es más que suficiente.
8. **Manejo de errores** (`RF-11`): revisa cada `try/except` existente y agrega
   los que falten (usuario duplicado al registrar, usuario no encontrado al
   mandar mensaje privado, etc.). El objetivo es que un error de un cliente
   nunca tumbe el servidor ni afecte a los demás.
9. **Pruebas de escalabilidad**: escribe un script simple que abra N conexiones
   WebSocket falsas (puede ser en Python con `websockets` client, o varias
   pestañas del navegador) y mide cuántos threads activos hay y el tiempo de
   respuesta. El profe pide probar con 1, 5, 10, 25 y 50 clientes.

10. **Preparar la salida concurrente por cliente**: actualmente el worker y los
   hilos de cliente pueden intentar escribir en el mismo socket. Añade una
   cola o un lock de salida por conexión para evitar frames mezclados y aislar
   clientes lentos.

11. **Completar validaciones del protocolo**: establece límites de tamaño para
   mensajes y archivos, valida campos y tipos, y devuelve errores para JSON
   inválido, payload excesivo y tipos de mensaje desconocidos.

## 4. Cómo correr el backend localmente

```bash
cd backend
python main.py
```

No hay dependencias externas — todo usa la librería estándar de Python
(`socket`, `threading`, `queue`, `sqlite3`, `hashlib`, `base64`, `struct`).

## 5. Qué debe saber el frontend dev

Todo lo que necesita para empezar a trabajar sin depender de que termines el
backend está en:

- [`PROTOCOLO_MENSAJES.md`](./PROTOCOLO_MENSAJES.md) — formato exacto de cada
  tipo de mensaje JSON.
- `frontend/src/services/socket.js` — ejemplo mínimo de conexión WebSocket
  desde React, ya compatible con este backend.

Con eso puede construir toda la interfaz contra un mock/simulación mientras tú
terminas la lógica real del servidor, y el día que ambas partes estén listas
solo se conectan sin sorpresas.
