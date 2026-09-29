# Operaciones administrativas CRUD sobre usuarios y grupos.
import database

from handlers.common import reply
from handlers.groups import notify_group_members


def admin_users(connection_manager):
    online = set(connection_manager.all_usernames())
    users = database.list_admin_users()
    for user in users:
        user["online"] = user["username"] in online
    return users


def handle_admin_request(connection, connection_manager, msg_type, message):
    """Ejecuta operaciones CRUD administrativas detrás de la sesión admin."""
    if msg_type == "admin_list_users":
        users = database.list_admin_users()
        online = set(connection_manager.all_usernames())
        for user in users:
            user["online"] = user["username"] in online
        reply(connection, {"type": "admin_users", "users": users})
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
        reply(connection, {"type": "admin_result", "action": msg_type, "ok": ok,
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
                reply(connection, {"type": "admin_result", "action": msg_type, "ok": False,
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
        reply(connection, {"type": "admin_result", "action": msg_type, "ok": ok,
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
        reply(connection, {"type": "admin_result", "action": msg_type, "ok": ok,
                           "reason": None if ok else "cannot_delete_user"})
        if ok:
            reply(connection, {"type": "admin_users", "users": admin_users(connection_manager)})
        return
    if msg_type == "admin_list_groups":
        reply(connection, {"type": "admin_groups", "groups": database.list_groups()})
        return
    if msg_type == "admin_create_group":
        group = database.create_group(message.get("name"), connection.username, message.get("members"))
        if group:
            notify_group_members(connection_manager, group, "group_added")
        reply(connection, {"type": "admin_result", "action": msg_type, "ok": group is not None,
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
                notify_group_members(connection_manager, previous, "group_removed", removed)
            notify_group_members(connection_manager, group, "group_updated")
        reply(connection, {"type": "admin_result", "action": msg_type, "ok": group is not None,
                           "reason": None if group else "invalid_group", "group": group})
        return
    if msg_type == "admin_delete_group":
        group_id = message.get("groupId")
        previous = next((group for group in database.list_groups() if group["id"] == group_id), None)
        ok = database.delete_group(message.get("groupId"))
        if ok and previous:
            notify_group_members(connection_manager, previous, "group_deleted")
        reply(connection, {"type": "admin_result", "action": msg_type, "ok": ok,
                           "reason": None if ok else "group_not_found"})
        return
    reply(connection, {"type": "error", "reason": "invalid_message"})
