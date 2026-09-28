// Contrato completo en docs/PROTOCOLO_MENSAJES.md
// El backend habla WebSocket nativo en ws://<host>:5000 — no requiere
// ninguna librería adicional del lado de React.

let socket = null;

function ensureSocket(onMessage) {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return socket;
  }

  socket = new WebSocket("ws://localhost:5000");

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    onMessage?.(message);
  };

  socket.onclose = () => {
    console.log("Conexión cerrada");
  };

  return socket;
}

function sendWhenOpen(payload) {
  if (!socket) return;

  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
    return;
  }

  socket.addEventListener(
    "open",
    () => socket.send(JSON.stringify(payload)),
    { once: true },
  );
}

export function connectSocket(username, password, onMessage) {
  ensureSocket(onMessage);
  sendWhenOpen({ type: "login", username, password });
  return socket;
}

export function registerUser(username, password, onMessage) {
  ensureSocket(onMessage);
  sendWhenOpen({ type: "register", username, password });
  return socket;
}

export function sendBroadcast(text) {
  socket?.send(JSON.stringify({ type: "broadcast", message: text }));
}

export function sendPrivateMessage(to, text) {
  socket?.send(JSON.stringify({ type: "private_message", to, message: text }));
}

export function sendFile(to, filename, data) {
  const payload = { type: "file", filename, data };
  if (to) payload.to = to;
  socket?.send(JSON.stringify(payload));
}

export function disconnectSocket() {
  socket?.close();
  socket = null;
}
