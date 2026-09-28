# Cambios para el reporte académico

1. **Arquitectura y diagrama.** Sustituir «un único hilo por cliente» por «un
   lector por conexión y un escritor exclusivo por conexión después del
   handshake». Añadir cola de salida de 1000 mensajes y explicar que el worker
   distribuye sin escribir en los sockets. Mantener TCP, WebSocket manual,
   threading, locks, Queue y SQLite. Añadir MonitorHub separado del chat.
   Incorporar la validación base64 por bloques en el lector, la serialización
   de metadatos del archivo y el desenmascarado por tablas como correcciones
   motivadas por la medición de latencia de T10.
2. **Hilos activos.** Usar `2 × (C + A) + 4` en régimen estable, con C usuarios
   y A administradores; para 20 + 1 se esperan 46. Los cuatro son principal,
   queue-worker, monitor-hub y monitor-stats. Considerar conexiones aún sin
   autenticar y handshakes si la medición se toma durante arranque/cierre.
   Copiar la medición real de `RESULTADOS_FINALES.md`; conservar N+2 únicamente
   como descripción histórica de los ensayos anteriores a T2.
3. **Sincronización y errores.** Explicar registro atómico de sesiones,
   rechazo `already_connected`, protección `forbidden`, cierre al saturarse
   la salida y eliminación por identidad de conexión. Mantener errores de
   credenciales, archivos/base64 y destinos inexistentes. El monitor descarta
   sus eventos más antiguos al saturarse para no esperar en el flujo del chat.
4. **Usuarios y persistencia.** Indicar ruta absoluta de SQLite, override
   `CHAT_DB_PATH`, migración de `role`, PBKDF2-SHA256 con sal aleatoria y
   compatibilidad SHA-256. Mostrar `seed_users.py --count 20`, credenciales de
   prueba y `CHAT_ADMIN_PASSWORD`; aclarar que el seed conserva cuentas existentes.
5. **Logs y monitor.** Describir consola + `logs/server.log`, nombres de hilo,
   historial circular de 200 entradas, snapshot y eventos sin contenido de chat.
   Explicar estadísticas cada 2 s y exclusión de admins de user_list/broadcasts.
   La interfaz de monitoreo React es trabajo separado; el CLI permite demostrar
   el contrato ya implementado.
6. **Hilos vs. procesos (requisito 6b).** Incorporar la tabla de
   `HILOS_VS_PROCESOS.md`: 200 ecos por cliente, N=10 y 20, una corrida por
   configuración, spawn y mismos mensajes. Explicar carga de E/S, poca relevancia
   del GIL en este ensayo, memoria adicional por proceso e IPC requerido para un
   chat real. No presentar el microbenchmark como comparación del chat completo.
7. **Carga y prueba final.** Incorporar la tabla de `RESULTADOS_FINALES.md` y sus
   límites: entorno local, 20 usuarios, 30 s, R=2, archivo 5 MiB y admin conectado.
   R son mensajes de carga por segundo y usuario más R sondas RTT. Distinguir
   envíos de entregas de broadcast, medir retorno al mismo usuario sin sincronizar
   relojes y reportar cantidad de muestras dentro/fuera de la ventana del archivo.
   No sustituir ni repetir la matriz histórica de 1–50 clientes.
8. **Ejecución y dependencias.** Documentar --host/--port, CHAT_HOST/CHAT_PORT,
   IP LAN, prueba desde otra computadora y usuarios reservados al script. El
   servidor no requiere paquetes externos: psutil es opcional (RSS actual), con
   respaldo estándar de CPU y RSS máximo. websockets es dependencia de clientes.
9. **Conclusiones.** Basar las afirmaciones en las mediciones obtenidas. Una
   corrida local no demuestra rendimiento en cualquier LAN ni una ventaja
   universal entre hilos y procesos. Anotar cualquier criterio de T10 no logrado,
   si lo hubiera, en lugar de presentar el resultado como aprobado.
