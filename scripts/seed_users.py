"""Crea cuentas locales de prueba sin modificar usuarios existentes.

Uso: python scripts/seed_users.py --count 20
CHAT_DB_PATH selecciona la base; CHAT_ADMIN_PASSWORD cambia la clave inicial
de admin (por defecto admin123, únicamente para pruebas locales).
"""
import argparse
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
import database


def main():
    """Inicializa la base y cuenta únicamente las inserciones nuevas."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=20, help="cantidad de usuarios normales")
    args = parser.parse_args()
    if args.count < 0:
        parser.error("--count debe ser mayor o igual que cero")
    database.init_db()
    created = int(database.create_user(
        "admin", os.environ.get("CHAT_ADMIN_PASSWORD", "admin123"), role="admin",
    ))
    for number in range(1, args.count + 1):
        created += database.create_user(f"user{number:02d}", "test1234")
    print(f"Usuarios creados: {created}")


if __name__ == "__main__":
    main()
