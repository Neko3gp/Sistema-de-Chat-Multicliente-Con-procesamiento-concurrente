"""Verificación única T3: migración, seed idempotente, hashes y login por TCP.

Ejecutar: python scripts/test_database.py. Usa una base temporal y detiene
el servidor hijo al finalizar; no cambia las cuentas del proyecto.
"""
import hashlib
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time

from test_concurrency import Client


ROOT = Path(__file__).resolve().parents[1]


def prepare(directory, env):
    """Migra una cuenta heredada y comprueba dos ejecuciones del seed."""
    legacy_hash = hashlib.sha256(b"legacy-T3").hexdigest()
    with sqlite3.connect(env["CHAT_DB_PATH"]) as conn:
        conn.execute("""CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )""")
        conn.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)",
                     ("legacy", legacy_hash))
    for expected in (21, 0):
        result = subprocess.run(
            [sys.executable, str(ROOT / "scripts/seed_users.py"), "--count", "20"],
            cwd=directory, env=env, capture_output=True, text=True, check=True, timeout=30,
        )
        assert result.stdout.strip() == f"Usuarios creados: {expected}", result.stdout
    with sqlite3.connect(env["CHAT_DB_PATH"]) as conn:
        rows = conn.execute("SELECT username, password_hash, role FROM users").fetchall()
    users = {name: (stored, role) for name, stored, role in rows}
    assert len(users) == 22 and users["legacy"] == (legacy_hash, "user")
    assert users["admin"][1] == "admin"
    salts = set()
    for name, (stored, role) in users.items():
        if name == "legacy":
            continue
        prefix, iterations, salt, digest = stored.split("$")
        assert prefix == "pbkdf2" and int(iterations) == 600_000
        assert len(bytes.fromhex(salt)) == 16 and len(bytes.fromhex(digest)) == 32
        salts.add(salt)
        if name != "admin":
            assert role == "user"
    assert len(salts) == 21
    # Importar desde otra carpeta debe conservar la ubicación predeterminada.
    clean_env = {key: value for key, value in env.items() if key != "CHAT_DB_PATH"}
    subprocess.run(
        [sys.executable, "-c",
         "import sys; from pathlib import Path; sys.path.insert(0, sys.argv[1]); "
         "import database; assert database.DB_PATH == Path(sys.argv[1]) / 'chat.db'",
         str(ROOT / "backend")], cwd=directory, env=clean_env, check=True, timeout=5,
    )


def check_logins(port, admin_password):
    """Valida roles, credenciales incorrectas y compatibilidad con SHA-256."""
    for name, password, role in (
        ("user01", "test1234", "user"),
        ("admin", admin_password, "admin"),
        ("legacy", "legacy-T3", "user"),
    ):
        client = Client(port)
        try:
            for wrong in (True, False):
                client.send({"type": "login", "username": name,
                             "password": "incorrecta" if wrong else password})
                result = client.until("login_result")
                if wrong:
                    assert result == {"type": "login_result", "ok": False,
                                      "reason": "invalid_credentials"}, result
                else:
                    assert result == {"type": "login_result", "ok": True,
                                      "reason": None, "role": role}, result
        finally:
            client.close()


def main():
    """Ejecuta la verificación aislada y elimina el servidor y los datos."""
    with tempfile.TemporaryDirectory(prefix="chat-t3-") as directory:
        env = {**os.environ, "CHAT_DB_PATH": str(Path(directory) / "chat.db"),
               "CHAT_ADMIN_PASSWORD": "admin-T3-temporal"}
        prepare(directory, env)
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        code = (
            "import sys; sys.path.insert(0, sys.argv[1]); "
            "from tcp_server import start_server; start_server('127.0.0.1', int(sys.argv[2]))"
        )
        with tempfile.TemporaryFile(mode="w+") as log:
            process = subprocess.Popen(
                ["timeout", "25s", sys.executable, "-u", "-c", code,
                 str(ROOT / "backend"), str(port)],
                cwd=directory, env=env, stdout=log, stderr=log,
            )
            try:
                deadline = time.monotonic() + 5
                while True:
                    log.seek(0)
                    if "Servidor escuchando" in log.read():
                        break
                    if process.poll() is not None or time.monotonic() > deadline:
                        raise RuntimeError("El servidor temporal no arrancó")
                    time.sleep(0.05)
                check_logins(port, env["CHAT_ADMIN_PASSWORD"])
            finally:
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
    print("PASO: seed 21 creados / 0 nuevos; migración conserva cuenta SHA-256 y asigna user")
    print("PASO: PBKDF2 con sales distintas; ruta estable y CHAT_DB_PATH verificados")
    print("PASO: user01=user, admin=admin, login heredado válido; claves erróneas rechazadas")
    print("PASO: servidor cerrado y base temporal eliminada")


if __name__ == "__main__":
    main()
