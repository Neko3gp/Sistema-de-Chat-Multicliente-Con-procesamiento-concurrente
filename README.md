# Sistema de Chat Multicliente con Procesamiento Concurrente

> **Estado actual:** esqueleto de integración. La arquitectura del backend y
> el contrato WebSocket están preparados para que el frontend avance en
> paralelo, pero autenticación completa, interfaz React, archivos y pruebas de
> carga siguen pendientes.


## 1. Descripción General

Este proyecto implementa una aplicación de chat que permite la comunicación en
tiempo real entre múltiples usuarios conectados simultáneamente. El servidor
está desarrollado en Python utilizando **sockets TCP** y **programación con
hilos (threading)**, aplicando directamente los conceptos vistos durante el
curso: sockets, threads, mecanismos de sincronización (locks) y colas
(`queue.Queue`). La interfaz gráfica está desarrollada en **React con JSX**.

Cada cliente que se conecta es atendido por un hilo independiente, creado
dinámicamente por el servidor, sin que exista una cantidad fija de usuarios
definida en el código.

## 2. Objetivos

### Objetivo general
Desarrollar una aplicación de chat multicliente que permita la comunicación en
tiempo real entre múltiples usuarios, utilizando sockets TCP, programación con
hilos y mecanismos de sincronización en Python.

### Objetivos específicos
- Implementar un servidor en Python capaz de atender múltiples clientes de
  forma concurrente.
- Utilizar sockets TCP para la comunicación de red.
- Crear dinámicamente un hilo por cada cliente conectado.
- Permitir el envío de mensajes generales (broadcast) y privados.
- Implementar transferencia de archivos entre usuarios.
- Utilizar `threading.Lock` para proteger recursos compartidos entre hilos.
- Utilizar `queue.Queue` para organizar el procesamiento de mensajes.
- Desarrollar una interfaz gráfica en React.
- Evaluar el comportamiento del servidor con distintas cantidades de clientes
  simultáneos.

## 3. Tecnologías Utilizadas

| Componente | Tecnología |
|---|---|
| Servidor | Python |
| Comunicación de red | Módulo `socket` de Python (TCP) |
| Concurrencia | `threading.Thread` |
| Sincronización | `threading.Lock` |
| Cola de mensajes | `queue.Queue` |
| Persistencia de usuarios | SQLite |
| Interfaz gráfica | React (JavaScript + JSX) |
| Transporte cliente-servidor | WebSocket (implementado manualmente sobre el mismo socket TCP) |

## 4. Arquitectura General

### 4.1 Por qué se agrega WebSocket sobre el socket TCP

El curso pide explícitamente el uso de `socket` + `threading` para la
comunicación entre cliente y servidor. Sin embargo, la interfaz gráfica se
desarrolla en React, que corre dentro de un navegador — y un navegador, por
diseño y por seguridad, **no puede abrir sockets TCP crudos**; únicamente
puede comunicarse mediante HTTP o WebSocket.

Para resolver esto sin abandonar ni el socket TCP ni el threading que pide la
materia, se implementó el protocolo **WebSocket (RFC 6455) manualmente**,
como una capa delgada sobre el mismo `socket.socket()`:

- El servidor sigue siendo `socket.AF_INET` + `SOCK_STREAM`.
- Sigue creando un `threading.Thread` por cada cliente conectado.
- Solo se le añade, dentro de ese mismo hilo, la lógica de:
  1. Leer el *handshake* inicial (una petición HTTP de actualización de
     protocolo) y responder con el header de aceptación correspondiente.
  2. Leer y escribir los datos en el formato de *frames* que define el
     estándar WebSocket, en lugar de texto plano.

No se utiliza ninguna librería externa para esto (ni `websockets`, ni
`Flask-SocketIO`, ni frameworks como FastAPI): el handshake y los frames se
codifican y decodifican a mano dentro del propio servidor con `hashlib`,
`base64` y `struct`, que son parte de la librería estándar de Python.

**En resumen:** la conexión sigue siendo un socket TCP con un hilo dedicado
por cliente — exactamente lo que pide la materia — solo que ese socket
"habla" el protocolo WebSocket para que el navegador (React) pueda conectarse
directamente con él.

