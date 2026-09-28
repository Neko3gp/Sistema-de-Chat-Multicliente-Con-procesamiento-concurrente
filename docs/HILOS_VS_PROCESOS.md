# Hilos vs. procesos: microbenchmark de eco

Entorno: Python 3.14.7, Linux x86_64. Transporte: WebSocket manual sobre TCP local; método multiprocessing: spawn.

Medición de T8 anterior a las optimizaciones de frames y archivos realizadas
en T10. Se conserva la única corrida de cada configuración; no se volvió a
medir el microbenchmark después de esos cambios.

| Modelo | Clientes | Ecos | RTT p50 ms | RTT p95 ms | CPU total s | CPU % agregado | RSS total MiB |
|---|---:|---:|---:|---:|---:|---:|---:|
| threads | 10 | 2000 | 0.120 | 0.157 | 0.0955 | 21.77 | 21.64 |
| processes | 10 | 2000 | 0.123 | 0.163 | 0.1006 | 22.87 | 232.61 |
| threads | 20 | 4000 | 0.120 | 0.191 | 0.1899 | 42.89 | 21.93 |
| processes | 20 | 4000 | 0.120 | 0.180 | 0.1935 | 43.63 | 443.41 |

## Método y límites

Una corrida por configuración, 200 ecos por cliente, pausa de 2 ms entre ecos y calentamiento previo. Mismo sobre JSON private_message y tamaño de carga para ambos modelos. No se incluye SQLite, login, colas de chat, archivos ni MonitorHub: no es el chat completo.

CPU del servidor medida con time.process_time(): proceso receptor y, en el modelo de procesos, suma de los workers. Se excluye el proceso cliente y el arranque de intérpretes; las pequeñas operaciones de control se incluyen parcialmente. CPU % es esa suma dividida por la duración de la carga (100% equivale a un núcleo). RSS se toma con todos los clientes conectados: suma del receptor y workers; en Linux se usa /proc/self/statm, en macOS máximos de resource. RSS cuenta páginas compartidas en cada proceso y no equivale a memoria física exclusiva. No se cuenta el proceso auxiliar resource_tracker de multiprocessing.

## Análisis

Esta carga pequeña está dominada por espera de E/S y pausas del cliente. El GIL tiene poca relevancia frente a esa espera; la comparación no permite extrapolar a tareas intensivas en CPU. Los hilos comparten intérprete y estado, mientras cada proceso mantiene un intérprete y memoria propios: la tabla cuantifica el costo agregado en esta máquina. Una única corrida no permite afirmar una ventaja universal de latencia ni significancia estadística.

Un chat con procesos requeriría IPC (Manager, colas o pipes) para compartir sesiones, coordinar broadcasts y llevar los mensajes al proceso dueño del socket. El eco no incurre en ese costo. Para el chat actual se conserva socket + threading + locks + queue.Queue.
