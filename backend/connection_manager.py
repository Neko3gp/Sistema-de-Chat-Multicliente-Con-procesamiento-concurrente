"""
Estructura compartida entre todos los hilos: quién está conectado ahora mismo.
Protegida con threading.Lock para evitar race conditions.
"""
import threading


class ConnectionManager:
    def __init__(self):
        self._clients = {}  # username -> socket
        self._lock = threading.Lock()

    def add(self, username, client_socket):
        with self._lock:
            self._clients[username] = client_socket

    def remove(self, username):
        with self._lock:
            self._clients.pop(username, None)

    def get(self, username):
        with self._lock:
            return self._clients.get(username)

    def all_usernames(self):
        with self._lock:
            return list(self._clients.keys())

    def broadcast(self, send_func, exclude=None):
        """Aplica send_func(socket) a todos los conectados menos `exclude`."""
        with self._lock:
            targets = [(u, s) for u, s in self._clients.items() if u != exclude]
        for username, sock in targets:
            try:
                send_func(sock)
            except OSError:
                # Si falla el envío, el propio hilo de ese cliente detectará
                # la desconexión y lo limpiará del ConnectionManager.
                pass
