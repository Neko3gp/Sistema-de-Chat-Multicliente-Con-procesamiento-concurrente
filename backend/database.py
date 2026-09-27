"""
Persistencia de usuarios con SQLite. Las conexiones activas NO se guardan
aquí — eso vive en memoria dentro de ConnectionManager.
"""
import sqlite3
import hashlib

DB_PATH = "chat.db"


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()


def create_user(username, password):
    """Devuelve True si se creó, False si el username ya existía."""
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, password_hash),
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()


def verify_user(username, password):
    """Devuelve True si el username y password coinciden con lo guardado."""
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        "SELECT id FROM users WHERE username = ? AND password_hash = ?",
        (username, password_hash),
    ).fetchone()
    conn.close()
    return row is not None
