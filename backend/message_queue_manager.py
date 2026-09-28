"""
Cola thread-safe para mensajes entrantes de todos los clientes, procesados
en orden por un único hilo worker (evita que dos hilos reenvíen mensajes al
mismo tiempo de forma desordenada).
"""
import queue
import threading
import logging

from server_log import log_event


class MessageQueueManager:
    """Desacopla la recepción de mensajes de su distribución a los destinos."""

    def __init__(self, handler):
        """Inicia el único worker encargado de resolver los destinos."""
        self._queue = queue.Queue()
        self._handler = handler
        self._worker = threading.Thread(target=self._process_loop, name="queue-worker", daemon=True)
        self._worker.start()

    def put(self, item):
        """Añade trabajo en el orden de recepción de la cola compartida."""
        self._queue.put(item)

    def qsize(self):
        """Devuelve el número aproximado de mensajes pendientes para el monitor."""
        return self._queue.qsize()

    def _process_loop(self):
        """Procesa cada elemento y registra fallos sin perder el hilo worker."""
        while True:
            item = self._queue.get()
            try:
                self._handler(item)
            except Exception as error:
                log_event("error", level=logging.ERROR, reason="queue_handler_failed",
                          exception=type(error).__name__)
            finally:
                self._queue.task_done()
