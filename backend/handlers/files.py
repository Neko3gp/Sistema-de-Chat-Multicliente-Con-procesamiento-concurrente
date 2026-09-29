# Validación de archivos adjuntos y encolado en el hilo del cliente.
import base64
import binascii
import time

import database
from server_log import log_chat_trace, log_event, message_metadata

from handlers.common import reply

MAX_FILE_SIZE = 5 * 1024 * 1024


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


def handle_file_inbound(connection, connection_manager, message_queue, username, message):
    """Devuelve 'continue' si ya se manejó; 'queue' si el caller debe poner from y encolar."""
    file_error = validate_file(message.get("data"))
    if file_error:
        reply(connection, {"type": "error", "reason": file_error})
        return "continue"
    group_id = message.get("groupId")
    if group_id:
        if not isinstance(group_id, str) or not group_id.strip():
            reply(connection, {"type": "error", "reason": "invalid_message"})
            return "continue"
        gid = group_id.strip()
        group_name = message.get("groupName") or ""
        filename = message.get("filename")
        if not isinstance(filename, str) or not filename.strip():
            reply(connection, {"type": "error", "reason": "invalid_message"})
            return "continue"
        stored = database.get_group(gid)
        if stored is not None:
            db_members = [
                name for name in (stored.get("members") or [])
                if isinstance(name, str) and name.strip()
            ]
            if username not in db_members:
                reply(connection, {"type": "error", "reason": "forbidden"})
                return "continue"
            unique_members = list(dict.fromkeys(db_members))
            if not group_name:
                group_name = stored.get("name") or ""
        else:
            members = message.get("members")
            if not isinstance(members, list):
                reply(connection, {"type": "error", "reason": "invalid_message"})
                return "continue"
            cleaned = []
            for name in members:
                if isinstance(name, str) and name.strip() and name.strip() != username:
                    cleaned.append(name.strip())
            unique_members = list(dict.fromkeys([username, *cleaned]))
            if len(unique_members) < 2:
                reply(connection, {"type": "error", "reason": "invalid_message"})
                return "continue"
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
        return "continue"
    # Archivo privado o de sala general: sin metadatos de grupo.
    message.pop("groupId", None)
    message.pop("groupName", None)
    message.pop("members", None)
    return "queue"


def deliver_file(cm, message):
    group_id = message.get("groupId")
    if group_id:
        # Archivo de grupo: mismo fan-out que group_message.
        sender_name = message.get("from")
        members = message.get("members") or []
        delivered = 0
        meta = message_metadata(message)
        for name in members:
            if name == sender_name:
                continue
            target = cm.get(name)
            if target:
                target.send(message)
                delivered += 1
            else:
                log_chat_trace(sender_name, "queued", **{**meta, "to": name})
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
                    reply(sender, {"type": "error", "reason": "user_not_found"})
            else:
                detail = {**message_metadata(message), "to": destination}
                log_chat_trace(message.get("from"), "queued", **detail)
