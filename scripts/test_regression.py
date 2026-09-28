"""Regresión del backend hasta T5: errores, límite de archivos y saturación.

Usa cuentas/base/logs temporales y termina siempre el servidor de prueba.
Ejecutar: python scripts/test_regression.py
"""
import base64
import queue
import socket
import sys
import threading
from unittest.mock import patch

from test_concurrency import Client
from test_logging import ROOT, login, temporary_server

sys.path.insert(0, str(ROOT / "backend"))
from connection_manager import Connection, ConnectionManager
from monitor_hub import MonitorHub
import websocket_handler


def protocol_checks():
    """Comprueba registro, autenticación, errores y el límite exacto de 5 MiB."""
    with temporary_server() as (port, log_path, console):
        clients = []
        try:
            a, b = Client(port), Client(port)
            clients.extend((a, b))
            a.send({"type": "private_message", "to": "user02", "message": "sin sesión"})
            assert a.until("error")["reason"] == "authentication_required"
            for expected in (True, False):
                a.send({"type": "register", "username": "regression", "password": "test1234",
                        "role": "admin"})
                assert a.until("register_result")["ok"] is expected
            assert login(a, "regression")["role"] == "user"
            login(b, "user02")
            a.send([])
            assert a.until("error")["reason"] == "invalid_message"
            a.send({"type": "private_message", "to": "no-existe", "message": "prueba"})
            assert a.until("error")["reason"] == "user_not_found"
            for invalid_data in (None, "no es base64!", 123):
                a.send({"type": "file", "to": "user02", "filename": "invalid.bin", "data": invalid_data})
                assert a.until("error")["reason"] == "invalid_message"
            content = b"x" * (5 * 1024 * 1024)
            a.send({"type": "file", "to": "user02", "filename": "oversize.bin",
                    "data": base64.b64encode(content + b"x").decode()})
            assert a.until("error")["reason"] == "file_too_large"
            a.send({"type": "file", "to": "user02", "filename": "limit.bin",
                    "data": base64.b64encode(content).decode(), "from": "admin"})
            received = b.until("file")
            assert received["filename"] == "limit.bin" and received["from"] == "regression"
            assert base64.b64decode(received["data"], validate=True) == content
            a.send({"type": "broadcast", "message": "sin eco", "from": "admin"})
            assert b.until("broadcast")["from"] == "regression"
            a.send({"type": "private_message", "to": "regression", "message": "barrera"})
            # Si el broadcast se devolviera al emisor, until fallaría al encontrarlo.
            assert a.until("private_message")["message"] == "barrera"
            console.seek(0)
            assert "Traceback" not in console.read()
        finally:
            for client in clients:
                client.close()
    print("PASO: registro y rol seguro, errores de autenticación/destino/base64, emisor verificado")
    print("PASO: archivo de 5 MiB íntegro; 5 MiB + 1 byte rechazado; broadcast sin eco")


def full_connection_queue():
    """Satura una salida realmente bloqueada y exige cierre y limpieza del writer."""
    manager = ConnectionManager()
    started = threading.Event()
    sending, receiving = socket.socketpair()
    sending.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 1024)
    connection = None

    def observed_send(sock, message):
        """Marca el inicio del único escritor antes de llenar el buffer TCP."""
        started.set()
        websocket_handler.send_frame(sock, message)

    try:
        with patch("connection_manager.send_frame", observed_send), patch("connection_manager.log_event"):
            connection = Connection(sending, manager, ("local", 0))
            assert manager.add("slow", connection)
            assert connection.send({"type": "private_message", "message": "x" * 1024 * 1024})
            assert started.wait(2), "El escritor no arrancó"
            for _ in range(1000):
                assert connection.send({"type": "private_message", "message": "pendiente"})
            assert not connection.send({"type": "private_message", "message": "saturación"})
            connection.wait_closed()
            assert not connection._writer.is_alive(), "El escritor bloqueado no terminó"
            assert manager.all_usernames() == [] and sending.fileno() == -1
    finally:
        if connection is not None:
            connection.close()
            connection.wait_closed()
        sending.close()
        receiving.close()
    print("PASO: cola de 1000 mensajes saturada cierra socket, libera usuario y termina writer")


def monitor_fallback_and_overflow():
    """Valida el descarte de eventos antiguos y las métricas sin psutil."""
    # Sin consumidor se reproduce de forma determinista un monitor sobrecargado.
    hub = MonitorHub.__new__(MonitorHub)
    hub._queue = queue.Queue(maxsize=1000)
    for number in range(1003):
        hub.publish({"sequence": number})
    remaining = [hub._queue.get_nowait()["sequence"] for _ in range(1000)]
    assert remaining == list(range(3, 1003))
    with patch("monitor_hub.psutil", None):
        hub = MonitorHub(ConnectionManager(), queue.Queue())
        try:
            hub.record_message(128)
            hub._sampler.join(timeout=0.05)
            stats = hub.stats()
            assert stats["msgs_total"] == 1 and stats["bytes_total"] == 128
            assert stats["cpu_percent"] >= 0 and stats["mem_mb"] > 0
            assert stats["resource_source"] == "stdlib"
            assert stats["process_memory_kind"] == "peak_rss"
            assert stats["system_cpu_percent"] is None
        finally:
            hub.stop()
        assert not hub._sampler.is_alive() and not hub._worker.is_alive()
    print("PASO: monitor descarta eventos antiguos; métricas sin psutil y cierre de sus hilos")


def main():
    """Ejecuta las tres comprobaciones complementarias sin repetir escalabilidad."""
    protocol_checks()
    full_connection_queue()
    monitor_fallback_and_overflow()


if __name__ == "__main__":
    main()
