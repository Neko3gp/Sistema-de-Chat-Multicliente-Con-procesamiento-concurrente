"""
Todo lo que corre dentro del hilo dedicado a UN cliente. Ver
docs/PROTOCOLO_MENSAJES.md para el formato exacto de cada tipo de mensaje.
"""
import json

from websocket_handler import do_handshake, recv_frame, send_frame
import database


def handle_client(client_socket, address, connection_manager, message_queue):
    if not do_handshake(client_socket):
        client_socket.close()
        return

    username = None
    try:
        while True:
            raw = recv_frame(client_socket)
            if raw is None:
                break

            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = message.get("type")

            if msg_type == "register":
                ok = database.create_user(message.get("username"), message.get("password"))
                reason = None if ok else "username_taken"
                _reply(client_socket, {"type": "register_result", "ok": ok, "reason": reason})
                continue

            if msg_type == "login":
                username = message.get("username")
                # TODO: validar password real con database.verify_user
                connection_manager.add(username, client_socket)
                _reply(client_socket, {"type": "login_result", "ok": True})
                _broadcast_user_list(connection_manager)
                continue

            # A partir de aquí el usuario ya debe estar logueado
            message["from"] = username
            message_queue.put({"message": message, "connection_manager": connection_manager})

    except (ConnectionResetError, OSError):
        pass
    finally:
        if username:
            connection_manager.remove(username)
            _broadcast_user_list(connection_manager)
        client_socket.close()


def process_message(item):
    """Corre en el hilo worker de la cola: decide a quién reenviar cada mensaje."""
    message = item["message"]
    cm = item["connection_manager"]
    payload = json.dumps(message)

    msg_type = message.get("type")

    if msg_type == "broadcast":
        cm.broadcast(lambda sock: send_frame(sock, payload), exclude=message.get("from"))

    elif msg_type == "private_message":
        target = cm.get(message.get("to"))
        if target:
            send_frame(target, payload)
        else:
            sender = cm.get(message.get("from"))
            if sender:
                _reply(sender, {"type": "error", "reason": "user_not_found"})

    elif msg_type == "file":
        target = cm.get(message.get("to"))
        if target:
            send_frame(target, payload)


def _reply(client_socket, message: dict):
    send_frame(client_socket, json.dumps(message))


def _broadcast_user_list(connection_manager):
    payload = json.dumps({"type": "user_list", "users": connection_manager.all_usernames()})
    connection_manager.broadcast(lambda sock: send_frame(sock, payload))
