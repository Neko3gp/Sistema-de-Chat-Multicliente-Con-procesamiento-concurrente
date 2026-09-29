/**
 * Reconstruye historial y contactos a partir de mensajes guardados en el servidor.
 */
import { createMessageId } from "./messageKeys";

export function stubContact(name) {
  return {
    username: name,
    email: "",
    description: "",
    avatarUrl: "",
    lastSeen: new Date(),
  };
}

export function hydrateHistory(history, owner) {
  const messages = Array.isArray(history) ? history : [];
  const chatUsers = new Set();
  const contacts = {};
  for (const message of messages) {
    if (
      message.type === "group_message" ||
      message.type === "group_notice" ||
      (message.type === "file" && message.groupId)
    ) {
      continue;
    }
    const peer = message.from === owner ? message.to : message.from;
    if (!peer || peer === owner) continue;
    chatUsers.add(peer);
    contacts[peer] = stubContact(peer);
  }
  return {
    messages: messages.map((message) => ({
      ...message,
      id: message.id || createMessageId(),
      at: message.at ? new Date(message.at) : new Date(),
      status:
        message.from === owner
          ? message.status === "seen"
            ? "seen"
            : message.status === "sent"
              ? "sent"
              : "delivered"
          : undefined,
    })),
    chatUsers: Array.from(chatUsers),
    contacts,
  };
}
