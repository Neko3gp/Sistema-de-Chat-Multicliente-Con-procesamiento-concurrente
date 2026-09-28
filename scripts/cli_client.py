"""Cliente de consola: /w usuario texto, /todos texto y /salir; admin ve el monitor."""
import argparse
from getpass import getpass
import json
import threading

from websockets.sync.client import connect
from websockets.exceptions import ConnectionClosed


def receive(ws):
    """Muestra mensajes entrantes hasta cerrar la conexión."""
    try:
        for raw in ws:
            print(json.dumps(json.loads(raw), ensure_ascii=False))
    except ConnectionClosed:
        pass


def main():
    """Autentica al usuario e interpreta comandos sin guardar su contraseña."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5000)
    parser.add_argument("--username", required=True)
    args = parser.parse_args()
    with connect(f"ws://{args.host}:{args.port}", compression=None, ping_interval=None,
                 proxy=None, close_timeout=1, max_size=8 * 1024 * 1024) as ws:
        ws.send(json.dumps({"type": "login", "username": args.username, "password": getpass()}))
        while True:
            reply = json.loads(ws.recv())
            if reply.get("type") != "user_list":
                break
        if reply.get("type") != "login_result" or not reply.get("ok"):
            raise SystemExit(f"Login rechazado: {reply}")
        reader = threading.Thread(target=receive, args=(ws,), name="cli-reader", daemon=True)
        reader.start()
        print(f"Sesión {reply['role']}. /w usuario texto, /todos texto, /salir")
        try:
            while True:
                command = input("> ")
                if command == "/salir":
                    break
                if command.startswith("/w ") and len(command.split(" ", 2)) == 3:
                    _, target, text = command.split(" ", 2)
                    ws.send(json.dumps({"type": "private_message", "to": target, "message": text}))
                elif command.startswith("/todos "):
                    ws.send(json.dumps({"type": "broadcast", "message": command[7:]}))
                else:
                    print("Comando no válido")
        except (EOFError, KeyboardInterrupt):
            pass
        finally:
            ws.close()
            reader.join(timeout=2)


if __name__ == "__main__":
    main()
