"""
Punto de entrada del servidor de chat multicliente.
Uso: python main.py
"""
from tcp_server import start_server

if __name__ == "__main__":
    start_server(host="0.0.0.0", port=5000)
