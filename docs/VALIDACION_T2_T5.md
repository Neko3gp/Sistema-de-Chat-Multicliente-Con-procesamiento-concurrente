# Validación histórica del estado T2–T5

> Este documento conserva la evidencia de una revisión intermedia. No describe
> el estado completo actual: T6–T10, el panel React y el historial persistente
> se documentan en el README y en los documentos enlazados desde `docs/INDICE.md`.

Fecha: 2026-09-27. Rama: `dev`. Backend evaluado: `4cb1ba6` (incluye T2,
T3, T4 y T5). Entorno: Python 3.14.7 y Node.js 24.18.1 en Linux.

## Resultados

| Verificación | Resultado | Evidencia |
| --- | --- | --- |
| `python -m compileall -q backend scripts` | PASÓ | Módulos Python compilables. |
| `python scripts/test_concurrency.py` | PASÓ | Archivo de 4 MiB íntegro y 200 mensajes por sentido con receptor detenido; orden, JSON, login duplicado y desconexiones correctos. Intercambio: 1,524 s. |
| `python scripts/test_database.py` | PASÓ | Seed: 21 altas y 0 en segunda ejecución; migración preserva SHA-256; PBKDF2 con sales distintas; roles y credenciales verificados; ruta estable. |
| `python scripts/test_logging.py` | PASÓ | Conexiones, autenticación, mensajes, difusión, archivo y desconexiones con nombres de hilo; sin contenido privado en consola/archivo. |
| `python scripts/test_monitor.py` | PASÓ | Snapshot y últimas 200 entradas, eventos y estadísticas; 208 mensajes contados; admin aislado; usuarios reciben `forbidden`; 0 usuarios de chat y 6 hilos al quedar solo admin. |
| `python scripts/test_regression.py` | PASÓ | Registro sin elevación de rol; autenticación, destinos inexistentes, base64 inválido, archivo de 5 MiB completo y rechazo de 5 MiB + 1 byte; remitente validado y broadcast sin eco. |
| Saturación, incluida en `test_regression.py` | PASÓ | 1000 mensajes pendientes: cierra al receptor bloqueado, libera su sesión y termina el escritor; monitor descarta eventos más antiguos; métricas funcionan sin `psutil` y sus hilos terminan. |
| `npm run build -- --outDir /tmp/chat-paralelo-validacion-build` | PASÓ | Build de producción: 38 módulos transformados; salida aislada en `/tmp`. |
| `npm run lint` | PASÓ con advertencias | Código de salida 0, tres advertencias existentes detalladas abajo. |
| `git diff --check` | PASÓ | Sin errores de espacios en los cambios. |

Las pruebas de backend usaron sockets locales y bases/logs temporales. Cada
servidor se ejecutó con timeout y se cerró al terminar. No fue necesario
modificar el backend para pasar esta revisión. Se añade `test_regression.py`
para conservar la cobertura de límites y saturación.

## Advertencias de la interfaz

- `frontend/miapp/src/components/Message.jsx:9`: `Date.now()` durante render.
- `frontend/miapp/src/components/FileMessage.jsx:12`: `Date.now()` durante render.
- `frontend/miapp/src/components/Sidebar.jsx:58`: parámetro `onLogout` sin usar.

Build y lint se ejecutaron desde `frontend/miapp` sobre el árbol de trabajo
local. Los cambios previos del usuario en `package.json` y `package-lock.json`
se conservaron y no se incluyen en el commit de validación. Estas comprobaciones
no equivalen a una prueba de interfaz en navegador ni del monitor React, que
se desarrolla por separado.

## Alcance

Se validó lo implementado hasta T5. No se repitió la matriz histórica de
escalabilidad 1–50 ni se adelantó la prueba T10 de 20 usuarios durante 30 s.
Las mediciones de esta revisión son comprobaciones locales de funcionamiento,
no resultados del ensayo final de rendimiento. T6–T10 se completaron después y
su evidencia está en `RESULTADOS_FINALES.md` y `HILOS_VS_PROCESOS.md`.
