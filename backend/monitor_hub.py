"""Monitor administrativo aislado del chat, con eventos acotados y métricas."""
import logging
import queue
import sys
import threading
import time

try:
    import psutil
except ImportError:
    psutil = None

try:
    import resource
except ImportError:
    resource = None

from server_log import log_event, recent_log


class MonitorHub:
    """Distribuye metadatos a administradores sin realizar envíos en el chat."""

    def __init__(self, connections, message_queue):
        """Inicia el distribuidor y el muestreo independiente cada dos segundos."""
        self.connections = connections
        self.message_queue = message_queue
        self._queue = queue.Queue(maxsize=1000)
        self._admins = set()
        # send puede cerrar una conexión saturada y llamar a unsubscribe.
        self._admins_lock = threading.RLock()
        self._metrics_lock = threading.Lock()
        self._msgs_total = 0
        self._bytes_total = 0
        self._rates = {"msgs_per_sec": 0.0, "cpu_percent": 0.0, "mem_mb": 0.0}
        self._stop = threading.Event()
        self._process = psutil.Process() if psutil is not None else None
        if self._process is not None:
            self._process.cpu_percent(None)
        self._last_wall = time.monotonic()
        self._last_cpu = time.process_time()
        self._last_msgs = 0
        self._worker = threading.Thread(target=self._dispatch_loop, name="monitor-hub", daemon=True)
        self._sampler = threading.Thread(target=self._stats_loop, name="monitor-stats", daemon=True)
        recent_log.publisher = self.publish
        self._worker.start()
        self._sampler.start()

    def publish(self, event):
        """Encola sin esperar; cuando se llena, elimina el evento más antiguo."""
        while True:
            try:
                self._queue.put_nowait(event)
                return
            except queue.Full:
                try:
                    self._queue.get_nowait()
                    self._queue.task_done()
                except queue.Empty:
                    pass

    def subscribe(self, connection):
        """Encola el snapshot antes de permitir los eventos en vivo del admin."""
        if connection.role != "admin":
            return False
        with self._admins_lock:
            if connection in self._admins:
                return True
            snapshot = {"type": "monitor_snapshot", "log": recent_log.snapshot(),
                        "stats": self.stats(), "users": self.connections.all_usernames()}
            if not connection.send(snapshot):
                return False
            self._admins.add(connection)
            return True

    def unsubscribe(self, connection):
        """Retira una conexión administrativa concreta de manera idempotente."""
        with self._admins_lock:
            self._admins.discard(connection)

    def record_message(self, size):
        """Cuenta mensajes de chat autenticados y sus bytes JSON de entrada."""
        with self._metrics_lock:
            self._msgs_total += 1
            self._bytes_total += size

    def stats(self):
        """Obtiene contadores actuales y las tasas de la última muestra."""
        with self._metrics_lock:
            values = {**self._rates, "msgs_total": self._msgs_total,
                      "bytes_total": self._bytes_total}
        return {"connected": len(self.connections.all_usernames()),
                "threads": threading.active_count(), "queue_size": self.message_queue.qsize(),
                **values}

    def _dispatch_loop(self):
        """Reparte únicamente desde el hilo del monitor hacia colas de salida."""
        while True:
            event = self._queue.get()
            try:
                if event is None:
                    return
                with self._admins_lock:
                    targets = list(self._admins)
                for connection in targets:
                    connection.send(event)
            finally:
                self._queue.task_done()

    def _sample(self):
        """Mide CPU del proceso y memoria RSS; el respaldo mide RSS máximo."""
        now, cpu = time.monotonic(), time.process_time()
        elapsed = max(now - self._last_wall, 1e-9)
        if self._process is not None:
            try:
                cpu_percent = self._process.cpu_percent(None)
                mem_mb = self._process.memory_info().rss / (1024 * 1024)
            except psutil.Error:
                self._process = None
                log_event("error", level=logging.WARNING, reason="psutil_failed_using_stdlib")
        if self._process is None:
            cpu_percent = (cpu - self._last_cpu) / elapsed * 100
            usage = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss if resource else 0
            mem_mb = usage / (1024 * 1024 if sys.platform == "darwin" else 1024)
        with self._metrics_lock:
            total = self._msgs_total
            self._rates = {"msgs_per_sec": round((total - self._last_msgs) / elapsed, 3),
                           "cpu_percent": round(cpu_percent, 2), "mem_mb": round(mem_mb, 2)}
        self._last_wall, self._last_cpu, self._last_msgs = now, cpu, total

    def _stats_loop(self):
        """Publica estadísticas sin depender del worker que distribuye el chat."""
        self._sample()
        while not self._stop.wait(2):
            self._sample()
            self.publish({"type": "monitor_stats", **self.stats(),
                          "users": self.connections.all_usernames()})

    def stop(self):
        """Desconecta el publicador y detiene los dos hilos propios del monitor."""
        recent_log.publisher = None
        self._stop.set()
        self._sampler.join(timeout=3)
        self.publish(None)
        self._worker.join(timeout=3)
