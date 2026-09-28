# Reporte de avance para el equipo — Fase 2 del chat

## Qué estamos haciendo

Estamos implementando el plan `CODEX_FASE2.md` en la rama `dev`. El objetivo es
que el chat soporte varios usuarios y archivos grandes sin mezclar frames ni
bloquear a los demás, incorpore un administrador con monitoreo y deje evidencia
medida para el reporte de Cómputo Paralelo y Distribuido.

Se conserva la arquitectura acordada: Python, sockets TCP, WebSocket manual,
threading, locks, Queue y SQLite. No se incorporaron FastAPI, Flask ni asyncio
al servidor. La interfaz React se desarrolla por separado.

## Lo implementado

| Tarea | Cambios principales |
|---|---|
| T1 | Revisión del proyecto y confirmación del estado inicial. La interfaz real está en `newfront/miapp/`. |
| T2 | `Connection` con cola de salida de 1000 mensajes y escritor exclusivo; todos los envíos pasan por esa cola; cierre de receptores saturados y rechazo de login duplicado. |
| T3 | SQLite con ruta estable y `CHAT_DB_PATH`, migración de roles user/admin, PBKDF2 con sal aleatoria y compatibilidad con hashes SHA-256 existentes; seed idempotente y role en el login. |
| T4 | Logs en consola y `logs/server.log`, nombres de hilo y buffer circular de 200 entradas; se registran metadatos, no textos privados ni contraseñas. |
| T5 | MonitorHub exclusivo de admins con snapshot, eventos y estadísticas cada 2 s; cola propia que descarta eventos antiguos; admins fuera de listas y broadcasts de chat. |
| T6 | `--host`/`--port`, `CHAT_HOST`/`CHAT_PORT`, valores 0.0.0.0:5000 y anuncio de IP LAN. |
| T7 | Cliente de consola y generador de carga con RTT, verificación de entregas, orden e integridad del archivo. |
| T8 | Microbenchmark de eco equivalente con hilos/procesos, 10 y 20 conexiones y spawn; resultados y límites documentados. |
| T9 | README actualizado, contrato de protocolo y guía de cambios para el reporte académico. |
| T10 | Escenario final de 20 usuarios + admin, 30 s, tasa 2 y archivo de 5 MiB; resultados y trazabilidad en los documentos enlazados abajo. |

## Cambios que debe considerar quien desarrolla React

1. **Login:** se conserva `type: "login_result"`, `ok` y `reason`; un login
   exitoso añade `role: "user"` o `"admin"`. Los errores conservan su formato.
2. **Sesiones duplicadas:** tratar `{"type":"error","reason":"already_connected"}`
   sin asumir que se reemplazó la conexión anterior.
3. **Administrador:** después del login recibe `monitor_snapshot`, después
   `monitor_event` y `monitor_stats`. Debe abrir una vista de monitor, no la
   pantalla de chat normal. No aparece en `user_list`, no recibe broadcasts ni
   archivos, y enviar chat desde esa sesión responde `forbidden`.
4. **Snapshot:** contiene `log` (hasta 200 entradas), `stats` y `users`. Las
   entradas de log tienen `ts`, `thread`, `level`, `msg`.
5. **Eventos:** contienen `event`, `ts`, `thread`, `user`, `detail`. Eventos:
   connect, disconnect, login_failed, message, broadcast, file, error. Antes del
   login, user puede ser null. Son metadatos; no sirven como historial del chat.
6. **Estadísticas:** connected, threads, queue_size, msgs_total, msgs_per_sec,
   bytes_total, cpu_percent, mem_mb. `connected` excluye admins. Con psutil,
   memoria es RSS actual; sin él se informa RSS máximo mediante resource.
7. **Archivos:** máximo 5 MiB decodificados; atender `file_too_large` e
   `invalid_message`. Se mantiene JSON/base64, sin cambio a frames binarios.
8. **Conexión LAN:** `src/services/socket.js` todavía usa `ws://localhost:5000`.
   Para otro equipo/puerto se debe configurar la URL del servidor en la
   interfaz. Este cambio y la pantalla de monitor siguen del lado de frontend.

Contrato exacto: [PROTOCOLO_MENSAJES.md](PROTOCOLO_MENSAJES.md). El snapshot y
los eventos cercanos al login pueden describir el mismo hecho; la cola del
monitor puede descartar eventos si se satura. No usarlo como registro persistente.

## Cómo levantar y demostrar el proyecto

