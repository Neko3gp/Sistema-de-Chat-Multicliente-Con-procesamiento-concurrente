"""Carga reproducible de chat; RTT de retorno al mismo usuario sin sincronizar relojes.

El servidor debe estar iniciado y las cuentas user01… sembradas. Cada usuario
emite R mensajes de carga y R sondas RTT por segundo. No crea cuentas.
"""
import argparse
import asyncio
import base64
import hashlib
import json
import math
from pathlib import Path
import time
import uuid

from websockets.asyncio.client import connect


def percentile(values, fraction):
    """Calcula un percentil interpolado; None indica ausencia de muestras."""
    if not values:
        return None
    values = sorted(values)
    position = (len(values) - 1) * fraction
    low = int(position)
    high = min(low + 1, len(values) - 1)
    return round(values[low] + (values[high] - values[low]) * (position - low), 3)


def distribution(samples):
    """Resume latencias en milisegundos sin inventar valores para listas vacías."""
    return {"samples": len(samples), "p50_ms": percentile(samples, .5),
            "p95_ms": percentile(samples, .95), "max_ms": max(samples) if samples else None}


async def run(args):
    """Conecta, genera carga, verifica todas las entregas y cierra los clientes."""
    names = [f"user{i:02d}" for i in range(1, args.users + 1)]
    run_id = uuid.uuid4().hex
    sockets, readers, pending, last_sequence = {}, [], {}, {}
    errors, rtts = [], []
    sent = received = expected_deliveries = 0
    closing = False
    transfer = {"start": None, "end": None, "bytes": round(args.file_mb * 1024 * 1024),
                "sha256": None, "integrity": None}
    file_done = asyncio.Event()
    file_target = names[-1]
    file_name = f"load-{run_id}.bin"
    content = b"x" * transfer["bytes"]
    encoded_file = base64.b64encode(content).decode() if content else None
    if content:
        transfer["sha256"] = hashlib.sha256(content).hexdigest()

    async def prepare(name):
        """Abre WebSocket sin compresión ni ping y valida el rol de chat."""
        ws = await connect(f"ws://{args.host}:{args.port}", compression=None,
                           ping_interval=None, proxy=None, max_size=8 * 1024 * 1024,
                           open_timeout=15, close_timeout=1)
        sockets[name] = ws
        await ws.send(json.dumps({"type": "login", "username": name, "password": "test1234"}))
        async with asyncio.timeout(20):
            while True:
                reply = json.loads(await ws.recv())
                if reply["type"] == "user_list":
                    continue
                if reply.get("type") != "login_result" or not reply.get("ok") or reply.get("role") != "user":
                    raise RuntimeError(f"{name}: login rechazado {reply}")
                return

    async def receive(name):
        """Verifica contenido, destinatarios, duplicados, orden y RTT propio."""
        nonlocal received
        try:
            async for raw in sockets[name]:
                arrived = time.perf_counter()
                message = json.loads(raw)
                kind = message.get("type")
                if kind == "user_list":
                    if "admin" in message["users"]:
                        errors.append("admin apareció en user_list")
                    continue
                if kind == "error":
                    errors.append(f"{name}: {message.get('reason')}")
                    continue
                if kind == "file":
                    if message.get("filename") != file_name:
                        continue
                    assert name == file_target and message.get("from") == names[0]
                    assert transfer["end"] is None, "Archivo duplicado"
                    transfer["end"] = arrived
                    decoded = await asyncio.to_thread(base64.b64decode, message["data"], validate=True)
                    digest = await asyncio.to_thread(hashlib.sha256, decoded)
                    transfer["integrity"] = len(decoded) == transfer["bytes"] and digest.hexdigest() == transfer["sha256"]
                    assert transfer["integrity"], "Archivo corrupto"
                    received += 1
                    file_done.set()
                    continue
                if kind not in {"private_message", "broadcast"}:
                    raise AssertionError(f"Tipo inesperado: {kind}")
                payload = json.loads(message["message"])
                if payload.get("run") != run_id:
                    continue
                identifier = payload["id"]
                expected = pending[identifier]
                assert name in expected["targets"], "Entrega duplicada o destinatario incorrecto"
                assert message.get("from") == expected["sender"]
                assert kind == expected["type"] and message["message"] == expected["text"]
                key = (name, expected["sender"], payload["probe"])
                assert payload["sequence"] > last_sequence.get(key, -1), "Orden incorrecto"
                last_sequence[key] = payload["sequence"]
                expected["targets"].remove(name)
                if payload["probe"]:
                    rtts.append((name, payload["sent"], arrived, (arrived - payload["sent"]) * 1000))
                if not expected["targets"]:
                    del pending[identifier]
                received += 1
        except Exception as error:
            if not closing:
                errors.append(f"{name}: {type(error).__name__}: {error}")

    async def send_message(name, index, sequence, probe):
        """Encola expectativas antes del envío para detectar pérdidas y duplicados."""
        nonlocal sent, expected_deliveries
        kind = "broadcast" if not probe and sequence % 5 == 0 else "private_message"
        target = name if probe else names[(index + 1) % len(names)]
        targets = set(names) - {name} if kind == "broadcast" else {target}
        identifier = f"{name}:{sequence}:{probe}"
        text = json.dumps({"run": run_id, "id": identifier, "sequence": sequence,
                           "probe": probe, "sent": time.perf_counter()})
        if targets:
            pending[identifier] = {"targets": targets, "sender": name, "text": text, "type": kind}
        message = {"type": kind, "message": text}
        if kind == "private_message":
            message["to"] = target
        expected_deliveries += len(targets)
        await sockets[name].send(json.dumps(message))
        sent += 1

    async def generate(name, index, started):
        """Mantiene tasa R por usuario con fases escalonadas para evitar ráfagas."""
        sequence = 0
        phase = index / len(names) / args.rate
        while True:
            due = started + phase + sequence / args.rate
            if due >= started + args.duration:
                return
            await asyncio.sleep(max(0, due - time.perf_counter()))
            await send_message(name, index, sequence, False)
            await send_message(name, index, sequence, True)
            sequence += 1

    async def send_file(started):
        """Envía un archivo a mitad del intervalo y registra la ventana real."""
        nonlocal sent, expected_deliveries
        if not content:
            return
        await asyncio.sleep(max(0, started + args.duration / 2 - time.perf_counter()))
        payload = json.dumps({"type": "file", "to": file_target,
                              "filename": file_name, "data": encoded_file})
        transfer["start"] = time.perf_counter()
        expected_deliveries += 1
        await sockets[names[0]].send(payload)
        sent += 1

    try:
        prepared = await asyncio.gather(*(prepare(name) for name in names), return_exceptions=True)
        errors.extend(str(item) for item in prepared if isinstance(item, BaseException))
        if not errors:
            readers = [asyncio.create_task(receive(name)) for name in names]
            started = time.perf_counter()
            results = await asyncio.gather(*(generate(name, i, started) for i, name in enumerate(names)),
                                           send_file(started), return_exceptions=True)
            errors.extend(str(item) for item in results if isinstance(item, BaseException))
            await asyncio.sleep(max(0, started + args.duration - time.perf_counter()))
            deadline = time.perf_counter() + 10
            while (pending or (content and not file_done.is_set())) and time.perf_counter() < deadline:
                await asyncio.sleep(.02)
            if pending:
                errors.append(f"Entregas perdidas: {sum(len(item['targets']) for item in pending.values())}")
            if content and not file_done.is_set():
                errors.append("No llegó el archivo íntegro")
    finally:
        closing = True
        for reader in readers:
            reader.cancel()
        await asyncio.gather(*readers, return_exceptions=True)
        await asyncio.gather(*(ws.close() for ws in sockets.values()), return_exceptions=True)
    during, outside = [], []
    for name, begin, end, rtt in rtts:
        if content and name in {names[0], file_target}:
            continue
        overlaps = (transfer["start"] is not None and transfer["end"] is not None
                    and begin <= transfer["end"] and end >= transfer["start"])
        (during if overlaps else outside).append(rtt)
    report = {"users": args.users, "duration_s": args.duration, "rate": args.rate,
              "sent": sent, "received": received, "expected_deliveries": expected_deliveries,
              "errors": errors, "rtt": distribution([item[3] for item in rtts]),
              "other_users_during_file": distribution(during),
              "other_users_outside_file": distribution(outside),
              "file": {"bytes": transfer["bytes"], "integrity": transfer["integrity"],
                       "sha256": transfer["sha256"],
                       "duration_ms": (transfer["end"] - transfer["start"]) * 1000
                       if transfer["end"] is not None else None}}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if args.output:
        Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return report


def arguments():
    """Valida parámetros finitos y el límite de archivos definido por el chat."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5000)
    parser.add_argument("--users", type=int, default=5)
    parser.add_argument("--duration", type=float, default=5)
    parser.add_argument("--rate", type=float, default=2)
    parser.add_argument("--file-mb", type=float, default=0)
    parser.add_argument("--output", help="guardar también el resumen JSON")
    args = parser.parse_args()
    if args.users < 1 or not 1 <= args.port <= 65535:
        parser.error("users debe ser positivo y port debe estar entre 1 y 65535")
    if any(not math.isfinite(value) or value <= 0 for value in (args.duration, args.rate)):
        parser.error("duration y rate deben ser positivos y finitos")
    if not math.isfinite(args.file_mb) or not 0 <= args.file_mb <= 5:
        parser.error("file-mb debe estar entre 0 y 5 MiB")
    return args


if __name__ == "__main__":
    result = asyncio.run(run(arguments()))
    raise SystemExit(bool(result["errors"]))
