# Estado y pendientes reales del backend

Este documento reemplaza la lista histórica de tareas del esqueleto inicial.
Las funciones descritas como implementadas deben comprobarse contra el código y
las pruebas enlazadas; no deben volver a tratarse como trabajo pendiente.

## Implementado

- Socket TCP y WebSocket manual.
- Un hilo lector y un escritor exclusivo por conexión.
- `queue.Queue` para procesar mensajes y colas de salida por cliente.
- Locks para sesiones y rechazo de logins duplicados.
- Registro, login, roles `user`/`admin` y PBKDF2-SHA256.
- Perfiles públicos en SQLite.
- Broadcast, privados, grupos y transferencia de archivos.
- Historial persistente de mensajes en SQLite, incluidos mensajes para usuarios
  desconectados.
- Logs técnicos, `MonitorHub`, estadísticas y eventos para administradores.
- Configuración de host, puerto, base y logs mediante argumentos o entorno.
- Validación base64 y límite de archivos de 5 MiB.
- Pruebas de concurrencia, base de datos, logs, monitor, regresión y carga.

## Pendientes opcionales

Estos puntos no son necesarios para cumplir el enunciado actual:

- TLS para conexiones fuera de una red de demostración.
- Rotación y retención automática de `logs/server.log`.
- Compresión o almacenamiento externo de archivos para reducir el tamaño de
  SQLite.
- Paginación del historial para conversaciones muy extensas.
- Recuperación de contraseña y administración de cuentas.
- Pruebas automatizadas de navegador para la interfaz React.

## Regla de mantenimiento

Cuando se agregue una capacidad del protocolo, actualizar primero
[`PROTOCOLO_MENSAJES.md`](PROTOCOLO_MENSAJES.md), después las pruebas y por
último el README. No usar este archivo para registrar resultados de medición;
esos resultados pertenecen a `RESULTADOS_FINALES.md` o a la validación que
corresponda.
