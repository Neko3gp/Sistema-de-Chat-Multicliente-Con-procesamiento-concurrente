"""
Todo lo que corre dentro del hilo dedicado a UN cliente. Ver
docs/PROTOCOLO_MENSAJES.md para el formato exacto de cada tipo de mensaje.
"""
import base64
import binascii
import json
import logging
import threading
import time

from websocket_handler import do_handshake, recv_frame
from connection_manager import Connection
import database
from server_log import log_event


MAX_FILE_SIZE = 5 * 1024 * 1024
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

            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                log_event("error", username, level=logging.WARNING, reason="invalid_json")
                continue

            if not isinstance(message, dict):
                _reply(connection, {"type": "error", "reason": "invalid_message"})
                continue

            msg_type = message.get("type")
            log_event("message", username, message_type=msg_type,
                      to=message.get("to"), bytes=len(raw.encode("utf-8")))

            if msg_type == "register":
                ok = database.create_user(message.get("username"), message.get("password"))
                register_reason = None if ok else "username_taken"
                _reply(connection, {"type": "register_result", "ok": ok, "reason": register_reason})
                continue

            if msg_type == "login":
                login_username = message.get("username")
                password = message.get("password")
                if (
                    not isinstance(login_username, str)
                    or not isinstance(password, str)
                    or not database.verify_user(login_username, password)
                ):
                    log_event("login_failed", login_username, reason="invalid_credentials")
                    _reply(connection, {"type": "login_result", "ok": False,
                                           "reason": "invalid_credentials"})
                    continue
                role = database.get_user_role(login_username)
                if username is not None or not connection_manager.add(login_username, connection, role):
                    log_event("login_failed", login_username, reason="already_connected")
                    _reply(connection, {"type": "error", "reason": "already_connected"})
                    continue
                username = login_username
                threading.current_thread().name = f"client-{username}"
                log_event("connect", username, phase="login", result="ok")
                _reply(connection, {"type": "login_result", "ok": True, "reason": None,
                                    "role": role})
                if role == "admin":
                    connection_manager.monitor_hub.subscribe(connection)
                else:
                    _broadcast_user_list(connection_manager)
                continue

            if msg_type == "monitor_subscribe":
                if connection.role != "admin":
                    _reply(connection, {"type": "error", "reason": "forbidden"})
                else:
                    connection_manager.monitor_hub.subscribe(connection)
                continue

            # El monitor es exclusivo de admins; el chat requiere una sesión user.
            if username is None:
                _reply(connection, {"type": "error", "reason": "authentication_required"})
                continue
            if connection.role == "admin":
                _reply(connection, {"type": "error", "reason": "forbidden"})
                continue
            if msg_type not in {"broadcast", "private_message", "file"}:
                _reply(connection, {"type": "error", "reason": "invalid_message"})
                continue
            connection_manager.monitor_hub.record_message(len(raw.encode("utf-8")))
            if msg_type == "file":
                file_error = validate_file(message.get("data"))
                if file_error:
                    _reply(connection, {"type": "error", "reason": file_error})
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


def validate_file(data):
    """Valida base64 en el lector del emisor, sin ocupar el worker compartido."""
    if not isinstance(data, str):
        return "invalid_message"
    try:
        # Los bloques son múltiplos de cuatro para respetar los grupos base64.
        # Solo el último puede incluir padding; evita aceptar datos tras '='.
        size = 0
        for start in range(0, len(data), 64 * 1024):
            chunk = data[start:start + 64 * 1024]
            if start + len(chunk) < len(data) and "=" in chunk:
                return "invalid_message"
            size += len(base64.b64decode(chunk, validate=True))
            if len(data) > 64 * 1024:
                time.sleep(0)  # Da paso a los lectores y escritores de otros usuarios.
    except (binascii.Error, ValueError):
        return "invalid_message"
    return "file_too_large" if size > MAX_FILE_SIZE else None


def process_message(item):
    """Corre en el hilo worker de la cola: decide a quién reenviar cada mensaje."""
    message = item["message"]
    cm = item["connection_manager"]

    msg_type = message.get("type")

    if msg_type == "broadcast":
        count = cm.broadcast(message, exclude=message.get("from"))
        log_event("broadcast", message.get("from"), recipients=count)

    elif msg_type == "private_message":
        target = cm.get(message.get("to"))
        if target:
            target.send(message)
        else:
            sender = cm.get(message.get("from"))
            if sender:
                _reply(sender, {"type": "error", "reason": "user_not_found"})

    elif msg_type == "file":
        # El lector ya validó el archivo; este worker solo resuelve el destino.
        target = cm.get(message.get("to"))
        if target:
            target.send(message)


def _reply(connection, message: dict):
    """Encola una respuesta por el mismo canal que los mensajes reenviados."""
    if message.get("type") == "error":
        log_event("error", connection.username, level=logging.WARNING, reason=message.get("reason"))
    connection.send(message)


def _broadcast_user_list(connection_manager):
    """Difunde la lista actual usando las colas individuales de salida."""
    connection_manager.broadcast({"type": "user_list", "users": connection_manager.all_usernames()})
