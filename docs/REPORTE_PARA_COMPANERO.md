# Guía breve para probar el proyecto

Este documento sirve para coordinar una prueba entre ramas. La explicación
completa está en [`../README.md`](../README.md); el contrato exacto está en
[`PROTOCOLO_MENSAJES.md`](PROTOCOLO_MENSAJES.md).

## Arranque

```bash
cd /ruta/Sistema-de-Chat-Multicliente-Con-procesamiento-concurrente
python -m venv .venv
source .venv/bin/activate
python -m pip install -r scripts/requirements.txt
python scripts/seed_users.py --count 20
python backend/main.py --host 0.0.0.0 --port 5001
```

En otra terminal:

```bash
cd frontend/miapp
npm install
VITE_WS_PORT=5001 npm run dev -- --host 0.0.0.0
```

Desde otro equipo se debe abrir la IP LAN anunciada por el backend y sustituir
`localhost` por esa IP. El firewall debe permitir el puerto elegido.

## Prueba funcional mínima

1. Entrar con `user01` / `test1234`.
2. Entrar con `user02` / `test1234` desde otra pestaña o equipo.
3. Enviar un broadcast y un privado.
4. Desconectar `user02`, enviarle un privado y un mensaje de grupo.
5. Volver a iniciar sesión con `user02` y comprobar que aparecen en el
   historial recuperado desde SQLite.
6. Enviar un archivo menor de 5 MiB y comprobar su recepción.
7. Entrar con `admin` usando la contraseña configurada para revisar el panel
   de monitoreo.

## Prueba de carga

Reservar `user01` hasta `user20` para el script:

```bash
python scripts/test_final.py
```

La evidencia de la corrida final está en
[`RESULTADOS_FINALES.md`](RESULTADOS_FINALES.md). No presentar una medición
local como garantía de rendimiento para cualquier red.

## Estado de integración

El monitor React está integrado en `dev`, el historial persistente usa SQLite y
el proyecto se valida con `npm run build` y `python -m compileall`. Antes de
probar una rama recién descargada se debe ejecutar `npm install` dentro de
`frontend/miapp` y reiniciar el backend para que aplique las migraciones de la
base de datos.
