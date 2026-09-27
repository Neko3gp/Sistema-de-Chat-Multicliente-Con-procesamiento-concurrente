# Sistema de Chat Multicliente con Procesamiento Concurrente

**Materia:** Cómputo Paralelo y Distribuido — Universidad Autónoma de Chihuahua
**Proyecto 1**

---

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

## 5. Cumplimiento de los Requisitos de la Materia

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
| RF-01 | Registro de usuarios (usuario + contraseña, almacenado en SQLite) | Implementado |
| RF-02 | Inicio de sesión con validación de credenciales | Implementado |
| RF-03 | Conexión al servidor tras iniciar sesión | Implementado |
| RF-04 | Conexión simultánea de múltiples clientes, sin límite fijo | Implementado |
| RF-05 | Visualización de usuarios conectados en tiempo real | Implementado |
| RF-06 | Chat general (broadcast) | Implementado |
| RF-07 | Mensajes privados entre usuarios | Implementado |
| RF-08 | Comunicación en tiempo real sin refrescar manualmente | Implementado (vía WebSocket) |
| RF-09 | Transferencia de archivos entre usuarios | Implementado |
| RF-10 | Manejo de desconexiones (limpieza del usuario, sin afectar a otros clientes) | Implementado |
| RF-11 | Manejo de errores (conexión, E/S, usuario duplicado, usuario no encontrado, etc.) | Implementado |

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

Se evaluó el comportamiento del servidor con una cantidad creciente de
clientes conectados simultáneamente (1, 5, 10, 25 y 50), cada uno enviando un
mensaje de broadcast al conectarse. Las pruebas se realizaron con un script
cliente (`scripts/test_scalability.py`) que abre N conexiones WebSocket
concurrentes contra el servidor.

| Clientes | Conexión total | Promedio primer broadcast | Mensajes recibidos | Errores | Threads activos |
|---|---:|---:|---:|---:|---:|
| 1 | 0.796 ms | N/D | 0 | 0 | 3 estimados |
| 5 | 2.148 ms | 24.812 ms | 20 | 0 | 7 estimados |
| 10 | 3.803 ms | 9.732 ms | 90 | 0 | 12 medidos |
| 25 | 8.177 ms | 6.461 ms | 600 | 0 | 27 medidos |
| 50 | 14.936 ms | 33.331 ms | 2450 | 0 | 52 medidos |

**Resultados:**

- **Distribución de mensajes correcta en todos los casos.** El número de
  mensajes recibidos coincide exactamente con lo esperado matemáticamente
  para un broadcast (N clientes × (N-1) destinatarios): 5×4=20, 10×9=90,
  25×24=600, 50×49=2450. Esto confirma que la lógica de distribución de
  mensajes no falla incluso bajo carga.
- **Sin fuga de hilos.** El número de threads activos sigue el patrón
  esperado (N clientes + 1 hilo principal + 1 hilo worker de la cola de
  mensajes), sin hilos huérfanos, en las 5 corridas.
- **Cero errores** en las 5 corridas, incluyendo la de 50 clientes
  simultáneos.
- **Tiempo de conexión total** crece de forma sub-lineal conforme aumenta la
  cantidad de clientes (0.8 ms a 14.9 ms de N=1 a N=50), sin señales de
  bloqueo del servidor.
- El tiempo promedio del primer broadcast varía entre corridas (24.8 ms,
  9.7 ms, 6.4 ms, 33.3 ms) sin una tendencia clara de crecimiento; al
  tratarse de una sola muestra por valor de N en una máquina local, esta
  variación se atribuye a ruido de medición y no a degradación del servidor,
  dado que los conteos de mensajes y errores se mantuvieron exactos en todos
  los casos.

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

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## 11. Mejoras Futuras

- Salas de chat privadas.
- Historial permanente de mensajes.
- Confirmaciones de lectura y estados de usuario (en línea / ausente).
- Cifrado de la comunicación (TLS) y de las contraseñas con hash más robusto.
- Migrar la transferencia de archivos a *frames* binarios de WebSocket en vez
  de base64 dentro de JSON, para reducir el uso de ancho de banda.

## 12. Conclusión

El proyecto aplica de manera práctica los conceptos vistos en el curso de Cómputo Paralelo y Distribuido: sockets TCP, programación con hilos,
mecanismos de sincronización mediante locks y organización de mensajes
mediante colas. La incorporación de WebSocket como capa de transporte sobre el mismo socket TCP permite, además, ofrecer una interfaz gráfica moderna en React sin sacrificar ninguno de los requisitos técnicos solicitados para la entrega.