// Contrato completo en docs/PROTOCOLO_MENSAJES.md
// El backend habla WebSocket nativo en ws://<host>:5000 — no requiere
// ninguna librería adicional del lado de React.

let socket = null;

export function connectSocket(username, onMessage) {
  socket = new WebSocket("ws://localhost:5000");

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: "login", username }));
  };

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    onMessage(message);
  };

  socket.onclose = () => {
    console.log("Conexión cerrada");
  };

  return socket;
}

export function sendBroadcast(text) {
  socket?.send(JSON.stringify({ type: "broadcast", message: text }));
}

export function sendPrivateMessage(to, text) {
  socket?.send(JSON.stringify({ type: "private_message", to, message: text }));
}

export function registerUser(username, password) {
  socket?.send(JSON.stringify({ type: "register", username, password }));
}
