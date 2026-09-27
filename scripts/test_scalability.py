"""Cliente de prueba (Python 3.11+); no inicia ni modifica el servidor.

Instalar: python -m pip install -r scripts/requirements.txt
Ejecutar: python scripts/test_scalability.py 5 --url ws://127.0.0.1:5000
Crea usuarios únicos por corrida; sus registros permanecen en la BD del servidor.
"""
import argparse
import asyncio
import json
import time
import uuid

from websockets.asyncio.client import connect


async def run(args):
    run_id = uuid.uuid4().hex
    names = [f"test_user_{run_id}_{i + 1}" for i in range(args.n)]
    sockets, connected, sent, received, first, errors = {}, [], {}, [], [], []
    started = time.perf_counter()

    async def prepare(name):
        async with asyncio.timeout(args.timeout):
            ws = await connect(args.url, compression=None, ping_interval=None,
                               proxy=None, open_timeout=args.timeout, close_timeout=1)
            sockets[name] = ws
            connected.append(time.perf_counter())
            for kind in ("register", "login"):
                await ws.send(json.dumps({"type": kind, "username": name,
                                          "password": run_id}))
                while True:
                    message = json.loads(await ws.recv())
                    if message.get("type") == "user_list":
                        continue
                    if message.get("type") != kind + "_result" or not message.get("ok"):
                        raise RuntimeError(f"{kind}: {message}")
                    break

    async def exchange(name):
        ws, seen = sockets[name], set()
        async with asyncio.timeout(args.timeout + 0.2):
            sent[name] = time.perf_counter()
            await ws.send(json.dumps({"type": "broadcast", "message": run_id}))
            while True:
                complete = len(seen) == args.n - 1
                try:
                    raw = await asyncio.wait_for(ws.recv(), 0.2 if complete else args.timeout)
                except TimeoutError:
                    if complete:
                        break
                    raise RuntimeError(f"recibidos {len(seen)}/{args.n - 1} broadcasts")
                arrived = time.perf_counter()
                message = json.loads(raw)
                if message.get("type") == "user_list":
                    continue
                if message.get("type") == "error":
                    raise RuntimeError(str(message))
                if message.get("type") != "broadcast" or message.get("message") != run_id:
                    continue
                received.append(message)
                sender = message.get("from")
                if sender == name or sender in seen or sender not in sent:
                    raise RuntimeError(f"emisor inesperado o duplicado: {sender}")
                if not seen:
                    first.append(arrived - sent[sender])
                seen.add(sender)

    async def phase(action):
        results = await asyncio.gather(*(action(name) for name in names), return_exceptions=True)
        for name, result in zip(names, results):
            if isinstance(result, BaseException):
                errors.append(f"{name}: {type(result).__name__}: {result}")

    try:
        await phase(prepare)
        if not errors:  # Todos autenticados antes de enviar; nadie se cierra antes de recibir.
            await phase(exchange)
    finally:
        results = await asyncio.gather(*(ws.close() for ws in sockets.values()), return_exceptions=True)
        errors.extend(f"cierre: {result}" for result in results if isinstance(result, BaseException))

    connection_ms = (max(connected) - started) * 1000 if connected else None
    print(f"Clientes conectados: {len(connected)}/{args.n}")
    if len(connected) == args.n:
        print(f"Tiempo total de conexión (handshakes): {connection_ms:.3f} ms")
    else:
        print("Tiempo total de conexión: N/D (conexiones incompletas)")
    if first:
        print(f"Promedio del primer broadcast (envío a recepción): {sum(first) / len(first) * 1000:.3f} ms")
    else:
        print("Promedio del primer broadcast: N/D (sin broadcasts recibidos)")
    print(f"Clientes con primera recepción medida: {len(first)}/{args.n}")
    print(f"Mensajes broadcast recibidos: {len(received)} (esperados: {args.n * (args.n - 1)})")
    print(f"Errores: {len(errors)}")
    for error in errors:
        print(f"  {error}")
    return bool(errors)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("n", type=int, help="cantidad de clientes concurrentes")
    parser.add_argument("--url", default="ws://127.0.0.1:5000")
    parser.add_argument("--timeout", type=float, default=10, help="límite por fase en segundos")
    args = parser.parse_args()
    if args.n < 1 or not 0 < args.timeout < float("inf"):
        parser.error("n debe ser >= 1 y timeout debe ser positivo y finito")
    raise SystemExit(asyncio.run(run(args)))
