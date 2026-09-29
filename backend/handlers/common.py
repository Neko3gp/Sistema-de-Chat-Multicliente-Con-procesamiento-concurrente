# Utilidades compartidas: respuestas al cliente y difusión de presencia.
import logging

from server_log import log_event


def reply(connection, message: dict):
    """Encola una respuesta por el mismo canal que los mensajes reenviados."""
    if message.get("type") == "error":
        log_event("error", connection.username, level=logging.WARNING, reason=message.get("reason"))
    connection.send(message)


def broadcast_user_list(connection_manager):
    """Difunde la lista actual usando las colas individuales de salida."""
    connection_manager.broadcast(connection_manager.user_list_message())
