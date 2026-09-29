# Registro, login, perfil, directorio y suscripción al monitor administrativo.
import logging
import threading

import database
from server_log import log_chat_trace, log_event

from handlers.common import broadcast_user_list, reply


def handle_register(connection, message):
    ok = database.create_user(message.get("username"), message.get("password"))
    register_reason = None if ok else "username_taken"
    reply(connection, {"type": "register_result", "ok": ok, "reason": register_reason})


def _trace_history_deliveries(username):
    """Registra entregas pendientes que el usuario recupera al reconectar."""
    for detail in database.claim_pending_deliveries(username):
        payload = {
            key: value for key, value in detail.items()
            if key not in {"sender", "stage"}
        }
        payload.setdefault("to", username)
        payload["via"] = "history"
        log_chat_trace(
            detail.get("sender") or payload.get("from"),
            "delivered_on_reconnect",
            **payload,
        )


def handle_login(connection, connection_manager, message, current_username):
    """Devuelve el username en éxito; None si falló (respuesta ya enviada)."""
    password = message.get("password")
    login_username = database.resolve_username(message.get("username"))
    if (
        login_username is None
        or not isinstance(password, str)
        or not database.verify_user(login_username, password)
    ):
        log_event("login_failed", message.get("username"), reason="invalid_credentials")
        reply(connection, {"type": "login_result", "ok": False,
                           "reason": "invalid_credentials"})
        return None
    role = database.get_user_role(login_username)
    if current_username is not None or not connection_manager.add(login_username, connection, role):
        log_event("login_failed", login_username, reason="already_connected")
        reply(connection, {"type": "error", "reason": "already_connected"})
        return None
    threading.current_thread().name = f"client-{login_username}"
    log_event("connect", login_username, phase="login", result="ok")
    profile = database.get_public_profile(login_username)
    reply(connection, {
        "type": "login_result",
        "ok": True,
        "reason": None,
        "username": login_username,
        "role": role,
        "avatarUrl": profile.get("avatarUrl", ""),
        "description": profile.get("description", ""),
        "email": profile.get("email", ""),
    })
    if role == "admin":
        connection_manager.monitor_hub.subscribe(connection)
    else:
        history = database.get_chat_history(login_username)
        reply(connection, {
            "type": "history",
            "messages": history,
        })
        _trace_history_deliveries(login_username)
        reply(connection, {
            "type": "group_list",
            "groups": database.get_user_groups(login_username),
        })
        broadcast_user_list(connection_manager)
    return login_username


def handle_monitor_subscribe(connection, connection_manager):
    if connection.role != "admin":
        reply(connection, {"type": "error", "reason": "forbidden"})
    else:
        connection_manager.monitor_hub.subscribe(connection)


def handle_update_profile(connection, connection_manager, username, message):
    updated = database.update_user_profile(
        username,
        message.get("avatarUrl", ""),
        message.get("description", ""),
        message.get("email", ""),
    )
    if updated is None:
        reply(connection, {"type": "error", "reason": "invalid_message"})
        return
    reply(connection, {
        "type": "profile_result",
        "ok": True,
        "reason": None,
        "avatarUrl": updated["avatarUrl"],
        "description": updated["description"],
        "email": updated["email"],
    })
    broadcast_user_list(connection_manager)


def handle_list_directory(connection, username):
    reply(connection, {
        "type": "directory",
        "users": database.list_directory_users(exclude_username=username),
    })
