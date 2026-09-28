"""
Persistencia de usuarios con SQLite. Las conexiones activas NO se guardan
aquí — eso vive en memoria dentro de ConnectionManager.
"""
import sqlite3
import hashlib
import hmac
import json
import os
import uuid
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(os.environ.get("CHAT_DB_PATH", Path(__file__).resolve().parent / "chat.db")).expanduser().resolve()
PBKDF2_ITERATIONS = 600_000


def init_db():
    """Crea el esquema o añade columnas a una base antigua sin perder usuarios."""
    with closing(sqlite3.connect(DB_PATH)) as conn, conn:
        # Serializa la inspección y migración si seed y servidor arrancan a la vez.
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                role TEXT NOT NULL DEFAULT 'user'
            )
        """)
        columns = {row[1] for row in conn.execute("PRAGMA table_info(users)")}
        if "role" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'")
        if "avatar_url" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN avatar_url TEXT NOT NULL DEFAULT ''")
        if "description" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN description TEXT NOT NULL DEFAULT ''")
        if "email" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT ''")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_type TEXT NOT NULL,
                sender TEXT NOT NULL,
                recipient TEXT,
                group_id TEXT,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS chat_groups (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                owner TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS chat_group_members (
                group_id TEXT NOT NULL,
                username TEXT NOT NULL,
                PRIMARY KEY (group_id, username),
                FOREIGN KEY (group_id) REFERENCES chat_groups(id) ON DELETE CASCADE
            )
        """)


def hash_password(password):
    """Genera PBKDF2-SHA256 con sal aleatoria de 16 bytes para cada contraseña."""
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def create_user(username, password, role="user"):
    """Inserta sin sobrescribir cuentas; el registro web usa siempre el rol user."""
    if role not in {"user", "admin"}:
        raise ValueError("Rol no válido")
    password_hash = hash_password(password)
    with closing(sqlite3.connect(DB_PATH)) as conn, conn:
        cursor = conn.execute(
            "INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)",
            (username, password_hash, role),
        )
        return cursor.rowcount == 1


def resolve_username(identifier):
    """Resuelve usuario canónico por nombre o correo (sin distinguir mayúsculas)."""
    if not isinstance(identifier, str):
        return None
    value = identifier.strip()
    if not value:
        return None
    with closing(sqlite3.connect(DB_PATH)) as conn:
        row = conn.execute(
            "SELECT username FROM users WHERE username = ? COLLATE NOCASE",
            (value,),
        ).fetchone()
        if row:
            return row[0]
        email = value.lower()
        row = conn.execute(
            "SELECT username FROM users WHERE email != '' AND lower(email) = ?",
            (email,),
        ).fetchone()
        return row[0] if row else None


def verify_user(username, password):
    """Verifica PBKDF2 o SHA-256 heredado con comparación de tiempo constante."""
    with closing(sqlite3.connect(DB_PATH)) as conn:
        row = conn.execute(
            "SELECT password_hash FROM users WHERE username = ?", (username,),
        ).fetchone()
    if row is None:
        return False
    stored = row[0]
    try:
        if stored.startswith("pbkdf2$"):
            _, iterations, salt_hex, hash_hex = stored.split("$")
            salt, expected = bytes.fromhex(salt_hex), bytes.fromhex(hash_hex)
            if len(salt) != 16 or len(expected) != 32:
                return False
            actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, int(iterations))
            return hmac.compare_digest(actual, expected)
        # Las cuentas antiguas conservan su hash y siguen pudiendo iniciar sesión.
        actual = hashlib.sha256(password.encode()).hexdigest()
        return hmac.compare_digest(actual, stored)
    except (ValueError, TypeError, OverflowError):
        return False


def get_user_role(username):
    """Obtiene el rol persistido de una cuenta, o None si no existe."""
    with closing(sqlite3.connect(DB_PATH)) as conn:
        row = conn.execute("SELECT role FROM users WHERE username = ?", (username,)).fetchone()
    return row[0] if row else None


MAX_AVATAR_URL_LEN = 2048
MAX_DESCRIPTION_LEN = 140
MAX_EMAIL_LEN = 254


def _normalize_avatar_url(avatar_url):
    if avatar_url is None:
        return ""
    if not isinstance(avatar_url, str):
        return None
    value = avatar_url.strip()
    if not value:
        return ""
    if len(value) > MAX_AVATAR_URL_LEN:
        return None
    lower = value.lower()
    # http(s) remoto, o ruta local del front (/avatars/...).
    if lower.startswith("http://") or lower.startswith("https://"):
        return value
    if value.startswith("/") and "://" not in value and ".." not in value:
        return value
    return None


