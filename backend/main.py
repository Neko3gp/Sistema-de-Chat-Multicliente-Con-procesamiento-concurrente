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
    # PORT lo usan Render/Railway/Fly; CHAT_PORT es el override local del proyecto.
    default_port = os.environ.get("PORT") or os.environ.get("CHAT_PORT") or "5000"
    parser.add_argument("--port", type=int, default=default_port)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port debe estar entre 1 y 65535")
    try:
        start_server(host=args.host, port=args.port)
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()
