"""Microbenchmark de eco WebSocket: hilo vs proceso por conexión, N=10 y N=20.

No ejecuta el chat completo. El servidor usa únicamente sockets y WebSocket
manual; websockets se importa solo en el cliente de la prueba.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import multiprocessing
import os
from pathlib import Path
import platform
import socket
import sys
import threading
import time

try:
    import resource
except ImportError:
    resource = None

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from websocket_handler import do_handshake, recv_frame, send_frame


def memory_mb():
    """Lee RSS actual en Linux; usa RSS máximo de resource en macOS."""
    if sys.platform.startswith("linux"):
        pages = int(Path("/proc/self/statm").read_text().split()[1])
        return pages * os.sysconf("SC_PAGE_SIZE") / 1024 ** 2
    if resource is not None:
        peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return peak / (1024 ** 2 if sys.platform == "darwin" else 1024)
    raise RuntimeError("La medición de memoria requiere Linux o resource")


def echo_client(sock):
    """Devuelve mensajes JSON intactos; dos órdenes internas delimitan métricas."""
    baseline = time.process_time()
    try:
        sock.settimeout(15)
        if not do_handshake(sock):
            return
        while True:
            raw = recv_frame(sock)
            if raw is None:
                return
            message = json.loads(raw)
            if message["message"] == "bench:start":
                baseline = time.process_time()
            elif message["message"] == "bench:stats":
                message["message"] = json.dumps({"cpu_s": time.process_time() - baseline,
                                                  "mem_mb": memory_mb()})
                raw = json.dumps(message)
            send_frame(sock, raw)
    finally:
        sock.close()


def echo_server(mode, control):
    """Acepta conexiones y crea workers equivalentes usando hilos o spawn."""
    context = multiprocessing.get_context("spawn")
    workers = []
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen(64)
        listener.settimeout(.02)
        control.send(listener.getsockname()[1])
        try:
            running = True
            while running:
                while control.poll():
                    command = control.recv()
                    if command == "stop":
                        running = False
                        break
                    control.send({"cpu_s": time.process_time(), "mem_mb": memory_mb()})
                if not running:
                    break
                try:
                    sock, _ = listener.accept()
                except TimeoutError:
                    continue
                worker = (threading.Thread(target=echo_client, args=(sock,), daemon=True)
                          if mode == "threads" else context.Process(target=echo_client, args=(sock,)))
                worker.start()
                workers.append(worker)
                if mode == "processes":
                    sock.close()
        finally:
            for worker in workers:
                worker.join(timeout=2)
                if mode == "processes" and worker.is_alive():
                    worker.terminate()
                    worker.join(timeout=2)
            control.close()


def percentile(values, fraction):
    """Devuelve un percentil lineal en milisegundos."""
    values = sorted(values)
    position = (len(values) - 1) * fraction
    index = int(position)
    return values[index] + (values[min(index + 1, len(values) - 1)] - values[index]) * (position - index)


def exchange(ws, text):
    """Envía el mismo sobre private_message empleado por ambos servidores."""
    ws.send(json.dumps({"type": "private_message", "to": "echo", "message": text}))
    result = json.loads(ws.recv(timeout=10))
    assert result["type"] == "private_message" and result["to"] == "echo"
    return result["message"]


def trial(mode, count, rounds):
    """Mide RTT y recursos del servidor excluyendo el proceso de clientes."""
    from websockets.sync.client import connect

    context = multiprocessing.get_context("spawn")
    parent, child = context.Pipe()
    server = context.Process(target=echo_server, args=(mode, child))
    server.start()
    child.close()
    sockets = []
    try:
        assert parent.poll(10), "El servidor de eco no arrancó"
        port = parent.recv()
        for _ in range(count):
            ws = connect(f"ws://127.0.0.1:{port}", compression=None, ping_interval=None,
                         proxy=None, open_timeout=10, close_timeout=.2)
            sockets.append(ws)
            assert exchange(ws, "warmup") == "warmup"
        for ws in sockets:
            assert exchange(ws, "bench:start") == "bench:start"
        parent.send("sample")
        assert parent.poll(5)
        baseline = parent.recv()
        started = time.perf_counter()

        def client_run(index):
            """Mantiene una conexión por cliente y registra el RTT de cada eco."""
            samples = []
            for sequence in range(rounds):
                text = f"{index}:{sequence}:" + "x" * 128
                begin = time.perf_counter()
                assert exchange(sockets[index], text) == text
                samples.append((time.perf_counter() - begin) * 1000)
                time.sleep(.002)
            return samples

        with ThreadPoolExecutor(max_workers=count) as pool:
            samples = [value for group in pool.map(client_run, range(count)) for value in group]
        elapsed = time.perf_counter() - started
        parent.send("sample")
        assert parent.poll(5)
        measured = parent.recv()
        cpu = measured["cpu_s"] - baseline["cpu_s"]
        memory = measured["mem_mb"]
        if mode == "processes":
            for ws in sockets:
                worker = json.loads(exchange(ws, "bench:stats"))
                cpu += worker["cpu_s"]
                memory += worker["mem_mb"]
        return {"mode": mode, "clients": count, "samples": len(samples),
                "p50_ms": percentile(samples, .5), "p95_ms": percentile(samples, .95),
                "cpu_s": cpu, "cpu_percent": cpu / elapsed * 100, "mem_mb": memory}
    finally:
        for ws in sockets:
            ws.close()
        if server.is_alive():
            parent.send("stop")
        server.join(timeout=10)
        if server.is_alive():
            server.terminate()
            server.join(timeout=3)
        parent.close()
        assert server.exitcode == 0, f"Servidor de eco terminó con {server.exitcode}"


def main():
    """Ejecuta una corrida por configuración y genera la evidencia Markdown."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rounds", type=int, default=200)
    parser.add_argument("--output", type=Path,
                        default=Path(__file__).resolve().parents[1] / "docs/HILOS_VS_PROCESOS.md")
    args = parser.parse_args()
    if args.rounds < 1:
        parser.error("rounds debe ser positivo")
    results = []
    for count in (10, 20):
        for mode in ("threads", "processes"):
            result = trial(mode, count, args.rounds)
            results.append(result)
            print(f"PASO T8: {mode}, N={count}, p95={result['p95_ms']:.3f} ms, RSS={result['mem_mb']:.2f} MiB", flush=True)
    lines = ["# Hilos vs. procesos: microbenchmark de eco", "",
             f"Entorno: Python {platform.python_version()}, {platform.system()} {platform.machine()}. "
             "Transporte: WebSocket manual sobre TCP local; método multiprocessing: spawn.", "",
             "| Modelo | Clientes | Ecos | RTT p50 ms | RTT p95 ms | CPU total s | CPU % agregado | RSS total MiB |",
             "|---|---:|---:|---:|---:|---:|---:|---:|"]
    for row in results:
        lines.append(f"| {row['mode']} | {row['clients']} | {row['samples']} | {row['p50_ms']:.3f} | "
                     f"{row['p95_ms']:.3f} | {row['cpu_s']:.4f} | {row['cpu_percent']:.2f} | {row['mem_mb']:.2f} |")
    lines += ["", "## Método y límites", "",
              f"Una corrida por configuración, {args.rounds} ecos por cliente, pausa de 2 ms entre ecos y "
              "calentamiento previo. Mismo sobre JSON private_message y tamaño de carga para ambos modelos. "
              "No se incluye SQLite, login, colas de chat, archivos ni MonitorHub: no es el chat completo.", "",
              "CPU del servidor medida con time.process_time(): proceso receptor y, en el modelo de procesos, "
              "suma de los workers. Se excluye el proceso cliente y el arranque de intérpretes; las pequeñas "
              "operaciones de control se incluyen parcialmente. CPU % es esa suma dividida por la duración "
              "de la carga (100% equivale a un núcleo). RSS se toma con todos los clientes conectados: "
              "suma del receptor y workers; en Linux se usa /proc/self/statm, en macOS máximos de resource. "
              "RSS cuenta páginas compartidas en cada proceso y no equivale a memoria física exclusiva. "
              "No se cuenta el proceso auxiliar resource_tracker de multiprocessing.", "",
              "## Análisis", "",
              "Esta carga pequeña está dominada por espera de E/S y pausas del cliente. El GIL tiene poca "
              "relevancia frente a esa espera; la comparación no permite extrapolar a tareas intensivas en CPU. "
              "Los hilos comparten intérprete y estado, mientras cada proceso mantiene un intérprete y "
              "memoria propios: la tabla cuantifica el costo agregado en esta máquina. Una única corrida "
              "no permite afirmar una ventaja universal de latencia ni significancia estadística.", "",
              "Un chat con procesos requeriría IPC (Manager, colas o pipes) para compartir sesiones, "
              "coordinar broadcasts y llevar los mensajes al proceso dueño del socket. El eco no incurre "
              "en ese costo. Para el chat actual se conserva socket + threading + locks + queue.Queue.", ""]
    args.output.write_text("\n".join(lines))


if __name__ == "__main__":
    main()
