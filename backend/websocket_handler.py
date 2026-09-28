"""
Implementación mínima del protocolo WebSocket (RFC 6455) sobre sockets TCP
crudos. Esto es lo que permite que React (navegador) se conecte al mismo
socket.socket() que ya maneja threading, sin necesitar librerías externas.
"""
import base64
import hashlib
import struct
import time

WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
MASK_TABLES = tuple(bytes(value ^ key for value in range(256)) for key in range(256))
# Archivos de hasta 5 MiB en base64 caben con holgura bajo este tope.
MAX_MESSAGE_BYTES = 12 * 1024 * 1024


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


def _unmask(payload, mask_key):
    """Aplica la máscara WebSocket por bloques para no retener el GIL demasiado."""
    if not payload:
        return payload
    decoded = bytearray(payload)
    for start in range(0, len(payload), 64 * 1024):
        end = min(start + 64 * 1024, len(payload))
        for offset, key in enumerate(mask_key):
            decoded[start + offset:end:4] = payload[start + offset:end:4].translate(
                MASK_TABLES[key]
            )
        if len(payload) > 64 * 1024:
            time.sleep(0)
    return decoded


def _recv_one_frame(client_socket):
    """Lee un único frame WebSocket. Devuelve (fin, opcode, payload) o None."""
    header = _recv_exact(client_socket, 2)
    if not header:
        return None

    b1, b2 = header
    fin = bool(b1 & 0x80)
    opcode = b1 & 0x0F
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

    if payload_len > MAX_MESSAGE_BYTES:
        return None

    mask_key = _recv_exact(client_socket, 4) if masked else None
    if masked and mask_key is None:
        return None

    payload = _recv_exact(client_socket, payload_len)
    if payload is None:
        return None

    if masked:
        payload = _unmask(payload, mask_key)

    return fin, opcode, payload


def recv_frame(client_socket):
    """Lee un mensaje de texto WebSocket completo (incluye fragmentos).

    Los archivos grandes suelen llegar en varios frames; sin ensamblarlos el
    JSON queda incompleto y se reporta invalid_json.
    """
    first = _recv_one_frame(client_socket)
    if first is None:
        return None

    fin, opcode, payload = first

    # Control frames: cierre, ping, pong.
    if opcode == 0x8:
        return None
    if opcode in (0x9, 0xA):
        if opcode == 0x9:
            # Responder pong con el mismo payload.
            _send_control(client_socket, 0xA, payload)
        return recv_frame(client_socket)

    if opcode != 0x1:
        # Solo aceptamos texto JSON del chat.
        return "" if fin else recv_frame(client_socket)

    chunks = [payload]
    total = len(payload)

    while not fin:
        nxt = _recv_one_frame(client_socket)
        if nxt is None:
            return None
        fin, next_opcode, next_payload = nxt
        if next_opcode in (0x8,):
            return None
        if next_opcode in (0x9, 0xA):
            if next_opcode == 0x9:
                _send_control(client_socket, 0xA, next_payload)
            continue
        if next_opcode != 0x0:
            return None
        total += len(next_payload)
        if total > MAX_MESSAGE_BYTES:
            return None
        chunks.append(next_payload)

    message = b"".join(chunks)
    return message.decode("utf-8") if message else ""


def _send_control(client_socket, opcode, payload=b""):
    """Envía un frame de control sin máscara (servidor → cliente)."""
    payload = payload or b""
    if len(payload) > 125:
        payload = payload[:125]
    header = struct.pack("B", 0x80 | (opcode & 0x0F)) + struct.pack("B", len(payload))
    client_socket.sendall(header + payload)


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
    data = bytearray()
    while len(data) < n:
        chunk = sock.recv(min(n - len(data), 256 * 1024))
        if not chunk:
            return None
        # Extender evita copiar todo lo recibido ante cada fragmento TCP.
        data.extend(chunk)
    return data
