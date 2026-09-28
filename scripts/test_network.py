"""Verificación T6: puertos 5000/5001 y precedencia CLI sobre entorno."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

from test_concurrency import Client


def main():
    """Arranca dos servidores sucesivos, consulta login y cierra cada proceso."""
    root = Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix="chat-t6-") as directory:
        env = {**os.environ, "CHAT_DB_PATH": str(Path(directory) / "chat.db"),
               "CHAT_LOG_DIR": str(Path(directory) / "logs"), "CHAT_HOST": "127.0.0.1"}
        env.pop("CHAT_PORT", None)
        for port, flags in ((5000, []), (5001, ["--port", "5001"])):
            if flags:
                env["CHAT_PORT"] = "5002"
            with tempfile.TemporaryFile(mode="w+") as output:
                process = subprocess.Popen(["timeout", "15s", sys.executable, "-u",
                                            str(root / "backend/main.py"), *flags],
                                           env=env, cwd=directory, stdout=output, stderr=output)
                try:
                    deadline = time.monotonic() + 5
                    while True:
                        output.seek(0)
                        log = output.read()
                        if "IP LAN detectada:" in log:
                            break
                        assert process.poll() is None and time.monotonic() < deadline, log
                        time.sleep(0.02)
                    assert f"Servidor escuchando en 127.0.0.1:{port}" in log
                    client = Client(port)
                    try:
                        client.send({"type": "login", "username": "missing", "password": "wrong"})
                        assert client.until("login_result")["reason"] == "invalid_credentials"
                    finally:
                        client.close()
                finally:
                    process.terminate()
                    process.wait(timeout=3)
            print(f"PASO T6: arranque, anuncio LAN y conexión en puerto {port}")


if __name__ == "__main__":
    main()
