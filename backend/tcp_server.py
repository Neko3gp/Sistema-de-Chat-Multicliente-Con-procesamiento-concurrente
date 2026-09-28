"""
Servidor TCP principal. Acepta conexiones indefinidamente y crea un
threading.Thread independiente por cada cliente, sin límite fijo.
"""
import socket
import threading

from client_handler import handle_client, process_message
from connection_manager import ConnectionManager
from message_queue_manager import MessageQueueManager
import database
from server_log import configure_logging, logger


def start_server(host="0.0.0.0", port=5000):
    """Inicializa los servicios y acepta clientes con un hilo lector por socket."""
    configure_logging()
    database.init_db()

    connection_manager = ConnectionManager()
    message_queue = MessageQueueManager(handler=process_message)

    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((host, port))
    server.listen()
    logger.info("Servidor escuchando en %s:%s", host, port)

    while True:
        client_socket, address = server.accept()
        thread = threading.Thread(
            target=handle_client,
            args=(client_socket, address, connection_manager, message_queue),
            name=f"client-{address[0]}:{address[1]}",
            daemon=True,
        )
        thread.start()
