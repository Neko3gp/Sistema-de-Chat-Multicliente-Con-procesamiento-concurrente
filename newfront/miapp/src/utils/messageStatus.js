export function createMessageId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `m-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function chatKey(selectedUser, selectedGroupId = null) {
  if (selectedGroupId) return `__group__:${selectedGroupId}`;
  return selectedUser || "__broadcast__";
}

export function messageChatKey(message, me) {
  if (message.type === "group_message" && message.groupId) {
    return `__group__:${message.groupId}`;
  }
  if (
    message.type === "broadcast" ||
    (message.type === "file" && !message.to)
  ) {
    return "__broadcast__";
  }
  if (message.from === me) return message.to || "__broadcast__";
  return message.from;
}

export function groupKeyFromChatKey(key) {
  if (typeof key === "string" && key.startsWith("__group__:")) {
    return key.slice("__group__:".length);
  }
  return null;
}

export function statusLabel(status) {
  switch (status) {
    case "pending":
      return "No enviado";
    case "sent":
      return "Enviado";
    case "seen":
      return "Visto";
    case "failed":
      return "Error al enviar";
    default:
      return "";
  }
}

export function truncateText(text, max = 72) {
  const value = String(text || "").trim().replace(/\s+/g, " ");
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
