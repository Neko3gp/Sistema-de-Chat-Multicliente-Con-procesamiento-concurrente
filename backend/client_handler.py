"""
Todo lo que corre dentro del hilo dedicado a UN cliente. Ver
docs/PROTOCOLO_MENSAJES.md para el formato exacto de cada tipo de mensaje.
"""
import json
import logging

from websocket_handler import do_handshake, recv_frame
from connection_manager import Connection
import database
from server_log import log_event, message_metadata

from handlers.common import reply
from handlers.auth import (
    handle_register,
    handle_login,
    handle_monitor_subscribe,
    handle_update_profile,
    handle_list_directory,
)
from handlers.chat import handle_read_receipt, handle_typing, deliver_broadcast, deliver_private
from handlers.groups import (
    handle_group_message,
    handle_create_group,
    handle_update_group,
    deliver_group_message,
)
from handlers.files import handle_file_inbound, deliver_file, validate_file
from handlers.admin import handle_admin_request

HANDSHAKE_TIMEOUT = 10


def handle_client(client_socket, address, connection_manager, message_queue):
    """Autentica y recibe mensajes; delega los envíos al escritor exclusivo."""
    username = None
    connection = None
    reason = "desconexión del cliente"
    log_event("connect", address=f"{address[0]}:{address[1]}", phase="tcp")
    try:
        client_socket.settimeout(HANDSHAKE_TIMEOUT)
        try:
            if not do_handshake(client_socket):
                reason = "handshake inválido"
                return
        except (ValueError, IndexError) as error:
            # Una cabecera malformada también debe cerrar la conexión.
            reason = "handshake malformado"
            log_event("error", level=logging.WARNING, reason=reason, exception=type(error).__name__)
            return
        client_socket.settimeout(None)
        connection = Connection(client_socket, connection_manager, address)

        while True:
            raw = recv_frame(client_socket)
            if raw is None:
                break
            if connection is not None and connection.username is not None:
                username = connection.username

            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                log_event("error", username, level=logging.WARNING, reason="invalid_json")
                if username is not None and connection is not None:
                    reply(connection, {"type": "error", "reason": "invalid_message"})
                continue

            if not isinstance(message, dict):
                reply(connection, {"type": "error", "reason": "invalid_message"})
                continue

            msg_type = message.get("type")
            # Señales efímeras: se procesan, pero no llenan el historial operativo.
            if msg_type not in {"read_receipt", "typing", "ping"}:
                log_event("message", username, **message_metadata(message),
                          direction="received", bytes=len(raw.encode("utf-8")))

            if msg_type == "register":
                handle_register(connection, message)
                continue

            if msg_type == "login":
                logged_in = handle_login(connection, connection_manager, message, username)
                if logged_in is not None:
                    username = logged_in
                continue

            if msg_type == "monitor_subscribe":
                handle_monitor_subscribe(connection, connection_manager)
                continue

            if msg_type.startswith("admin_"):
                if connection.role != "admin":
                    reply(connection, {"type": "error", "reason": "forbidden"})
                else:
                    handle_admin_request(connection, connection_manager, msg_type, message)
                continue

            # El monitor es exclusivo de admins; el chat requiere una sesión user.
            if username is None:
                reply(connection, {"type": "error", "reason": "authentication_required"})
                continue
            if connection.role == "admin":
                reply(connection, {"type": "error", "reason": "forbidden"})
                continue

            if msg_type == "update_profile":
                handle_update_profile(connection, connection_manager, username, message)
                continue

            if msg_type == "list_directory":
                handle_list_directory(connection, username)
                continue

            if msg_type == "read_receipt":
                handle_read_receipt(connection_manager, username, message)
                continue

            if msg_type == "typing":
                handle_typing(connection_manager, username, message)
                continue

            if msg_type == "group_message":
                handle_group_message(
                    connection, connection_manager, message_queue, username, message, raw,
                )
                continue

            if msg_type == "create_group":
                handle_create_group(connection, connection_manager, username, message)
                continue

            if msg_type == "update_group":
                handle_update_group(
                    connection, connection_manager, message_queue, username, message,
                )
                continue

            if msg_type not in {"broadcast", "private_message", "file"}:
                reply(connection, {"type": "error", "reason": "invalid_message"})
                continue
            connection_manager.monitor_hub.record_message(len(raw.encode("utf-8")))
            if msg_type == "file":
                if handle_file_inbound(
                    connection, connection_manager, message_queue, username, message,
                ) == "continue":
                    continue
            message["from"] = username
            message_queue.put({"message": message, "connection_manager": connection_manager})

    except (OSError, ValueError, TypeError, AttributeError) as error:
        reason = type(error).__name__
        log_event("error", username, level=logging.WARNING, reason=reason)
    finally:
        if connection is not None:
            connection.close(reason)
            connection.wait_closed()
        else:
            client_socket.close()
            log_event("disconnect", username, reason=reason)


def process_message(item):
    """Corre en el hilo worker de la cola: decide a quién reenviar cada mensaje."""
    message = item["message"]
    cm = item["connection_manager"]

    msg_type = message.get("type")

    if msg_type in {"broadcast", "private_message", "file", "group_message", "group_notice"}:
        database.save_chat_message(message)
        log_event("processed", message.get("from"), **message_metadata(message),
                  direction="processed")

    if msg_type == "broadcast":
        deliver_broadcast(cm, message)

    elif msg_type == "private_message":
        deliver_private(cm, message)

    elif msg_type in {"group_message", "group_notice"}:
        deliver_group_message(cm, message)

    elif msg_type == "file":
        deliver_file(cm, message)