def _normalize_description(description):
    if description is None:
        return ""
    if not isinstance(description, str):
        return None
    value = description.strip()
    if len(value) > MAX_DESCRIPTION_LEN:
        return None
    return value


def _normalize_email(email):
    if email is None:
        return ""
    if not isinstance(email, str):
        return None
    value = email.strip().lower()
    if not value:
        return ""
    if len(value) > MAX_EMAIL_LEN or " " in value or value.count("@") != 1:
        return None
    local, domain = value.split("@", 1)
    if not local or not domain or "." not in domain:
        return None
    return value


def get_public_profile(username):
    """Devuelve avatar, descripción y correo públicos de un usuario."""
    with closing(sqlite3.connect(DB_PATH)) as conn:
        row = conn.execute(
            "SELECT avatar_url, description, email FROM users WHERE username = ?",
            (username,),
        ).fetchone()
    if row is None:
        return {"avatarUrl": "", "description": "", "email": ""}
    return {
        "avatarUrl": row[0] or "",
        "description": row[1] or "",
        "email": row[2] or "",
    }


def get_public_profiles(usernames):
    """Mapa username -> perfil público para la lista de conectados."""
    if not usernames:
        return {}
    placeholders = ",".join("?" for _ in usernames)
    with closing(sqlite3.connect(DB_PATH)) as conn:
        rows = conn.execute(
            f"SELECT username, avatar_url, description, email FROM users WHERE username IN ({placeholders})",
            tuple(usernames),
        ).fetchall()
    profiles = {}
    for username, avatar_url, description, email in rows:
        profiles[username] = {
            "avatarUrl": avatar_url or "",
            "description": description or "",
            "email": email or "",
        }
    for username in usernames:
        profiles.setdefault(username, {"avatarUrl": "", "description": "", "email": ""})
    return profiles


def list_directory_users(exclude_username=None):
    """Usuarios de chat registrados (sin admins), con perfil público."""
    with closing(sqlite3.connect(DB_PATH)) as conn:
        rows = conn.execute(
            """
            SELECT username, avatar_url, description, email
            FROM users
            WHERE role = 'user'
            ORDER BY username COLLATE NOCASE
            """
        ).fetchall()
    users = []
    for username, avatar_url, description, email in rows:
        if exclude_username and username == exclude_username:
            continue
        users.append({
            "username": username,
            "avatarUrl": avatar_url or "",
            "description": description or "",
            "email": email or "",
        })
    return users


def list_admin_users():
    """Devuelve usuarios y administradores para el panel protegido."""
    with closing(sqlite3.connect(DB_PATH)) as conn:
        rows = conn.execute(
            """
            SELECT username, role, avatar_url, description, email, created_at
            FROM users
            ORDER BY username COLLATE NOCASE
            """
        ).fetchall()
    return [
        {
            "username": username,
            "role": role,
            "avatarUrl": avatar_url or "",
            "description": description or "",
            "email": email or "",
            "createdAt": created_at,
        }
        for username, role, avatar_url, description, email, created_at in rows
    ]


def update_user_as_admin(
    username,
    password=None,
    role=None,
    avatar_url=None,
    description=None,
    email=None,
):
    """Actualiza campos administrativos sin permitir un usuario inválido."""
    if not isinstance(username, str) or not username.strip():
        return False
    changes = []
    values = []
    if password is not None:
        if not isinstance(password, str) or not password:
            return False
        changes.extend(["password_hash = ?"])
        values.append(hash_password(password))
    if role is not None:
        if role not in {"user", "admin"}:
            return False
        changes.append("role = ?")
        values.append(role)
    if avatar_url is not None or description is not None:
        avatar = _normalize_avatar_url(avatar_url or "")
        desc = _normalize_description(description or "")
        if avatar is None or desc is None:
            return False
        changes.extend(["avatar_url = ?", "description = ?"])
        values.extend([avatar, desc])
    if email is not None:
        normalized_email = _normalize_email(email)
        if normalized_email is None:
            return False
        changes.append("email = ?")
        values.append(normalized_email)
    if not changes:
        return False
    values.append(username)
    with closing(sqlite3.connect(DB_PATH)) as conn, conn:
        cursor = conn.execute(
            f"UPDATE users SET {', '.join(changes)} WHERE username = ?",
            tuple(values),
        )
        return cursor.rowcount == 1


