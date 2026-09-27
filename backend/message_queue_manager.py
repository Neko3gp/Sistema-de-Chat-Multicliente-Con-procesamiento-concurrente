"""
Cola thread-safe para mensajes entrantes de todos los clientes, procesados
en orden por un único hilo worker (evita que dos hilos reenvíen mensajes al
mismo tiempo de forma desordenada).
"""
import queue
import threading


class MessageQueueManager:
    def __init__(self, handler):
        self._queue = queue.Queue()
        self._handler = handler
        self._worker = threading.Thread(target=self._process_loop, daemon=True)
        self._worker.start()

    def put(self, item):
        self._queue.put(item)

    def _process_loop(self):
        while True:
            item = self._queue.get()
            try:
                self._handler(item)
            except Exception as e:
                print(f"[queue] Error procesando mensaje: {e}")
            finally:
                self._queue.task_done()
