"""
Implementación mínima del protocolo WebSocket (RFC 6455) sobre sockets TCP
crudos. Esto es lo que permite que React (navegador) se conecte al mismo
socket.socket() que ya maneja threading, sin necesitar librerías externas.
"""
import base64
import hashlib
import struct

WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


def do_handshake(client_socket):
    """Lee la petición HTTP inicial y responde con el header de aceptación
    WebSocket. Devuelve True si el handshake fue exitoso."""
    request = client_socket.recv(4096).decode("utf-8", errors="ignore")
    key = None
    for line in request.split("\r\n"):
        if line.lower().startswith("sec-websocket-key"):
            key = line.split(":", 1)[1].strip()
            break
    if not key:
        return False

    accept = base64.b64encode(
        hashlib.sha1((key + WS_MAGIC).encode()).digest()
    ).decode()

    response = (
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Accept: {accept}\r\n\r\n"
    )
    client_socket.sendall(response.encode())
    return True


def recv_frame(client_socket):
    """Lee un frame de texto WebSocket enviado por el cliente y devuelve el
    string decodificado. Devuelve None si la conexión se cerró."""
    header = _recv_exact(client_socket, 2)
    if not header:
        return None

    b1, b2 = header
    opcode = b1 & 0x0F
    if opcode == 0x8:  # frame de cierre
        return None

    masked = b2 & 0x80
    payload_len = b2 & 0x7F

    if payload_len == 126:
        ext = _recv_exact(client_socket, 2)
        if ext is None:
            return None
        payload_len = struct.unpack(">H", ext)[0]
    elif payload_len == 127:
        ext = _recv_exact(client_socket, 8)
        if ext is None:
            return None
        payload_len = struct.unpack(">Q", ext)[0]

    mask_key = _recv_exact(client_socket, 4) if masked else None
    if masked and mask_key is None:
        return None

    payload = _recv_exact(client_socket, payload_len)
    if payload is None:
        return None

    if masked and payload:
        payload = bytes(b ^ mask_key[i % 4] for i, b in enumerate(payload))

    return payload.decode("utf-8") if payload else ""


def send_frame(client_socket, message: str):
    """Envía un mensaje de texto como frame WebSocket (servidor -> cliente,
    sin máscara, como indica el estándar)."""
    payload = message.encode("utf-8")
    length = len(payload)

    if length <= 125:
        header = struct.pack("B", 0x81) + struct.pack("B", length)
    elif length <= 65535:
        header = struct.pack("B", 0x81) + struct.pack("B", 126) + struct.pack(">H", length)
    else:
        header = struct.pack("B", 0x81) + struct.pack("B", 127) + struct.pack(">Q", length)

    client_socket.sendall(header + payload)


def _recv_exact(sock, n):
    """Lee exactamente n bytes del socket (TCP puede entregar los datos
    fragmentados en varias llamadas a recv)."""
    data = b""
    while len(data) < n:
        chunk = sock.recv(n - len(data))
        if not chunk:
            return None
        data += chunk
    return data