def rename_user(username, new_username):
    """Renombra una cuenta y actualiza sus referencias en historial y grupos."""
    if not isinstance(username, str) or not isinstance(new_username, str):
        return False
    username, new_username = username.strip(), new_username.strip()
    if not username or not new_username or username == new_username:
        return False
    with closing(sqlite3.connect(DB_PATH)) as conn, conn:
        if conn.execute("SELECT 1 FROM users WHERE username = ?", (new_username,)).fetchone():
            return False
        if not conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
            return False
        conn.execute("UPDATE users SET username = ? WHERE username = ?", (new_username, username))
        conn.execute("UPDATE chat_group_members SET username = ? WHERE username = ?", (new_username, username))
        conn.execute("UPDATE chat_groups SET owner = ? WHERE owner = ?", (new_username, username))
        rows = conn.execute("SELECT id, payload FROM chat_messages").fetchall()
        for message_id, payload in rows:
            try:
                message = json.loads(payload)
            except json.JSONDecodeError:
                continue
            changed = False
            if message.get("from") == username:
                message["from"] = new_username
                changed = True
            if message.get("to") == username:
                message["to"] = new_username
                changed = True
            if isinstance(message.get("members"), list):
                next_members = [new_username if member == username else member for member in message["members"]]
                changed = changed or next_members != message["members"]
                message["members"] = next_members
            if changed:
                conn.execute("UPDATE chat_messages SET sender = ?, recipient = ?, payload = ? WHERE id = ?",
                             (message.get("from"), message.get("to"),
                              json.dumps(message, ensure_ascii=False), message_id))
    return True


def delete_user(username):
    """Elimina una cuenta; el historial se conserva para la trazabilidad."""
    with closing(sqlite3.connect(DB_PATH)) as conn, conn:
        cursor = conn.execute("DELETE FROM users WHERE username = ?", (username,))
        return cursor.rowcount == 1


def _valid_group_members(conn, members):
    names = [name.strip() for name in members if isinstance(name, str) and name.strip()]
    if not names:
        return []
    placeholders = ",".join("?" for _ in names)
    rows = conn.execute(
        f"SELECT username FROM users WHERE role = 'user' AND username IN ({placeholders})",
        tuple(dict.fromkeys(names)),
    ).fetchall()
    return [row[0] for row in rows]


def list_groups():
    """Devuelve grupos persistidos y sus integrantes."""
    with closing(sqlite3.connect(DB_PATH)) as conn:
        groups = conn.execute(
            "SELECT id, name, owner, created_at, updated_at FROM chat_groups ORDER BY name COLLATE NOCASE"
        ).fetchall()
        result = []
        for group_id, name, owner, created_at, updated_at in groups:
            members = conn.execute(
                "SELECT username FROM chat_group_members WHERE group_id = ? ORDER BY username COLLATE NOCASE",
                (group_id,),
            ).fetchall()
            result.append({
                "id": group_id,
                "name": name,
                "owner": owner,
                "members": [row[0] for row in members],
                "createdAt": created_at,
                "updatedAt": updated_at,
            })
    return result


def get_group(group_id):
    """Obtiene un grupo por id sin exponer una conexión SQLite."""
    return next((group for group in list_groups() if group["id"] == group_id), None)


def get_user_groups(username):
    """Devuelve únicamente los grupos a los que pertenece un usuario."""
    return [group for group in list_groups() if username in group["members"]]


def save_group(group_id, name, owner, members):
    """Crea o actualiza un grupo con integrantes existentes."""
    if not isinstance(name, str) or not name.strip() or not isinstance(owner, str):
        return None
    member_names = members if isinstance(members, list) else []
    now = datetime.now(timezone.utc).isoformat()
    with closing(sqlite3.connect(DB_PATH)) as conn, conn:
        valid_members = _valid_group_members(conn, member_names)
        if owner in valid_members:
            selected = valid_members
        elif database_role := conn.execute("SELECT role FROM users WHERE username = ?", (owner,)).fetchone():
            selected = valid_members if database_role[0] == "admin" else []
        else:
            return None
        if not selected:
            return None
        conn.execute(
            "INSERT INTO chat_groups (id, name, owner, created_at, updated_at) VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET name = excluded.name, owner = chat_groups.owner, updated_at = excluded.updated_at",
            (group_id, name.strip(), owner, now, now),
        )
        conn.execute("DELETE FROM chat_group_members WHERE group_id = ?", (group_id,))
        conn.executemany(
            "INSERT INTO chat_group_members (group_id, username) VALUES (?, ?)",
            [(group_id, member) for member in selected],
        )
    return next((group for group in list_groups() if group["id"] == group_id), None)