Desde la raíz:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r scripts/requirements.txt
export CHAT_ADMIN_PASSWORD='clave-local-de-demostracion'
python scripts/seed_users.py --count 20
python backend/main.py --host 0.0.0.0 --port 5000
```

El seed crea admin y user01…user20. Los usuarios de prueba usan `test1234`.
Si no se define CHAT_ADMIN_PASSWORD, admin usa `admin123`, solo para pruebas.
Repetir el seed no cambia la contraseña de cuentas existentes.

En otras terminales:

```bash
python scripts/cli_client.py --username admin
python scripts/cli_client.py --username user01
python scripts/load_test.py --host IP_DEL_SERVIDOR --users 20 --duration 30 --rate 2 --file-mb 5
```

El CLI pide la contraseña y admite `/w usuario texto`, `/todos texto`, `/salir`.
Como admin permite observar el monitor mientras se implementa la pantalla React.
Para ejecutar carga, reservar user01…user20 al script; las personas deben
usar otras cuentas registradas para no provocar `already_connected`.

El generador envía por usuario 2 mensajes de carga y 2 sondas RTT por segundo.
Uno de cada cinco mensajes de carga es broadcast. El RTT se mide por retorno al
mismo usuario con reloj del propio cliente, sin sincronizar computadoras.

## Evidencias y resultados

**T10 pasó el criterio operativo local:** 2.401 mensajes enviados, 6.721
entregas completas, 0 errores y archivo de 5 MiB íntegro. El monitor registró
46 hilos con 20 usuarios + admin, 6 al quedar solo admin y lista final vacía.
RTT p95 de los usuarios ajenos al archivo: 19,792 ms durante y 1,519 ms fuera;
el umbral fijado era 21,519 ms. **Solo hubo dos muestras durante el archivo:**
este resultado no demuestra estadísticamente el p95 de una transferencia en
otra red. Debe presentarse como una comprobación local con esa limitación.

- [Validación T2–T5](VALIDACION_T2_T5.md): las pruebas pasaron, incluyendo roles,
  hashes, concurrencia, permisos, logs, límites y saturación. La interfaz
  compiló; lint mostró tres advertencias existentes (dos Date.now en render y
  un parámetro onLogout sin usar). No se probó la interfaz en navegador.
- T6: arranque y conexión correctos en 5000 y 5001, con precedencia de CLI.
- T7: 100 mensajes enviados, 130 entregas verificadas, 50 sondas RTT y 0 errores
  con 5 usuarios durante 5 segundos. p95 medido: 0,842 ms.
- [Hilos vs. procesos](HILOS_VS_PROCESOS.md): con 20 conexiones, RSS agregado
  aproximado de 21,93 MiB con hilos y 443,41 MiB con procesos; p95 de 0,191 y
  0,180 ms respectivamente. Es eco local, no el chat completo; RSS suma también
  páginas compartidas y una corrida no demuestra ventajas universales.
- [Prueba final y criterios](RESULTADOS_FINALES.md) y
  [datos JSON](RESULTADOS_FINALES.json): fuente de verdad para el estado de T10.
  Se conservan los intentos fallidos y las correcciones, no se ocultan resultados.

Los primeros intentos de T10 entregaron todo sin errores, pero aumentaron el
p95 durante el archivo. Se optimizaron el desenmascarado manual, la acumulación
TCP, la validación base64 por bloques y la serialización de archivos. También
se aisló la E/S del archivo en el cliente de carga y se compiló la extensión C
opcional de websockets 15.0.1 para evitar que el generador distorsione los RTT.
La mejora no debe atribuirse solamente al servidor: cambió también el cliente.

El servidor sigue usando solo biblioteca estándar, con psutil opcional. La
extensión C pertenece a la dependencia websockets del cliente de pruebas.
Si se necesita reproducir ese entorno y la instalación normal no trae speedups:

```bash
python -m pip install --force-reinstall --no-binary=websockets websockets==15.0.1
```

Este comando requiere compilador y cabeceras de desarrollo de Python.
El JSON de carga identifica la implementación de máscara utilizada.

## Para el reporte y para coordinar el siguiente paso

- Usar la fórmula estable de hilos **2 × (usuarios + admins) + 4**: con 20 + 1
  son 46; con solo admin son 6. Las conexiones pendientes pueden cambiar el
  conteo transitoriamente. No reutilizar N+2 de las pruebas antiguas.
- Aplicar la guía [CAMBIOS_PARA_REPORTE.md](CAMBIOS_PARA_REPORTE.md) y mantener
  separados los resultados históricos, el microbenchmark y la carga final.
- La interfaz del monitor y su navegación por rol, la URL para LAN y las
  advertencias de lint quedan para quien trabaja React.
- Esta sesión conserva los cambios locales previos de package.json y
  package-lock.json de frontend. No forman parte de los commits del backend.
- Los nuevos commits T6–T10 quedan en `dev`; esta fase no solicita push.
  Coordinar su publicación y la integración de frontend por separado.
- Salas, TLS e historial persistente siguen fuera del alcance acordado.
