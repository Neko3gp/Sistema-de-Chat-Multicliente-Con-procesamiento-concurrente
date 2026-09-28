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
            if connection is not None and connection.username is not None:
                username = connection.username

            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                log_event("error", username, level=logging.WARNING, reason="invalid_json")
                if username is not None and connection is not None:
                    _reply(connection, {"type": "error", "reason": "invalid_message"})
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
                password = message.get("password")
                login_username = database.resolve_username(message.get("username"))
                if (
                    login_username is None
                    or not isinstance(password, str)
                    or not database.verify_user(login_username, password)
                ):
                    log_event("login_failed", message.get("username"), reason="invalid_credentials")
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
                profile = database.get_public_profile(username)
                _reply(connection, {
                    "type": "login_result",
                    "ok": True,
                    "reason": None,
                    "username": username,
                    "role": role,
                    "avatarUrl": profile.get("avatarUrl", ""),
                    "description": profile.get("description", ""),
                    "email": profile.get("email", ""),
                })
                if role == "admin":
                    connection_manager.monitor_hub.subscribe(connection)
                else:
                    _reply(connection, {
                        "type": "history",
                        "messages": database.get_chat_history(login_username),
                    })
                    _reply(connection, {
                        "type": "group_list",
                        "groups": database.get_user_groups(login_username),
                    })
                    _broadcast_user_list(connection_manager)
                continue

            if msg_type == "monitor_subscribe":
                if connection.role != "admin":
                    _reply(connection, {"type": "error", "reason": "forbidden"})
                else:
                    connection_manager.monitor_hub.subscribe(connection)
                continue

            if msg_type.startswith("admin_"):
                if connection.role != "admin":
                    _reply(connection, {"type": "error", "reason": "forbidden"})
                else:
                    _handle_admin_request(connection, connection_manager, msg_type, message)
                continue

            # El monitor es exclusivo de admins; el chat requiere una sesión user.
            if username is None:
                _reply(connection, {"type": "error", "reason": "authentication_required"})
                continue
            if connection.role == "admin":
                _reply(connection, {"type": "error", "reason": "forbidden"})
                continue

            if msg_type == "update_profile":
                updated = database.update_user_profile(
                    username,
                    message.get("avatarUrl", ""),
                    message.get("description", ""),
                    message.get("email", ""),
                )
                if updated is None:
                    _reply(connection, {"type": "error", "reason": "invalid_message"})
                    continue
                _reply(connection, {
                    "type": "profile_result",
                    "ok": True,
                    "reason": None,
                    "avatarUrl": updated["avatarUrl"],
                    "description": updated["description"],
                    "email": updated["email"],
                })
                _broadcast_user_list(connection_manager)
                continue

            if msg_type == "list_directory":
                _reply(connection, {
                    "type": "directory",
                    "users": database.list_directory_users(exclude_username=username),
                })
                continue

            if msg_type == "read_receipt":
                # chat null/broadcast => sala general; chat=usuario => chat privado.
                chat = message.get("chat")
                if chat in (None, "", "broadcast"):
                    connection_manager.broadcast(
                        {"type": "read_receipt", "from": username, "chat": None},
                        exclude=username,
                    )
                elif isinstance(chat, str):
                    target = connection_manager.get(chat)
                    if target:
                        # Al destinatario: "username ya leyó su chat contigo".
                        target.send(
                            {"type": "read_receipt", "from": username, "chat": username}
                        )
                continue

            if msg_type == "typing":
                is_typing = bool(message.get("isTyping"))
                group_id = message.get("groupId")
                if isinstance(group_id, str) and group_id.strip():
                    gid = group_id.strip()
                    payload = {
                        "type": "typing",
                        "from": username,
                        "groupId": gid,
                        "isTyping": is_typing,
                    }
                    members = message.get("members")
                    stored = database.get_group(gid)
                    if stored and isinstance(stored.get("members"), list) and stored["members"]:
                        members = stored["members"]
                    elif not isinstance(members, list):
                        members = []
                    for name in members:
                        if not isinstance(name, str) or name.strip() == username:
                            continue
                        target = connection_manager.get(name.strip())
                        if target:
                            target.send(payload)
                else:
                    chat = message.get("chat")
                    if chat in (None, "", "broadcast"):
                        connection_manager.broadcast(
                            {
                                "type": "typing",
                                "from": username,
                                "chat": None,
                                "isTyping": is_typing,
                            },
                            exclude=username,
                        )
                    elif isinstance(chat, str):
                        target = connection_manager.get(chat)
                        if target:
                            target.send(
                                {
                                    "type": "typing",
                                    "from": username,
                                    "chat": username,
                                    "isTyping": is_typing,
                                }
                            )
                continue

            if msg_type == "group_message":
                members = message.get("members")
                group_id = message.get("groupId")
                group_name = message.get("groupName") or ""
                text = message.get("message")
                if (
                    not isinstance(group_id, str)
                    or not group_id.strip()
                    or not isinstance(text, str)
                    or not text.strip()
                ):
                    _reply(connection, {"type": "error", "reason": "invalid_message"})
                    continue
                gid = group_id.strip()
                stored = database.get_group(gid)
                if stored is not None:
                    db_members = [
                        name for name in (stored.get("members") or [])
                        if isinstance(name, str) and name.strip()
                    ]
                    if username not in db_members:
                        _reply(connection, {"type": "error", "reason": "forbidden"})
                        continue
                    unique_members = list(dict.fromkeys(db_members))
                    if not group_name:
                        group_name = stored.get("name") or ""
                else:
                    if not isinstance(members, list):
                        _reply(connection, {"type": "error", "reason": "invalid_message"})
                        continue
                    cleaned = []
                    for name in members:
                        if isinstance(name, str) and name.strip() and name.strip() != username:
                            cleaned.append(name.strip())
                    unique_members = list(dict.fromkeys([username, *cleaned]))
                    if len(unique_members) < 2:
                        _reply(connection, {"type": "error", "reason": "invalid_message"})
                        continue
                    database.save_group(gid, group_name or "Grupo", username, unique_members)
                payload = {
                    "type": "group_message",
                    "from": username,
                    "groupId": gid,
                    "groupName": group_name if isinstance(group_name, str) else "",
                    "members": unique_members,
                    "message": text.strip(),
                }
                connection_manager.monitor_hub.record_message(len(raw.encode("utf-8")))
                message_queue.put({"message": payload, "connection_manager": connection_manager})
                continue

            if msg_type == "create_group":
                members = message.get("members")
                if not isinstance(members, list):
                    _reply(connection, {"type": "error", "reason": "invalid_group"})
                    continue
                cleaned = []
                for name in members:
                    if isinstance(name, str) and name.strip() and name.strip() != username:
                        cleaned.append(name.strip())
                unique_members = list(dict.fromkeys([username, *cleaned]))
                group = database.create_group(
                    message.get("name"),
                    username,
                    unique_members,
                    group_id=message.get("groupId"),
                )
                if group is None:
                    _reply(connection, {"type": "error", "reason": "invalid_group"})
                    continue
                _notify_group_members(connection_manager, group, "group_added")
                _reply(connection, {
                    "type": "group_updated",
                    "group": group,
                    "ok": True,
                })
                continue

            if msg_type == "update_group":
                group_id = message.get("groupId")
                previous = database.get_group(group_id) if isinstance(group_id, str) else None
                if previous is None:
                    _reply(connection, {"type": "error", "reason": "group_not_found"})
                    continue
                if previous.get("owner") != username:
                    _reply(connection, {"type": "error", "reason": "forbidden"})
                    continue
                group = database.update_group_by_owner(
                    previous["id"],
                    username,
                    message.get("name"),
                    message.get("members"),
                )
                if group is None:
                    _reply(connection, {"type": "error", "reason": "invalid_group"})
                    continue
                previous_members = set(previous.get("members") or [])
                current_members = set(group.get("members") or [])
                removed = previous_members - current_members
                added = current_members - previous_members
                if removed:
                    _notify_group_members(
                        connection_manager, previous, "group_removed", removed,
                    )
                if added:
                    _notify_group_members(
                        connection_manager, group, "group_added", added,
                    )
                _notify_group_members(connection_manager, group, "group_updated")
                if added:
                    _queue_group_notice(
                        message_queue,
                        connection_manager,
                        actor=username,
                        group=group,
                        action="added",
                        targets=added,
                    )
                if removed:
                    _queue_group_notice(
                        message_queue,
                        connection_manager,
                        actor=username,
                        group=group,
                        action="removed",
                        targets=removed,
                    )
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
                group_id = message.get("groupId")
                if group_id:
                    if not isinstance(group_id, str) or not group_id.strip():
                        _reply(connection, {"type": "error", "reason": "invalid_message"})
                        continue
                    gid = group_id.strip()
                    group_name = message.get("groupName") or ""
                    filename = message.get("filename")
                    if not isinstance(filename, str) or not filename.strip():
                        _reply(connection, {"type": "error", "reason": "invalid_message"})
                        continue
                    stored = database.get_group(gid)
                    if stored is not None:
                        db_members = [
                            name for name in (stored.get("members") or [])
                            if isinstance(name, str) and name.strip()
                        ]
                        if username not in db_members:
                            _reply(connection, {"type": "error", "reason": "forbidden"})
                            continue
                        unique_members = list(dict.fromkeys(db_members))
                        if not group_name:
                            group_name = stored.get("name") or ""
                    else:
                        members = message.get("members")
                        if not isinstance(members, list):
                            _reply(connection, {"type": "error", "reason": "invalid_message"})
                            continue
                        cleaned = []
                        for name in members:
                            if isinstance(name, str) and name.strip() and name.strip() != username:
                                cleaned.append(name.strip())
                        unique_members = list(dict.fromkeys([username, *cleaned]))
                        if len(unique_members) < 2:
                            _reply(connection, {"type": "error", "reason": "invalid_message"})
                            continue
                        database.save_group(gid, group_name or "Grupo", username, unique_members)
                    payload = {
                        "type": "file",
                        "from": username,
                        "groupId": gid,
                        "groupName": group_name if isinstance(group_name, str) else "",
                        "members": unique_members,
                        "filename": filename.strip(),
                        "data": message.get("data"),
                    }
                    mime = message.get("mimeType")
                    if isinstance(mime, str) and mime.strip():
                        payload["mimeType"] = mime.strip()
                    message_queue.put(
                        {"message": payload, "connection_manager": connection_manager}
                    )
                    continue
                # Archivo privado o de sala general: sin metadatos de grupo.
                message.pop("groupId", None)
                message.pop("groupName", None)
                message.pop("members", None)
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

    if msg_type in {"broadcast", "private_message", "file", "group_message", "group_notice"}:
        database.save_chat_message(message)

    if msg_type == "broadcast":
        count = cm.broadcast(message, exclude=message.get("from"))
        log_event("broadcast", message.get("from"), recipients=count)

    elif msg_type == "private_message":
        target = cm.get(message.get("to"))
        if target:
            target.send(message)
        else:
            if database.get_user_role(message.get("to")) is None:
                sender = cm.get(message.get("from"))
                if sender:
                    _reply(sender, {"type": "error", "reason": "user_not_found"})

    elif msg_type in {"group_message", "group_notice"}:
        sender_name = message.get("from")
        members = message.get("members") or []
        delivered = 0
        # Los avisos de grupo también llegan al admin que los provocó.
        include_sender = msg_type == "group_notice"
        for name in members:
            if name == sender_name and not include_sender:
                continue
            target = cm.get(name)
            if target:
                target.send(message)
                delivered += 1
        log_event(
            "message",
            sender_name,
            kind=msg_type,
            groupId=message.get("groupId"),
            delivered=delivered,
        )

    elif msg_type == "file":
        group_id = message.get("groupId")
        if group_id:
            # Archivo de grupo: mismo fan-out que group_message.
            sender_name = message.get("from")
            members = message.get("members") or []
            delivered = 0
            for name in members:
                if name == sender_name:
                    continue
                target = cm.get(name)
                if target:
                    target.send(message)
                    delivered += 1
            log_event(
                "file",
                sender_name,
                groupId=group_id,
                filename=message.get("filename"),
                delivered=delivered,
            )
        else:
            # Sin "to": archivo de sala general (broadcast). Con "to": privado.
            destination = message.get("to")
            if not destination:
                count = cm.broadcast(message, exclude=message.get("from"))
                log_event(
                    "file",
                    message.get("from"),
                    to=None,
                    filename=message.get("filename"),
                    recipients=count,
                )
            else:
                target = cm.get(destination)
                if target:
                    target.send(message)
                elif database.get_user_role(destination) is None:
                    sender = cm.get(message.get("from"))
                    if sender:
                        _reply(sender, {"type": "error", "reason": "user_not_found"})


