# Matriz de requisitos del proyecto

Esta matriz traduce el enunciado del Proyecto 1 a componentes verificables del
repositorio. `Implementado` significa que existe código y evidencia; no implica
que el sistema sea un producto de producción.

## 1. Servidor de chat

| Requisito | Estado | Evidencia |
| --- | --- | --- |
| Aceptar múltiples conexiones simultáneas | Implementado | `backend/tcp_server.py`, `backend/client_handler.py` |
| Gestionar envío y recepción | Implementado | `backend/client_handler.py`, `backend/message_queue_manager.py` |
| Broadcast y destinatario correcto | Implementado | `ConnectionManager.broadcast`, `process_message` |
| Mensajes privados | Implementado | `private_message` en el protocolo y pruebas de regresión |
| Grupos | Implementado | `group_message` y grupos persistidos en el cliente |

## 2. Cliente de chat

| Requisito | Estado | Evidencia |
| --- | --- | --- |
| Conectarse y enviar/recibir en tiempo real | Implementado | React, cliente CLI y WebSocket manual |
| Interfaz para escribir y visualizar | Implementado | `frontend/miapp/src/pages/Home.jsx` |
| Transferencia de archivos | Implementado | Base64, límite de 5 MiB y `file` |
| Historial de chats | Implementado | SQLite, evento `history` y recuperación al login |

## 3. Procesamiento paralelo

| Requisito | Estado | Evidencia |
| --- | --- | --- |
| Usar hilos o procesos | Implementado | `threading.Thread` por conexión y workers |
| Aceptar conexiones sin bloquearse | Implementado | `accept()` crea hilos independientes |
| Comparar hilos y procesos | Implementado | `docs/HILOS_VS_PROCESOS.md` |

El servidor de producción usa hilos porque el trabajo principal es I/O y porque
el requisito académico pide `threading`. El uso de procesos se mide en un
microbenchmark de eco, no se presenta como la arquitectura del chat completo.

## 4. Comunicación en red

| Requisito | Estado | Evidencia |
| --- | --- | --- |
| Utilizar sockets | Implementado | `socket.AF_INET` + `socket.SOCK_STREAM` |
| Utilizar TCP fiable | Implementado | WebSocket manual sobre TCP |
| Permitir conexión LAN | Implementado | `--host`, `--port`, `CHAT_HOST`, `CHAT_PORT` |

WebSocket no sustituye a TCP: es la capa de framing que permite que el
navegador use el mismo socket TCP del servidor.

## 5. Sincronización y seguridad

| Requisito | Estado | Evidencia |
| --- | --- | --- |
| Evitar race conditions | Implementado | Locks en `ConnectionManager` |
| Usar mecanismos de bloqueo | Implementado | `threading.Lock` y colas de salida |
| No mezclar escrituras concurrentes | Implementado | Un escritor exclusivo por conexión |
| Autenticación | Implementado | SQLite, roles y PBKDF2-SHA256 |
| Rechazar sesiones duplicadas | Implementado | Error `already_connected` |
| Aislar administradores | Implementado | `MonitorHub`, permisos `forbidden` |
| Administración de usuarios y grupos | Implementado | Pestañas admin, SQLite y mensajes `admin_*` |

## 6. Escalabilidad y rendimiento

| Requisito | Estado | Evidencia |
| --- | --- | --- |
| Manejar muchos clientes | Implementado y medido | `scripts/test_load.py`, prueba T10 |
| Medir rendimiento | Implementado | RTT, entregas, CPU, memoria e hilos |
| Ajustar arquitectura | Implementado | Colas, escritores exclusivos y validación por bloques |

La prueba final corresponde a un entorno local concreto. Sus resultados no
garantizan el mismo rendimiento en otra red o hardware.

## 7. Consideraciones adicionales

| Requisito | Estado | Evidencia |
| --- | --- | --- |
| Manejo de errores | Implementado | JSON inválido, archivos, permisos, desconexiones y destinos |
| Extensibilidad | Implementado | Módulos separados, protocolo documentado y SQLite migrable |
| Interfaz gráfica | Implementado | React + Vite |

## 8. Revisión específica del centro de monitoreo

El centro cumple los requisitos de observabilidad necesarios para demostrar el
servidor concurrente:

- muestra conexiones activas y excluye administradores de los usuarios de chat;
- muestra hilos activos, cola de mensajes, mensajes por segundo, CPU y memoria;
- conserva un snapshot inicial, eventos en vivo y hasta 200 entradas de log;
- permite filtrar eventos por tipo, usuario o detalle y pausar la lista;
- mantiene el monitor aislado del chat y protege sus operaciones con el rol
	`admin`;
- permite administrar usuarios y grupos desde pestañas separadas, sin exponer
	esas operaciones a cuentas normales.

La información del monitor es operacional y acotada: no sustituye un sistema de
logs persistentes de auditoría ni una herramienta de métricas de producción.

## 9. Fuera de alcance

TLS, recuperación de contraseña, moderación, alta disponibilidad, almacenamiento
externo de archivos y despliegue productivo no forman parte del Proyecto 1.