def create_group(name, owner, members, group_id=None):
    """Crea un grupo; acepta id opcional del cliente para sincronizar."""
    gid = group_id.strip() if isinstance(group_id, str) and group_id.strip() else str(uuid.uuid4())
    return save_group(gid, name, owner, members)


def update_group_by_owner(group_id, owner, name, members):
    """Solo el dueño del grupo puede cambiar nombre e integrantes."""
    previous = get_group(group_id)
    if not previous or previous.get("owner") != owner:
        return None
    next_name = name if isinstance(name, str) and name.strip() else previous["name"]
    member_names = members if isinstance(members, list) else previous["members"]
    # El dueño siempre permanece en el grupo.
    ordered = []
    for name_item in [owner, *member_names]:
        if isinstance(name_item, str) and name_item.strip() and name_item not in ordered:
            ordered.append(name_item.strip())
    return save_group(previous["id"], next_name, owner, ordered)


def delete_group(group_id):
    with closing(sqlite3.connect(DB_PATH)) as conn, conn:
        conn.execute("DELETE FROM chat_group_members WHERE group_id = ?", (group_id,))
        cursor = conn.execute("DELETE FROM chat_groups WHERE id = ?", (group_id,))
        return cursor.rowcount == 1


def update_user_profile(username, avatar_url="", description="", email=""):
    """Actualiza avatar/descripción/correo. Devuelve el perfil o None si es inválido."""
    avatar = _normalize_avatar_url(avatar_url)
    desc = _normalize_description(description)
    normalized_email = _normalize_email(email)
    if avatar is None or desc is None or normalized_email is None:
        return None
    with closing(sqlite3.connect(DB_PATH)) as conn, conn:
        cursor = conn.execute(
            "UPDATE users SET avatar_url = ?, description = ?, email = ? WHERE username = ?",
            (avatar, desc, normalized_email, username),
        )
        if cursor.rowcount != 1:
            return None
    return {"avatarUrl": avatar, "description": desc, "email": normalized_email}


HISTORY_LIMIT = 120


def save_chat_message(message):
    """Guarda un mensaje para que los destinatarios offline puedan recuperarlo."""
    message_type = message.get("type")
    sender = message.get("from")
    if not isinstance(message_type, str) or not isinstance(sender, str):
        return None
    recipient = message.get("to") if isinstance(message.get("to"), str) else None
    group_id = message.get("groupId") if isinstance(message.get("groupId"), str) else None
    created_at = datetime.now(timezone.utc).isoformat()
    payload = json.dumps(message, ensure_ascii=False)
    with closing(sqlite3.connect(DB_PATH)) as conn, conn:
        cursor = conn.execute(
            """
            INSERT INTO chat_messages
                (message_type, sender, recipient, group_id, payload, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (message_type, sender, recipient, group_id, payload, created_at),
        )
        return cursor.lastrowid


def get_chat_history(username, limit=HISTORY_LIMIT):
    """Devuelve mensajes visibles para un usuario, incluidos los enviados offline."""
    with closing(sqlite3.connect(DB_PATH)) as conn:
        rows = conn.execute(
            """
            SELECT id, message_type, sender, recipient, group_id, payload, created_at
            FROM chat_messages
            WHERE message_type IN ('broadcast', 'private_message', 'file', 'group_message', 'group_notice')
              AND (message_type = 'broadcast' OR sender = ? OR recipient = ? OR group_id IS NOT NULL)
            ORDER BY id DESC
            LIMIT ?
            """,
            (username, username, limit),
        ).fetchall()

    history = []
    for row_id, message_type, sender, recipient, group_id, payload, created_at in reversed(rows):
        try:
            message = json.loads(payload)
        except json.JSONDecodeError:
            continue
        if message_type in {"group_message", "group_notice"}:
            members = message.get("members")
            if not isinstance(members, list) or username not in members:
                # Avisos de expulsión: el saliente ya no está en members; no se rehidrata aquí.
                continue
        elif message_type == "file" and group_id is None:
            if recipient not in (None, username) and sender != username:
                continue
        message["id"] = row_id
        message["at"] = created_at
        history.append(message)
    return history