def _handle_admin_request(connection, connection_manager, msg_type, message):
    """Ejecuta operaciones CRUD administrativas detrás de la sesión admin."""
    if msg_type == "admin_list_users":
        users = database.list_admin_users()
        online = set(connection_manager.all_usernames())
        for user in users:
            user["online"] = user["username"] in online
        _reply(connection, {"type": "admin_users", "users": users})
        return
    if msg_type == "admin_create_user":
        username = message.get("username")
        password = message.get("password")
        role = message.get("role", "user")
        ok = isinstance(username, str) and isinstance(password, str) and bool(password)
        if ok:
            try:
                ok = database.create_user(username.strip(), password, role)
            except ValueError:
                ok = False
        _reply(connection, {"type": "admin_result", "action": msg_type, "ok": ok,
                             "reason": None if ok else "invalid_user" if role not in {"user", "admin"} else "username_taken"})
        return
    if msg_type == "admin_update_user":
        username = message.get("username")
        new_username = (message.get("newUsername") or username or "").strip()
        if new_username != username:
            ok = database.rename_user(username, new_username)
            target = connection_manager.get(username)
            if ok and target:
                ok = connection_manager.rename(username, new_username, target)
                if ok:
                    target.send({"type": "username_changed", "username": new_username})
            if not ok:
                _reply(connection, {"type": "admin_result", "action": msg_type, "ok": False,
                                     "reason": "username_taken"})
                return
            username = new_username
        ok = database.update_user_as_admin(
            username,
            password=message.get("password") or None,
            role=message.get("role"),
            avatar_url=message.get("avatarUrl"),
            description=message.get("description"),
            email=message.get("email"),
        )
        _reply(connection, {"type": "admin_result", "action": msg_type, "ok": ok,
                     "reason": None if ok else "invalid_user", "username": username})
        return
    if msg_type == "admin_delete_user":
        username = message.get("username")
        if username == connection.username:
            ok = False
        else:
            target = connection_manager.get(username)
            if target:
                target.close("cuenta eliminada por un administrador")
            ok = database.delete_user(username)
        _reply(connection, {"type": "admin_result", "action": msg_type, "ok": ok,
                             "reason": None if ok else "cannot_delete_user"})
        if ok:
            _reply(connection, {"type": "admin_users", "users": _admin_users(connection_manager)})
        return
    if msg_type == "admin_list_groups":
        _reply(connection, {"type": "admin_groups", "groups": database.list_groups()})
        return
    if msg_type == "admin_create_group":
        group = database.create_group(message.get("name"), connection.username, message.get("members"))
        if group:
            _notify_group_members(connection_manager, group, "group_added")
        _reply(connection, {"type": "admin_result", "action": msg_type, "ok": group is not None,
                             "reason": None if group else "invalid_group", "group": group})
        return
    if msg_type == "admin_update_group":
        previous = database.get_group(message.get("groupId"))
        group = database.save_group(
            message.get("groupId"), message.get("name"), connection.username, message.get("members"),
        )
        if group:
            previous_members = set(previous["members"] if previous else [])
            current_members = set(group["members"])
            removed = previous_members - current_members
            if removed and previous:
                _notify_group_members(connection_manager, previous, "group_removed", removed)
            _notify_group_members(connection_manager, group, "group_updated")
        _reply(connection, {"type": "admin_result", "action": msg_type, "ok": group is not None,
                             "reason": None if group else "invalid_group", "group": group})
        return
    if msg_type == "admin_delete_group":
        group_id = message.get("groupId")
        previous = next((group for group in database.list_groups() if group["id"] == group_id), None)
        ok = database.delete_group(message.get("groupId"))
        if ok and previous:
            _notify_group_members(connection_manager, previous, "group_deleted")
        _reply(connection, {"type": "admin_result", "action": msg_type, "ok": ok,
                             "reason": None if ok else "group_not_found"})
        return
    _reply(connection, {"type": "error", "reason": "invalid_message"})


