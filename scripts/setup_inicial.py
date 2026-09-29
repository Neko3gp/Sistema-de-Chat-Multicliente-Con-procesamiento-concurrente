#!/usr/bin/env python3
"""Setup inicial de una sola vez: limpia historial, siembra datos y arranca todo.

Uso (desde la raíz del proyecto):
  python3 scripts/setup_inicial.py

Qué hace:
  1. Borra el historial de mensajes (chat_messages).
  2. Migra el esquema SQLite y sincroniza cuentas del salón.
  3. Instala dependencias del front si faltan.
  4. Abre el backend y el frontend en otras ventanas de Terminal.
  5. Imprime la IP LAN para abrir desde el celular.
"""
from __future__ import annotations

import os
import socket
import shlex
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
FRONT = ROOT / "frontend" / "miapp"
SCRIPTS = ROOT / "scripts"


def detect_lan_ip() -> str:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        if ip and not ip.startswith("127."):
            return ip
    except OSError:
        pass
    for iface in ("en0", "en1"):
        try:
            out = subprocess.check_output(
                ["ipconfig", "getifaddr", iface],
                stderr=subprocess.DEVNULL,
                text=True,
            ).strip()
            if out:
                return out
        except (subprocess.CalledProcessError, FileNotFoundError):
            continue
    return "localhost"


def open_in_new_terminal(command: str, title: str) -> None:
    """Abre una ventana nueva de Terminal.app (macOS) con el comando."""
    # Título + comando; escapar comillas para AppleScript.
    full = f'printf "\\\\e]0;{title}\\\\a"; {command}'
    escaped = full.replace("\\", "\\\\").replace('"', '\\"')
    script = f'tell application "Terminal" to do script "{escaped}"'
    try:
        subprocess.Popen(["osascript", "-e", script])
    except FileNotFoundError:
        print(f"No se pudo abrir Terminal.app. Corre a mano:\n  {command}")


def clear_history() -> int:
    sys.path.insert(0, str(BACKEND))
    import database  # noqa: WPS433
    import sqlite3
    from contextlib import closing

    database.init_db()
    with closing(sqlite3.connect(database.DB_PATH)) as conn, conn:
        cursor = conn.execute("DELETE FROM chat_messages")
        deleted = cursor.rowcount if cursor.rowcount is not None else 0
    return deleted


def seed_classmates() -> None:
    sys.path.insert(0, str(SCRIPTS))
    import seed_classmates  # noqa: WPS433

    seed_classmates.main()


def ensure_front_deps() -> None:
    if not (FRONT / "package.json").exists():
        return
    if (FRONT / "node_modules").exists():
        print("Front: node_modules OK")
        return
    print("Front: npm install…")
    subprocess.check_call(["npm", "install"], cwd=str(FRONT))


def free_port(port: int) -> None:
    try:
        pids = subprocess.check_output(
            ["lsof", "-ti", f":{port}"],
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
    except subprocess.CalledProcessError:
        return
    for pid in pids.split():
        try:
            os.kill(int(pid), 9)
            print(f"Liberé el puerto {port} (pid {pid})")
        except (OSError, ValueError):
            pass


def main() -> None:
    print("=== Setup inicial del chat ===\n")
    # Las terminales nuevas no heredan la activación del virtualenv.
    local_python = ROOT / ".venv" / "bin" / "python"
    backend_python = str(local_python) if local_python.exists() else sys.executable
    subprocess.check_call([backend_python, "-m", "pip", "install", "-r",
                           str(SCRIPTS / "requirements.txt")])

    deleted = clear_history()
    print(f"Historial borrado: {deleted} mensaje(s)")

    print("\nSincronizando cuentas del salón…")
    seed_classmates()

    print()
    ensure_front_deps()

    free_port(5001)
    free_port(5173)
    time.sleep(0.3)

    lan_ip = detect_lan_ip()

    backend_cmd = (
        f'cd "{ROOT}" && '
        f"CHAT_HOST=0.0.0.0 CHAT_PORT=5001 {shlex.quote(backend_python)} backend/main.py"
    )
    front_cmd = f'cd "{FRONT}" && npm run dev'

    print("\nAbriendo backend y frontend en otras terminales…")
    open_in_new_terminal(backend_cmd, "Chat Backend :5001")
    time.sleep(0.6)
    open_in_new_terminal(front_cmd, "Chat Frontend :5173")

    print()
    print("=== Listo ===")
    print(f"IP LAN:     {lan_ip}")
    print(f"Abre en PC: http://localhost:5173")
    print(f"Abre en celular (misma WiFi): http://{lan_ip}:5173")
    print()
    print("Cuentas del salón: contraseña test1234")
    print("Admin: admin / admin123 (si se creó con seed_users)")


if __name__ == "__main__":
    main()
