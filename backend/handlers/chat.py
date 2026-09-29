# Indicadores de escritura, acuses de lectura y entrega broadcast/privada.
import database
from server_log import log_chat_trace, log_event, message_metadata

from handlers.common import reply


def handle_read_receipt(connection_manager, username, message):
    # chat null/broadcast => sala general; chat=usuario => chat privado.
    chat = message.get("chat")
    if chat in (None, "", "broadcast"):
        log_chat_trace(
            username,
            "read",
            scope="general",
            chat=None,
            reader=username,
        )
        connection_manager.broadcast(
            {"type": "read_receipt", "from": username, "chat": None},
            exclude=username,
        )
    elif isinstance(chat, str):
        log_chat_trace(
            username,
            "read",
            scope="private",
            chat=chat,
            to=chat,
            reader=username,
        )
        target = connection_manager.get(chat)
        if target:
            # Al destinatario: "username ya leyó su chat contigo".
            target.send(
                {"type": "read_receipt", "from": username, "chat": username}
            )


def handle_typing(connection_manager, username, message):
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


def deliver_broadcast(cm, message):
    count = cm.broadcast(message, exclude=message.get("from"))
    log_event("broadcast", message.get("from"), recipients=count)


def deliver_private(cm, message):
    target = cm.get(message.get("to"))
    if target:
        target.send(message)
    else:
        destination = message.get("to")
        if database.get_user_role(destination) is None:
            sender = cm.get(message.get("from"))
            if sender:
                reply(sender, {"type": "error", "reason": "user_not_found"})
        else:
            # Guardado en historial; el destinatario no tiene socket activo.
            detail = {**message_metadata(message), "to": destination}
            log_chat_trace(message.get("from"), "queued", **detail)
