"""
Persistencia de usuarios con SQLite. Las conexiones activas NO se guardan
aquí — eso vive en memoria dentro de ConnectionManager.
"""
import sqlite3
import hashlib
import hmac
import os
from contextlib import closing
from pathlib import Path

DB_PATH = Path(os.environ.get("CHAT_DB_PATH", Path(__file__).resolve().parent / "chat.db")).expanduser().resolve()
PBKDF2_ITERATIONS = 600_000


def init_db():
    """Crea el esquema o añade role a una base antigua sin perder usuarios."""
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
