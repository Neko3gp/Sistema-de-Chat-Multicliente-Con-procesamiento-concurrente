let socket = null;
let suppressCloseEvent = false;

export function getWsUrl() {
  const fromEnv = import.meta.env.VITE_WS_URL;
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim();
  }

  // En un futuro despliegue HTTPS, el proxy debe exponer /ws con TLS.
  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    return `wss://${window.location.host}/ws`;
  }

  const host =
    typeof window !== "undefined" && window.location.hostname
      ? window.location.hostname
      : "localhost";
  const port = String(import.meta.env.VITE_WS_PORT || "5001").trim() || "5001";
  return `ws://${host}:${port}`;
}

function ensureSocket(onMessage) {
  const attach = (ws) => {
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        onMessage?.(message);
      } catch {
        onMessage?.({ type: "error", reason: "invalid_message" });
      }
    };
    ws.onclose = () => {
      if (suppressCloseEvent) {
        suppressCloseEvent = false;
        return;
      }
      if (socket === ws) socket = null;
      onMessage?.({ type: "connection_closed" });
    };
    ws.onerror = () => {
      onMessage?.({ type: "error", reason: "connection_failed" });
    };
  };

  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    attach(socket);
    return socket;
  }

  socket = new WebSocket(getWsUrl());
  attach(socket);
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
    () => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
      }
    },
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

export function sendFile(to, filename, data, mimeType = "", group = null) {
  const payload = { type: "file", filename, data };
  if (mimeType) payload.mimeType = mimeType;
  if (group?.groupId) {
    payload.groupId = group.groupId;
    payload.groupName = group.groupName || "";
    payload.members = Array.isArray(group.members) ? group.members : [];
  } else if (to) {
    payload.to = to;
  }
  socket?.send(JSON.stringify(payload));
}

export function sendUpdateProfile({ avatarUrl = "", description = "", email = "" } = {}) {
  socket?.send(
    JSON.stringify({
      type: "update_profile",
      avatarUrl,
      description,
      email,
    }),
  );
}

export function sendReadReceipt(chat) {
  const payload = { type: "read_receipt" };
  if (chat) payload.chat = chat;
  else payload.chat = null;
  socket?.send(JSON.stringify(payload));
}

export function sendTyping({
  isTyping,
  chat = null,
  groupId = null,
  members = [],
} = {}) {
  const payload = { type: "typing", isTyping: Boolean(isTyping) };
  if (groupId) {
    payload.groupId = groupId;
    payload.members = members;
  } else if (chat) {
    payload.chat = chat;
  } else {
    payload.chat = null;
  }
  socket?.send(JSON.stringify(payload));
}

export function requestDirectory() {
  socket?.send(JSON.stringify({ type: "list_directory" }));
}

export function sendGroupMessage({ groupId, groupName = "", members = [], message }) {
  socket?.send(
    JSON.stringify({
      type: "group_message",
      groupId,
      groupName,
      members,
      message,
    }),
  );
}

export function sendCreateGroup({ groupId, name, members = [] } = {}) {
  socket?.send(
    JSON.stringify({
      type: "create_group",
      groupId,
      name,
      members,
    }),
  );
}

export function sendUpdateGroup({ groupId, name, members = [] } = {}) {
  socket?.send(
    JSON.stringify({
      type: "update_group",
      groupId,
      name,
      members,
    }),
  );
}

export function isSocketOpen() {
  return Boolean(socket && socket.readyState === WebSocket.OPEN);
}

export function requestAdminUsers() {
  socket?.send(JSON.stringify({ type: "admin_list_users" }));
}

export function requestAdminGroups() {
  socket?.send(JSON.stringify({ type: "admin_list_groups" }));
}

export function adminCreateUser({ username, password, role = "user" }) {
  socket?.send(JSON.stringify({ type: "admin_create_user", username, password, role }));
}

export function adminUpdateUser({ username, newUsername, password, role, avatarUrl, description }) {
  socket?.send(JSON.stringify({
    type: "admin_update_user",
    username,
    newUsername,
    password,
    role,
    avatarUrl,
    description,
  }));
}

export function adminDeleteUser(username) {
  socket?.send(JSON.stringify({ type: "admin_delete_user", username }));
}

export function adminCreateGroup({ name, members }) {
  socket?.send(JSON.stringify({ type: "admin_create_group", name, members }));
}

export function adminUpdateGroup({ groupId, name, members }) {
  socket?.send(JSON.stringify({ type: "admin_update_group", groupId, name, members }));
}

export function adminDeleteGroup(groupId) {
  socket?.send(JSON.stringify({ type: "admin_delete_group", groupId }));
}

export function disconnectSocket({ silent = false } = {}) {
  if (!socket) return;
  if (silent) suppressCloseEvent = true;
  socket.onmessage = null;
  socket.onerror = null;
  const current = socket;
  socket = null;
  if (!silent) {
    current.onclose = null;
  }
  try {
    current.close();
  } catch {
    suppressCloseEvent = false;
  }
}
