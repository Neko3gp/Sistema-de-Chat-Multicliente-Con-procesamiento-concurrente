"""Verificación puntual T2: tres clientes, receptor lento y archivo de 4 MiB.

Ejecutar: python scripts/test_concurrency.py. Usa solo la biblioteca estándar,
una base temporal y un servidor hijo con límite externo de 40 segundos.
"""
import base64
import json
import os
from pathlib import Path
import socket
import struct
import subprocess
import sys
import tempfile
import time


class Client:
    """Cliente WebSocket mínimo con control explícito de cuándo leer el socket."""

    def __init__(self, port):
        """Abre TCP con ventana pequeña para reproducir un receptor lento."""
        self.socket = socket.socket()
        self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 65536)
        self.socket.settimeout(8)
        self.socket.connect(("127.0.0.1", port))
        key = base64.b64encode(os.urandom(16)).decode()
        self.socket.sendall((
            "GET / HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\n"
            f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        ).encode())
        response = b""
        while not response.endswith(b"\r\n\r\n"):
            response += self.exact(1)
        assert response.startswith(b"HTTP/1.1 101"), response

    def exact(self, size):
        """Lee un bloque completo o falla si el servidor cierra la conexión."""
        data = bytearray()
        while len(data) < size:
            part = self.socket.recv(size - len(data))
            assert part, "Conexión cerrada durante un frame"
            data.extend(part)
        return bytes(data)

    def header(self):
        """Valida un frame de texto sin máscara y devuelve su longitud."""
        first, second = self.exact(2)
        assert first == 0x81 and not second & 0x80, "Frame corrupto"
        size = second & 127
        if size == 126:
            return struct.unpack(">H", self.exact(2))[0]
        if size == 127:
            return struct.unpack(">Q", self.exact(8))[0]
        return size

    def receive(self):
        """Decodifica el JSON completo de un frame."""
        return json.loads(self.exact(self.header()))

    def until(self, kind):
        """Omite listas de usuarios mientras espera la respuesta indicada."""
        while True:
            message = self.receive()
            if message["type"] == kind:
                return message
            assert message["type"] == "user_list", message

    def send(self, message):
        """Escribe un frame enmascarado como exige el protocolo del navegador."""
        data = json.dumps(message).encode()
        size = len(data)
        if size < 126:
            header = bytes((0x81, size | 0x80))
        elif size <= 65535:
            header = bytes((0x81, 126 | 0x80)) + struct.pack(">H", size)
        else:
            header = bytes((0x81, 127 | 0x80)) + struct.pack(">Q", size)
        mask = os.urandom(4)
        encoded = bytes(value ^ mask[i % 4] for i, value in enumerate(data))
        self.socket.sendall(header + mask + encoded)

    def login(self, name):
        """Solicita autenticación con las credenciales temporales de la prueba."""
        self.send({"type": "login", "username": name, "password": "test-T2"})

    def register(self, name):
        """Crea uno de los tres usuarios temporales."""
        self.send({"type": "register", "username": name, "password": "test-T2"})
        assert self.until("register_result")["ok"]

    def close(self):
        """Interrumpe y cierra TCP sin depender del cierre WebSocket del servidor."""
        try:
            self.socket.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        self.socket.close()


def exercise(port):
    """Comprueba integridad, orden, sesiones únicas y progreso con B bloqueado."""
    clients = []
    try:
        for name in ("A", "B", "C"):
            client = Client(port)
            clients.append(client)
            client.register(name)
            if name == "C":
                # El rechazo no debe sustituir ni cerrar la sesión original de A.
                client.login("A")
                assert client.until("error")["reason"] == "already_connected"
            client.login(name)
            assert client.until("login_result")["ok"]
        a, b, c = clients
        for client in clients:
            while set(client.until("user_list")["users"]) != {"A", "B", "C"}:
                pass

        content = bytes(range(256)) * (4 * 1024 * 1024 // 256)
        a.send({"type": "file", "to": "B", "filename": "T2.bin",
                "data": base64.b64encode(content).decode()})
        size = b.header()
        assert size > 4 * 1024 * 1024
        # B ya recibe el archivo, pero retiene la lectura de su cuerpo hasta
        # completar el chat. Un worker con sendall directo se bloquearía aquí.
        started = time.perf_counter()
        for number in range(200):
            a.send({"type": "private_message", "to": "C", "message": str(number)})
            received = c.until("private_message")
            assert received["from"] == "A" and received["message"] == str(number)
            c.send({"type": "private_message", "to": "A", "message": str(number)})
            if number % 10 == 0:
                # Provoca respuestas desde el hilo lector y desde el worker
                # sobre A simultáneamente, conservando un único escritor.
                a.login("A")
                responses = [a.receive(), a.receive()]
                errors = [msg for msg in responses if msg["type"] == "error"]
                assert len(errors) == 1 and errors[0]["reason"] == "already_connected"
                received, = [msg for msg in responses if msg["type"] == "private_message"]
            else:
                received = a.until("private_message")
            assert received["from"] == "C" and received["message"] == str(number)
        elapsed = time.perf_counter() - started
        file_message = json.loads(b.exact(size))
        assert file_message["type"] == "file" and file_message["from"] == "A"
        assert file_message["filename"] == "T2.bin"
        assert base64.b64decode(file_message["data"], validate=True) == content
        b.close()
        c.close()
        while a.until("user_list")["users"] != ["A"]:
            pass
        print(f"PASO: archivo 4 MiB íntegro; 200 mensajes por sentido en {elapsed:.3f} s")
        print("PASO: chat completado con B sin leer; JSON y orden válidos; login duplicado rechazado")
        print("PASO: desconexiones retiradas de user_list; servidor y BD temporales eliminados al salir")
    finally:
        for client in clients:
            client.close()


def main():
    """Arranca un servidor aislado en segundo plano y garantiza su terminación."""
    backend = Path(__file__).resolve().parents[1] / "backend"
    # El puerto efímero evita interferir con un servidor de desarrollo existente.
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    code = (
        "import sys; sys.path.insert(0, sys.argv[1]); "
        "from tcp_server import start_server; "
        "start_server('127.0.0.1', int(sys.argv[2]))"
    )
    with tempfile.TemporaryDirectory(prefix="chat-t2-") as directory:
        with tempfile.TemporaryFile(mode="w+") as log:
            process = subprocess.Popen(
                ["timeout", "40s", sys.executable, "-u", "-c", code, str(backend), str(port)],
                cwd=directory, stdout=log, stderr=log,
                env={**os.environ, "CHAT_DB_PATH": str(Path(directory) / "chat.db"),
                     "CHAT_LOG_DIR": str(Path(directory) / "logs")},
            )
            try:
                deadline = time.monotonic() + 5
                while True:
                    log.seek(0)
                    if "Servidor escuchando" in log.read():
                        break
                    if process.poll() is not None or time.monotonic() > deadline:
                        raise RuntimeError("El servidor de prueba no arrancó")
                    time.sleep(0.05)
                exercise(port)
            finally:
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


if __name__ == "__main__":
    main()
