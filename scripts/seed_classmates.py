"""Reemplaza user05+ por cuentas del salón. Conserva admin y user01–user04.

Uso:
  python3 scripts/seed_classmates.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
import database

PASSWORD = "test1234"
DEFAULT_DESCRIPTION = "Hola estoy usando chat paralelo!"
KEEP = {"admin", "user01", "user02", "user03", "user04"}

# Usuario = primer nombre + primer apellido.
CLASSMATES = [
    ("Jose Delira", "jdelira@uach.mx", ""),
    (
        "Adolfo Escobar",
        "a362839@uach.mx",
        "https://lh3.googleusercontent.com/a-/ALV-UjXD79CVWRUQQnaw38tiqnp4qU2YEhVnFeJS8K8LxzPNIBKyJyA=s240-p-k-rw-no",
    ),
    ("Alexis Leon", "a377171@uach.mx", ""),
    (
        "Angel Villalobos",
        "a367987@uach.mx",
        "https://lh3.googleusercontent.com/a-/ALV-UjV2slcaVLy3JWhX3Dz1owZ6Tt5mbqTpTWgy8CBCP9E6J1gDbCw=s240-p-k-rw-no",
    ),
    ("Carlos Sanchez", "a368058@uach.mx", ""),
    (
        "Daniel Lujan",
        "a373980@uach.mx",
        "https://lh3.googleusercontent.com/a-/ALV-UjVP4Hm05stEjKma-oXjRww6ceWcE5x9Zj9aOsdRMKZZl2GzPPKA=s240-p-k-rw-no",
    ),
    ("Dominik Armendariz", "a368065@uach.mx", ""),
    (
        "Jesus Nunez",
        "a348790@uach.mx",
        "https://lh3.googleusercontent.com/a-/ALV-UjVn-N5v3NG1CHySpNl8TdiOvu1JI7L9-T-FKfjo2a5frQaua98=s240-p-k-rw-no",
    ),
    (
        "Joel Castillo",
        "a367510@uach.mx",
        "https://lh3.googleusercontent.com/a-/ALV-UjXZnipMxzjhAAZNpIMqq77aHZabrkoUW0gNHK8xvnsUeliqvHc=s88-w88-h88-c-k-no",
    ),
    (
        "Jose Ortiz",
        "a353195@uach.mx",
        "https://lh3.googleusercontent.com/a-/ALV-UjVS5dM7KA50XxbPmsv8MlF26tnDeODuWdU3txZF83ae_rPqA2yd=s88-w88-h88-c-k-no",
    ),
    ("Jose Castaneda", "a367654@uach.mx", ""),
    (
        "Joseph Ramirez",
        "a374352@uach.mx",
        "https://lh3.googleusercontent.com/a-/ALV-UjXetVlLvg1_euE-mCVnkzX-6ue7Exmfo0lC5dYVp12IeAobTYo=s88-w88-h88-c-k-no",
    ),
    (
        "Luz Garcia",
        "a348409@uach.mx",
        "https://lh3.googleusercontent.com/a-/ALV-UjUAVZsu9mBTKEytAJpvDmd1VFSBqyxnHma60lJozPZy4EXpov62=s88-w88-h88-c-k-no",
    ),
    (
        "Nicolas Nevarez",
        "a367886@uach.mx",
        "https://lh3.googleusercontent.com/a-/ALV-UjXzSoPgFnPbNy2_G8mMdOwHOW1WD3WXtsz3m0gk4mi97rhNUk-u=s88-w88-h88-c-k-no",
    ),
    ("Raul Valadez", "a348975@uach.mx", ""),
    (
        "Samuel Garcia",
        "a367651@uach.mx",
        "https://lh3.googleusercontent.com/a/ACg8ocIO-BeKbUZi3P1feHvwqAyvQ0ME9tkQLqEZzUXlSy64KN3Dgtc=s88-w88-h88-c-k-no",
    ),
]


def upsert_user(username, email, avatar):
    if database.create_user(username, PASSWORD, role="user"):
        print(f"creado: {username}")
    else:
        database.update_user_as_admin(username, password=PASSWORD, role="user")
        print(f"actualizado: {username}")
    ok = database.update_user_profile(
        username,
        avatar_url=avatar or "",
        description=DEFAULT_DESCRIPTION,
        email=email or "",
    )
    if not ok:
        print(f"  aviso: no se pudo guardar perfil de {username}")


def main():
    database.init_db()
    keep = set(KEEP)
    for username, _email, _avatar in CLASSMATES:
        keep.add(username)

    import sqlite3
    from contextlib import closing

    removed = 0
    with closing(sqlite3.connect(database.DB_PATH)) as conn:
        rows = conn.execute("SELECT username FROM users").fetchall()
    for (username,) in rows:
        if username not in keep:
            if database.delete_user(username):
                removed += 1
                print(f"eliminado: {username}")

    for username, email, avatar in CLASSMATES:
        upsert_user(username, email, avatar)

    print(f"Listo. eliminados={removed}. Conservados: {', '.join(sorted(KEEP))}")


if __name__ == "__main__":
    main()