def _admin_users(connection_manager):
    online = set(connection_manager.all_usernames())
    users = database.list_admin_users()
    for user in users:
        user["online"] = user["username"] in online
    return users


def _format_member_list(names):
    items = [name for name in names if isinstance(name, str) and name.strip()]
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]} y {items[1]}"
    return f"{', '.join(items[:-1])} y {items[-1]}"


def _format_group_notice(actor, action, targets):
    who = _format_member_list(sorted(targets))
    if action == "added":
        return f"{actor} agregó a {who}"
    return f"{actor} expulsó a {who}"


def _queue_group_notice(message_queue, connection_manager, *, actor, group, action, targets):
    cleaned = {
        name.strip()
        for name in targets
        if isinstance(name, str) and name.strip() and name.strip() != actor
    }
    if not cleaned or not group:
        return
    payload = {
        "type": "group_notice",
        "from": actor,
        "groupId": group["id"],
        "groupName": group.get("name") or "",
        "members": list(group.get("members") or []),
        "action": action,
        "targets": sorted(cleaned),
        "message": _format_group_notice(actor, action, cleaned),
    }
    message_queue.put({"message": payload, "connection_manager": connection_manager})


def _notify_group_members(connection_manager, group, event_type, members=None):
    """Notifica a los integrantes conectados de un cambio administrativo."""
    payload = {
        "type": event_type,
        "group": group,
        "message": "Se te agregó a este grupo" if event_type == "group_added" else None,
    }
    recipients = members if members is not None else group.get("members", [])
    for member in recipients:
        target = connection_manager.get(member)
        if target:
            target.send(payload)


def _reply(connection, message: dict):
    """Encola una respuesta por el mismo canal que los mensajes reenviados."""
    if message.get("type") == "error":
        log_event("error", connection.username, level=logging.WARNING, reason=message.get("reason"))
    connection.send(message)


def _broadcast_user_list(connection_manager):
    """Difunde la lista actual usando las colas individuales de salida."""
    connection_manager.broadcast(connection_manager.user_list_message())