> Se evaluó también la opción de usar **FastAPI**, que trae soporte nativo de
> WebSocket y hubiera simplificado la implementación. Se descartó porque
> FastAPI utiliza `asyncio` (corrutinas) como modelo de concurrencia, y no
> `threading`, que es específicamente el mecanismo de concurrencia visto en
> el curso y solicitado en el planteamiento del proyecto.

### 4.2 Diagrama de arquitectura

```
                    React (JSX)
                        |
                  WebSocket (ws://)
                        |
                        v
              Servidor Python (socket TCP)
                        |
        +---------------+---------------+
        |               |               |
   Thread 1        Thread 2        Thread 3   ...  Thread N
        |               |               |
   Cliente 1       Cliente 2       Cliente 3        Cliente N
        |               |               |
        +---------------+---------------+
                        |
             +----------+----------+
             |                     |
       queue.Queue           threading.Lock
             |                     |
        Mensajes           Protección de
                          recursos compartidos
                       (usuarios conectados)
```

No existe un límite fijo de clientes definido en el código: cada nueva
conexión aceptada por el servidor genera dinámicamente un nuevo hilo.

## 5. Cumplimiento de los Requisitos

| Requisito solicitado | Cómo se cumple |
|---|---|
| Servidor acepta conexiones entrantes de múltiples clientes simultáneamente | `tcp_server.py`: loop `server.accept()` sin límite de iteraciones ni de clientes |
| Gestiona envío y recepción de mensajes entre clientes | `client_handler.py` lee y despacha cada mensaje por cliente |
| Distribuye mensajes al destinatario correcto o a todos (broadcast) | `ConnectionManager.broadcast()` para mensajes generales; `ConnectionManager.get(username)` para mensajes privados |
| Cliente se conecta y envía/recibe en tiempo real | Conexión WebSocket persistente desde React (`services/socket.js`) |
| Interfaz para ingresar mensajes y ver conversaciones | Componentes React: `Chat.jsx`, `MessageInput.jsx`, `Message.jsx` |
| Transferencia de archivos | Mensajes tipo `"file"` con contenido codificado en base64 |
| Uso de hilos (`threading`) para manejar cada conexión de forma independiente | Un `threading.Thread` por cliente, creado dinámicamente en `tcp_server.py` |
| Servidor no se bloquea al atender nuevas conexiones | El `accept()` principal nunca espera a que un cliente termine; cada cliente vive en su propio hilo |
| Comunicación mediante sockets | `socket.AF_INET`, `socket.SOCK_STREAM` en `tcp_server.py` |
| Protocolo TCP para conexiones fiables | Sockets TCP; WebSocket corre sobre la misma conexión TCP, no la reemplaza |
| Sincronización entre hilos para evitar race conditions | `threading.Lock` en `ConnectionManager` al leer/escribir el diccionario de clientes conectados |
| Uso de mecanismos de bloqueo (locks) | Ídem — `with self._lock:` en cada operación sobre clientes conectados |
| Optimización de recursos para muchas conexiones simultáneas | Hilos ligeros por cliente, sin polling; el servidor solo reacciona a eventos de socket |
| Evaluar rendimiento y ajustar arquitectura (hilos vs procesos) | Plan de pruebas con 1, 5, 10, 25 y 50 clientes (ver sección 8) |
| Manejo de excepciones (conexiones interrumpidas, errores de E/S) | `try/except` en `client_handler.py` sobre `ConnectionResetError` y `OSError`; limpieza garantizada en `finally` |
| Extensibilidad (salas privadas, autenticación) | Autenticación con SQLite ya integrada; arquitectura modular preparada para agregar salas privadas a futuro |
| Interfaz de usuario gráfica | Interfaz web desarrollada en React |

## 6. Requerimientos Funcionales

