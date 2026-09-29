# Mensajes de grupo, CRUD de grupos y avisos de membresía.
import database
from server_log import log_chat_trace, log_event, message_metadata

from handlers.common import reply


def handle_group_message(connection, connection_manager, message_queue, username, message, raw):
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
        reply(connection, {"type": "error", "reason": "invalid_message"})
        return
    gid = group_id.strip()
    stored = database.get_group(gid)
    if stored is not None:
        db_members = [
            name for name in (stored.get("members") or [])
            if isinstance(name, str) and name.strip()
        ]
        if username not in db_members:
            reply(connection, {"type": "error", "reason": "forbidden"})
            return
        unique_members = list(dict.fromkeys(db_members))
        if not group_name:
            group_name = stored.get("name") or ""
    else:
        if not isinstance(members, list):
            reply(connection, {"type": "error", "reason": "invalid_message"})
            return
        cleaned = []
        for name in members:
            if isinstance(name, str) and name.strip() and name.strip() != username:
                cleaned.append(name.strip())
        unique_members = list(dict.fromkeys([username, *cleaned]))
        if len(unique_members) < 2:
            reply(connection, {"type": "error", "reason": "invalid_message"})
            return
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


def handle_create_group(connection, connection_manager, username, message):
    members = message.get("members")
    if not isinstance(members, list):
        reply(connection, {"type": "error", "reason": "invalid_group"})
        return
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
        reply(connection, {"type": "error", "reason": "invalid_group"})
        return
    notify_group_members(connection_manager, group, "group_added")
    reply(connection, {
        "type": "group_updated",
        "group": group,
        "ok": True,
    })


def handle_update_group(connection, connection_manager, message_queue, username, message):
    group_id = message.get("groupId")
    previous = database.get_group(group_id) if isinstance(group_id, str) else None
    if previous is None:
        reply(connection, {"type": "error", "reason": "group_not_found"})
        return
    if previous.get("owner") != username:
        reply(connection, {"type": "error", "reason": "forbidden"})
        return
    group = database.update_group_by_owner(
        previous["id"],
        username,
        message.get("name"),
        message.get("members"),
    )
    if group is None:
        reply(connection, {"type": "error", "reason": "invalid_group"})
        return
    previous_members = set(previous.get("members") or [])
    current_members = set(group.get("members") or [])
    removed = previous_members - current_members
    added = current_members - previous_members
    if removed:
        notify_group_members(
            connection_manager, previous, "group_removed", removed,
        )
    if added:
        notify_group_members(
            connection_manager, group, "group_added", added,
        )
    notify_group_members(connection_manager, group, "group_updated")
    if added:
        queue_group_notice(
            message_queue,
            connection_manager,
            actor=username,
            group=group,
            action="added",
            targets=added,
        )
    if removed:
        queue_group_notice(
            message_queue,
            connection_manager,
            actor=username,
            group=group,
            action="removed",
            targets=removed,
        )


def deliver_group_message(cm, message):
    sender_name = message.get("from")
    members = message.get("members") or []
    delivered = 0
    # Los avisos de grupo también llegan al admin que los provocó.
    include_sender = message.get("type") == "group_notice"
    meta = message_metadata(message)
    for name in members:
        if name == sender_name and not include_sender:
            continue
        target = cm.get(name)
        if target:
            target.send(message)
            delivered += 1
        else:
            log_chat_trace(sender_name, "queued", **{**meta, "to": name})
    log_event(
        "routed",
        sender_name,
        kind=message.get("type"),
        groupId=message.get("groupId"),
        delivered=delivered,
    )


def notify_group_members(connection_manager, group, event_type, members=None):
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


def queue_group_notice(message_queue, connection_manager, *, actor, group, action, targets):
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
        "message": format_group_notice(actor, action, cleaned),
    }
    message_queue.put({"message": payload, "connection_manager": connection_manager})


def format_member_list(names):
    items = [name for name in names if isinstance(name, str) and name.strip()]
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]} y {items[1]}"
    return f"{', '.join(items[:-1])} y {items[-1]}"


def format_group_notice(actor, action, targets):
    who = format_member_list(sorted(targets))
    if action == "added":
        return f"{actor} agregó a {who}"
    return f"{actor} expulsó a {who}"
