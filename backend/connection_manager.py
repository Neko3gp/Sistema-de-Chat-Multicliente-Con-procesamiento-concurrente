"""Conexiones con escritor exclusivo y registro de usuarios protegido por lock."""
import json
import logging
import queue
import socket
import threading
import time

from websocket_handler import send_frame
from server_log import log_event


class Connection:
    """Aísla cada socket detrás de una cola acotada y un único hilo escritor."""

    def __init__(self, client_socket, manager, address):
        """Inicia el escritor después de completar el handshake HTTP."""
        self.socket = client_socket
        self.manager = manager
        self.username = None
        self._outgoing = queue.Queue(maxsize=1000)
        self._lock = threading.Lock()
        self._closed = False
        self._writer = threading.Thread(
            target=self._write_loop, name=f"writer-{address[0]}:{address[1]}",
            daemon=True,
        )
        self._writer.start()

    def bind(self, username):
        """Asocia una identidad una sola vez, salvo que ya se haya cerrado."""
        with self._lock:
            if self._closed or self.username is not None:
                return False
            self.username = username
            self._writer.name = f"writer-{username}"
            return True

    def send(self, message):
        """Encola sin esperar al socket; desconecta a un receptor saturado."""
        with self._lock:
            if self._closed:
                return False
            try:
                self._outgoing.put_nowait(message)
                return True
            except queue.Full:
                pass
        log_event("error", self.username, level=logging.WARNING, reason="outgoing_queue_full")
        self.close("cliente demasiado lento")
        return False

    def _write_loop(self):
        """Es el único lugar que escribe frames WebSocket en este socket."""
        try:
            while True:
                message = self._outgoing.get()
                try:
                    if message is None:
                        return
                    started = time.monotonic()
                    send_frame(self.socket, json.dumps(message))
                    if message.get("type") == "file":
                        data = message["data"]
                        size = len(data.rstrip("=")) * 6 // 8
                        log_event("file", message.get("from"), to=self.username,
                                  filename=message.get("filename"), bytes=size,
                                  duration_ms=round((time.monotonic() - started) * 1000, 3))
                finally:
                    self._outgoing.task_done()
        except (OSError, TypeError, ValueError) as error:
            if not self._closed:
                log_event("error", self.username, level=logging.ERROR,
                          reason="writer_failed", exception=type(error).__name__)
            self.close("error de escritura")

    def close(self, reason="desconexión del cliente"):
        """Cierra una sola vez, despierta ambos hilos y retira la sesión exacta."""
        with self._lock:
            if self._closed:
                return
            self._closed = True
            # Descartar pendientes libera memoria y garantiza espacio al centinela.
            while True:
                try:
                    self._outgoing.get_nowait()
                    self._outgoing.task_done()
                except queue.Empty:
                    break
            self._outgoing.put_nowait(None)
            # shutdown interrumpe recv y un sendall bloqueado por el receptor.
            try:
                self.socket.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            self.socket.close()
        log_event("disconnect", self.username, reason=reason)
        if self.username and self.manager.remove(self.username, self):
            self.manager.broadcast({"type": "user_list", "users": self.manager.all_usernames()})

    def wait_closed(self):
        """Espera al escritor sin intentar unir el hilo consigo mismo."""
        if threading.current_thread() is not self._writer:
            self._writer.join(timeout=1)


class ConnectionManager:
    """Mantiene las sesiones únicas y obtiene destinos bajo un lock compartido."""

    def __init__(self):
        """Crea el registro de usuario a Connection y su lock."""
        self._clients = {}
        self._lock = threading.Lock()

    def add(self, username, connection):
        """Reserva atómicamente el usuario; nunca reemplaza una sesión existente."""
        with self._lock:
            if username in self._clients or not connection.bind(username):
                return False
            self._clients[username] = connection
            return True

    def remove(self, username, connection):
        """Retira la conexión indicada sin borrar una sesión posterior."""
        with self._lock:
            if self._clients.get(username) is connection:
                del self._clients[username]
                return True
            return False

    def get(self, username):
        """Obtiene una conexión sin mantener el lock durante el envío."""
        with self._lock:
            return self._clients.get(username)

    def all_usernames(self):
        """Devuelve una copia de los nombres conectados."""
        with self._lock:
            return list(self._clients)

    def broadcast(self, message, exclude=None):
        """Encola en cada destino sin esperar a que sus sockets puedan escribir."""
        with self._lock:
            targets = [conn for user, conn in self._clients.items() if user != exclude]
        for connection in targets:
            connection.send(message)
        return len(targets)
