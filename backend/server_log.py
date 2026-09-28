"""Logging del servidor con metadatos y un historial circular de 200 entradas."""
from collections import deque
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import sys


logger = logging.getLogger("chat.server")


class RecentLogHandler(logging.Handler):
    """Conserva copias estructuradas del log para el snapshot del monitor."""

    def __init__(self):
        """Crea el buffer; el lock del Handler protege lecturas y escrituras."""
        super().__init__()
        self.entries = deque(maxlen=200)

    def emit(self, record):
        """Guarda exclusivamente el mensaje del registro y sus metadatos."""
        self.entries.append({
            "ts": datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
            "thread": record.threadName, "level": record.levelname,
            "msg": record.getMessage(),
        })

    def snapshot(self):
        """Devuelve entradas independientes bajo el lock del handler."""
        with self.lock:
            return [dict(entry) for entry in self.entries]


recent_log = RecentLogHandler()


def configure_logging():
    """Configura consola y logs/server.log una sola vez por proceso."""
    if logger.handlers:
        return
    directory = Path(os.environ.get(
        "CHAT_LOG_DIR", Path(__file__).resolve().parents[1] / "logs",
    ))
    directory.mkdir(parents=True, exist_ok=True)
    formatter = logging.Formatter("%(asctime)s [%(threadName)s] %(levelname)s %(message)s")
    for handler in (logging.StreamHandler(sys.stdout),
                    logging.FileHandler(directory / "server.log", encoding="utf-8")):
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    logger.addHandler(recent_log)
    logger.setLevel(logging.INFO)
    logger.propagate = False


def log_event(event, user=None, level=logging.INFO, **detail):
    """Registra un evento sin textos de chat, contraseñas ni datos de archivos."""
    logger.log(level, "%s usuario=%s detalle=%s", event,
               json.dumps(user, ensure_ascii=False), json.dumps(detail, ensure_ascii=False),
               extra={"monitor_event": event, "monitor_user": user, "monitor_detail": detail})
