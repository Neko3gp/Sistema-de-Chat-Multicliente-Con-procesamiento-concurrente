"""
Servidor TCP principal. Acepta conexiones indefinidamente y crea un
threading.Thread independiente por cada cliente, sin límite fijo.
"""
import socket
import threading

from client_handler import handle_client, process_message
from connection_manager import ConnectionManager
from message_queue_manager import MessageQueueManager
from monitor_hub import MonitorHub
import database
from server_log import configure_logging, logger, log_event


def lan_ip():
    """Consulta la ruta local sin enviar paquetes; usa hostname como respaldo."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("10.255.255.255", 1))
            return probe.getsockname()[0]
    except OSError:
        try:
            return socket.gethostbyname(socket.gethostname())
        except OSError:
            return "127.0.0.1"


def start_server(host="0.0.0.0", port=5000):
    """Inicializa los servicios y acepta clientes con un hilo lector por socket."""
    configure_logging()
    database.init_db()

    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((host, port))
    server.listen()
    connection_manager = ConnectionManager()
    message_queue = MessageQueueManager(handler=process_message)
    monitor = MonitorHub(connection_manager, message_queue)
    connection_manager.monitor_hub = monitor
    logger.info("Servidor escuchando en %s:%s", host, port)
    log_event("server_started", host=host, port=port, model="threading")
    logger.info("IP LAN detectada: %s; puerto: %s (acceso sujeto a host y firewall)", lan_ip(), port)

    try:
        while True:
            client_socket, address = server.accept()
            thread = threading.Thread(
                target=handle_client,
                args=(client_socket, address, connection_manager, message_queue),
                name=f"client-{address[0]}:{address[1]}",
                daemon=True,
            )
            thread.start()
    finally:
        server.close()
        monitor.stop()