| ID | Requerimiento | Estado |
|---|---|---|
| RF-01 | Registro de usuarios (usuario + contraseña, almacenado en SQLite) | Base implementada; falta validar entradas |
| RF-02 | Inicio de sesión con validación de credenciales | Pendiente; el login actual es provisional |
| RF-03 | Conexión al servidor tras iniciar sesión | Esqueleto implementado |
| RF-04 | Conexión simultánea de múltiples clientes, sin límite fijo | Base implementada |
| RF-05 | Visualización de usuarios conectados en tiempo real | Base de servidor implementada; frontend pendiente |
| RF-06 | Chat general (broadcast) | Base implementada; falta prueba concurrente |
| RF-07 | Mensajes privados entre usuarios | Base implementada; falta completar errores y pruebas |
| RF-08 | Comunicación en tiempo real sin refrescar manualmente | Transporte implementado; frontend pendiente |
| RF-09 | Transferencia de archivos entre usuarios | Contrato definido; integración pendiente |
| RF-10 | Manejo de desconexiones (limpieza del usuario, sin afectar a otros clientes) | Limpieza base implementada; notificaciones pendientes |
| RF-11 | Manejo de errores (conexión, E/S, usuario duplicado, usuario no encontrado, etc.) | Parcial; faltan validaciones y respuestas completas |

## 7. Formato de Mensajes

Toda la comunicación entre cliente y servidor usa mensajes JSON con un campo
`type`. Ejemplos:

```json
{ "type": "login", "username": "Usuario1" }
```

```json
{ "type": "broadcast", "from": "Usuario1", "message": "Hola a todos" }
```

```json
{ "type": "private_message", "from": "Usuario1", "to": "Usuario2", "message": "Hola" }
```

```json
{ "type": "file", "from": "Usuario1", "to": "Usuario2", "filename": "documento.pdf", "data": "<base64>" }
```

El contrato completo de mensajes está documentado en `docs/PROTOCOLO_MENSAJES.md`.

## 8. Pruebas de Escalabilidad

Para evaluar el comportamiento del servidor al aumentar la cantidad de
clientes conectados, se realizarán pruebas progresivas con:

- 1 cliente
- 5 clientes
- 10 clientes
- 25 clientes
- 50 clientes

Durante cada prueba se registrará:
- Número de hilos activos.
- Cantidad de mensajes procesados por la cola.
- Tiempo promedio de respuesta.
- Cantidad de archivos transferidos.
- Errores producidos, si los hay.

## 9. Estructura del Proyecto

```
chat-paralelo/
├── README.md
├── docs/
│   ├── BACKEND_TODO.md
│   └── PROTOCOLO_MENSAJES.md
├── backend/
│   ├── main.py               # punto de entrada del servidor
│   ├── tcp_server.py         # socket TCP + accept loop + creación de threads
│   ├── websocket_handler.py  # handshake y frames WebSocket sobre el socket TCP
│   ├── client_handler.py     # lógica por cliente (login, mensajes, desconexión)
│   ├── connection_manager.py # clientes conectados + threading.Lock
│   ├── message_queue_manager.py # queue.Queue + hilo worker
│   └── database.py           # SQLite: registro y verificación de usuarios
└── frontend/
    └── src/
        ├── components/       # Login, Register, Chat, Sidebar, Message, etc.
        ├── services/socket.js # conexión WebSocket desde React
        ├── App.jsx
        └── main.jsx
```

## 10. Cómo Ejecutar el Proyecto

### Backend
```bash
cd backend
python main.py
```
No requiere dependencias externas: todo el servidor usa la librería estándar
de Python (`socket`, `threading`, `queue`, `sqlite3`, `hashlib`, `base64`,
`struct`).

El servidor escucha en `ws://localhost:5000` y crea `backend/chat.db` al
iniciarse. El handshake puede probarse desde la consola del navegador:

```javascript
const socket = new WebSocket("ws://localhost:5000");
socket.onopen = () => console.log("WebSocket conectado");
socket.onclose = () => console.log("WebSocket cerrado");
```

El login del esqueleto todavía no valida la contraseña. No debe considerarse
listo para producción ni exponerse fuera de un entorno local de desarrollo.

### Frontend
```bash
cd frontend
npm install
npm run dev
```

El directorio frontend contiene actualmente la estructura inicial de React y
los componentes pendientes de implementación. Para trabajar en paralelo, el
frontend puede usar un mock basado en el contrato de
[`docs/PROTOCOLO_MENSAJES.md`](docs/PROTOCOLO_MENSAJES.md).
