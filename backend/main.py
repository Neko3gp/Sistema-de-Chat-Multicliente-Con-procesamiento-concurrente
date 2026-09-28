"""
Punto de entrada del servidor de chat multicliente.
Uso: python main.py
"""
import argparse
import os

from tcp_server import start_server


def main():
    """Lee la red desde argumentos, entorno o valores predeterminados."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default=os.environ.get("CHAT_HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=os.environ.get("CHAT_PORT", "5000"))
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port debe estar entre 1 y 65535")
    try:
        start_server(host=args.host, port=args.port)
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()
