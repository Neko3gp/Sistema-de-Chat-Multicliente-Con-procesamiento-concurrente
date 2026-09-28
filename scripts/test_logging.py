"""Verificación puntual T4 con dos clientes y archivos de ejecución temporales."""
import base64
from contextlib import contextmanager
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
import time

from test_concurrency import Client


ROOT = Path(__file__).resolve().parents[1]


@contextmanager
def temporary_server(users=2, server_timeout=30):
    """Siembra tres cuentas y cierra siempre el servidor temporal con timeout."""
    with tempfile.TemporaryDirectory(prefix="chat-monitor-") as directory:
        env = {**os.environ, "CHAT_DB_PATH": str(Path(directory) / "chat.db"),
               "CHAT_LOG_DIR": str(Path(directory) / "logs"),
               "CHAT_ADMIN_PASSWORD": "admin-test"}
        subprocess.run([sys.executable, str(ROOT / "scripts/seed_users.py"), "--count", str(users)],
                       env=env, cwd=directory, check=True, capture_output=True, timeout=15)
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        code = (
            "import sys; sys.path.insert(0, sys.argv[1]); "
            "from tcp_server import start_server; start_server('127.0.0.1', int(sys.argv[2]))"
        )
        with tempfile.TemporaryFile(mode="w+") as console:
            process = subprocess.Popen(
                [sys.executable, "-u", "-c", code,
                 str(ROOT / "backend"), str(port)],
                env=env, cwd=directory, stdout=console, stderr=console,
            )
            watchdog = threading.Timer(server_timeout, process.kill)
            watchdog.daemon = True
            watchdog.start()
            try:
                deadline = time.monotonic() + 5
                while True:
                    console.seek(0)
                    if "Servidor escuchando" in console.read():
                        break
                    if process.poll() is not None or time.monotonic() > deadline:
                        raise RuntimeError("El servidor temporal no arrancó")
                    time.sleep(0.05)
                yield port, Path(env["CHAT_LOG_DIR"]) / "server.log", console
            finally:
                watchdog.cancel()
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


def login(client, user, password="test1234"):
    """Autentica una cuenta ya sembrada y devuelve su respuesta."""
    client.send({"type": "login", "username": user, "password": password})
    result = client.until("login_result")
    assert result["ok"], result
    if result["role"] == "user":
        assert client.receive()["type"] == "history"
        assert client.receive()["type"] == "group_list"
    return result


def main():
    """Ejercita eventos y verifica que consola y archivo no revelen contenidos."""
    with temporary_server() as (port, log_path, console):
        clients = []
        try:
            for user in ("user01", "user02"):
                client = Client(port)
                clients.append(client)
                if user == "user01":
                    client.send({"type": "login", "username": user, "password": "clave-privada"})
                    assert client.until("login_result")["reason"] == "invalid_credentials"
                login(client, user)
            a, b = clients
            a.send({"type": "private_message", "to": "user02", "message": "texto-secreto-T4"})
            assert b.until("private_message")["message"] == "texto-secreto-T4"
            b.send({"type": "broadcast", "message": "difusion-secreta-T4"})
            assert a.until("broadcast")["from"] == "user02"
            a.send({"type": "file", "to": "user02", "filename": "T4.bin",
                    "data": base64.b64encode(b"archivo-secreto-T4").decode()})
            assert b.until("file")["filename"] == "T4.bin"
        finally:
            for client in clients:
                client.close()
        deadline = time.monotonic() + 3
        while True:
            text = log_path.read_text()
            if text.count("disconnect usuario=") == 2 and '[writer-user02] INFO file ' in text:
                break
            assert time.monotonic() < deadline, "Faltan eventos en el log"
            time.sleep(0.02)
        for fragment in (
            "[client-127.0.0.1:", '[client-user01] INFO connect ',
            '[client-user02] INFO disconnect ', 'INFO login_failed ',
            '[client-user01] INFO message ', '[queue-worker] INFO broadcast ',
            '"recipients": 1', '"filename": "T4.bin"', '"bytes": 18', '"duration_ms":',
        ):
            assert fragment in text, fragment
        console.seek(0)
        combined = text + console.read()
        for secret in ("texto-secreto-T4", "difusion-secreta-T4", "archivo-secreto-T4",
                       "clave-privada", "test1234"):
            assert secret not in combined, "El log contiene datos privados"
        assert "Traceback" not in combined
    print("PASO T4: conexiones, login fallido/correcto, mensajes, broadcast, archivo y desconexiones")
    print("PASO T4: nombres client/queue-worker/writer; consola y archivo sin contenidos privados")
    print("Servidor, base y logs temporales eliminados")


if __name__ == "__main__":
    main()
