# Prueba final T10

Resultado: **PASÓ**. Entorno: localhost, servidor y clientes en esta computadora.

Comando de carga (puerto temporal asignado por el verificador):

```bash
python scripts/load_test.py --users 20 --duration 30 --rate 2 --file-mb 5
```

| Medida | Resultado |
|---|---|
| Resultado | PASÓ |
| Usuarios / admin / duración / tasa | 20 / 1 / 30 s / 2 mensajes + 2 sondas por usuario y segundo |
| Máscara del cliente websockets | websocket.speedups |
| Mensajes enviados / entregas recibidas | 2401 / 6721 |
| Entregas esperadas | 6721 |
| Errores de carga | 0 |
| Archivo | 5242880 bytes; íntegro: True |
| Duración transferencia | 79.291 ms |
| RTT global p50 / p95 / máximo | 0.616 / 1.537 / 86.142 ms |
| RTT p95 otros usuarios: durante / fuera | 19.792 / 1.519 ms |
| Muestras otros usuarios: durante / fuera | 2 / 1078 |
| Umbral p95 durante | 21.519 ms |
| Hilos con 20 usuarios + admin / solo admin | 46 / 6 |
| Usuarios de chat al finalizar | [] |
| Muestras de estadísticas / eventos de mensaje | 16 / 2401 |

## Criterios y alcance

**Límite de la evidencia:** solo hubo dos sondas de otros usuarios que
coincidieran con la transferencia. Se cumple el criterio operativo elegido
en esta corrida, pero ese p95 no permite una conclusión estadística sólida
ni garantiza el resultado en una LAN distinta.

El umbral se fijó antes de ejecutar: p95 durante <= max(2 × p95 fuera, p95 fuera + 20 ms). Es un criterio operativo local; no constituye una garantía de latencia para cualquier red. La comparación excluye al emisor y destinatario del archivo y clasifica sondas cuyo intervalo se superpone con la transferencia real. Percentiles con pocas muestras requieren cautela.

Se comprobó integridad SHA-256, JSON, orden, destinatarios, duplicados y pérdidas. Los broadcasts explican la diferencia entre enviados y entregas. El admin recibió snapshot, eventos y estadísticas, sin recibir chat. La lista vacía se verificó mediante un nuevo snapshot: usa el mismo registro que genera user_list, pues el admin no recibe user_list.

Los hilos esperados son 2 × (20 + 1) + 4 = 46, y 6 al quedar solo admin. Los contadores de mensajes/bytes del monitor se contrastaron con sus eventos de entrada. Todos los procesos, conexiones, datos y logs temporales se cerraron al terminar.

Datos detallados: [RESULTADOS_FINALES.json](RESULTADOS_FINALES.json). Reproducir la verificación completa: `python scripts/test_final.py`.

## Correcciones y trazabilidad

Cada intento anterior tuvo una implementación distinta; no se seleccionó la mejor de varias corridas equivalentes. Se conserva el mismo umbral de aceptación.

- [RESULTADOS_FINALES_INTENTO1.json](RESULTADOS_FINALES_INTENTO1.json): p95 durante 103.58 ms y fuera 1.441 ms; pendientes: latencia de otros usuarios.
- [RESULTADOS_FINALES_INTENTO2.json](RESULTADOS_FINALES_INTENTO2.json): p95 durante 92.207 ms y fuera 1.471 ms; pendientes: latencia de otros usuarios.
- [RESULTADOS_FINALES_INTENTO3.json](RESULTADOS_FINALES_INTENTO3.json): p95 durante 74.541 ms y fuera 1.567 ms; pendientes: latencia de otros usuarios.

Tras el primer intento se sustituyó el XOR byte a byte por tablas translate en bloques de 64 KiB, y la acumulación TCP por bytearray. Tras el segundo se movió la validación base64 al lector del emisor en bloques, y el escritor serializa únicamente metadatos JSON antes de insertar el base64 ya validado. Así el worker compartido solo resuelve destinos. Además, el cliente prepara el JSON del archivo antes de medir y atiende sus dos participantes en otro bucle/hilo: el enmascarado del generador no detiene el bucle de las sondas ajenas. El servidor mantiene WebSocket manual, sockets, threading, locks y colas. Los límites de archivo se volvieron a verificar después de mover la validación. Tras el tercer intento se añadieron cesiones explícitas del hilo entre bloques grandes y se compiló la extensión C opcional del mismo websockets 15.0.1 para los clientes. Este último cambio también modifica el entorno de medición; por eso la mejora no se atribuye exclusivamente al servidor. La dependencia del servidor no cambió.
