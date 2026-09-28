import { useState } from "react";
import { FiPlus, FiSearch, FiSettings } from "react-icons/fi";
import { getInitials, getNameColor } from "../utils/avatar";
import NewChatDialog from "./NewChatDialog";

const FILTERS = ["Todos", "Conectados", "Sin conexión"];

function formatTime(date) {
  if (!date) return "";
  return date.toLocaleTimeString("es-MX", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getPreview(message) {
  if (!message) return "Sin mensajes aún";
  if (message.type === "file") {
    return message.filename || "Archivo";
  }
  return message.message || "Sin mensajes aún";
}

function AvatarWithStatus({ name, avatarUrl, online, sizeClass = "avatar" }) {
  return (
    <span className={`avatar-wrap ${online ? "is-online" : ""}`}>
      {avatarUrl ? (
        <img className={`${sizeClass} photo`} src={avatarUrl} alt="" />
      ) : (
        <span
          className={sizeClass}
          style={{ background: getNameColor(name) }}
          aria-hidden="true"
        >
          {getInitials(name)}
        </span>
      )}
      {online ? (
        <span className="online-dot" title="En línea" aria-label="En línea" />
      ) : null}
    </span>
  );
}

export default function Sidebar({
  username,
  avatarUrl,
  users,
  chatUsers = [],
  contacts = {},
  messages,
  selectedUser,
  groupName = "Sala general",
  groupAvatarUrl = "",
  onSelectUser,
  onOpenProfile,
  onOpenSettings,
  onStartNewChat,
  onLogout,
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Todos");
  const [newChatOpen, setNewChatOpen] = useState(false);

  const privateUsers = Array.from(
    new Set([
      ...chatUsers,
      ...users,
      ...messages
        .filter((message) => message.type === "private_message" || message.type === "file")
        .flatMap((message) => [message.from, message.to])
        .filter(Boolean),
    ]),
  ).filter((user) => user && user !== username);

  const entries = [
    {
      id: null,
      name: groupName,
      isBroadcast: true,
      avatarUrl: groupAvatarUrl,
    },
    ...privateUsers.map((user) => ({
      id: user,
      name: user,
      isBroadcast: false,
      avatarUrl: contacts[user]?.avatarUrl || "",
    })),
  ];

  const chats = entries.map((entry) => {
    const related = messages.filter((message) => {
      if (entry.isBroadcast) {
        return (
          message.type === "broadcast" ||
          (message.type === "file" && !message.to)
        );
      }
      return (
        (message.type === "private_message" || message.type === "file") &&
        (message.from === entry.id || message.to === entry.id)
      );
    });
    const last = related[related.length - 1] || null;

    return {
      ...entry,
      lastMessage: getPreview(last),
      time: last ? formatTime(last.at ? new Date(last.at) : new Date()) : "",
      unread: 0,
      online: entry.isBroadcast ? false : users.includes(entry.id),
    };
  });

  const visibleChats = chats.filter((chat) => {
    const matchesQuery = chat.name
      .toLowerCase()
      .includes(query.trim().toLowerCase());
    if (!matchesQuery) return false;
    if (filter === "Conectados") return !chat.isBroadcast && chat.online;
    if (filter === "Sin conexión") return !chat.isBroadcast && !chat.online;
    return true;
  });

  return (
    <aside className="sidebar">
      <header className="sidebar-top">
        <h1>Chats</h1>
        <div className="sidebar-actions">
          <button
            type="button"
            className="icon-btn profile-entry"
            title="Perfil"
            aria-label="Abrir perfil"
            onClick={onOpenProfile}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="sidebar-mini-avatar" />
            ) : (
              <span
                className="sidebar-mini-avatar initials"
                style={{ background: getNameColor(username) }}
              >
                {getInitials(username)}
              </span>
            )}
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Configuración"
            aria-label="Abrir configuración"
            onClick={onOpenSettings}
          >
            <FiSettings size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="sidebar-search">
        <span className="search-icon" aria-hidden="true">
          <FiSearch size={16} />
        </span>
        <input
          type="search"
          placeholder="Buscar"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <nav className="sidebar-filters" aria-label="Filtros de chats">
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            className={filter === item ? "chip active" : "chip"}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
      </nav>

      <div className="sidebar-user">
        Conectado como <strong>{username}</strong>
      </div>

      <ul className="chat-list">
        {visibleChats.length === 0 ? (
          <li className="chat-empty">No hay chats en este filtro</li>
        ) : (
          visibleChats.map((chat) => {
            const active =
              (chat.isBroadcast && selectedUser === null) ||
              selectedUser === chat.id;

            return (
              <li key={chat.isBroadcast ? "broadcast" : chat.id}>
                <button
                  type="button"
                  className={active ? "chat-item active" : "chat-item"}
                  onClick={() => onSelectUser(chat.id)}
                >
                  <AvatarWithStatus
                    name={chat.name}
                    avatarUrl={chat.avatarUrl}
                    online={chat.online}
                  />

                  <span className="chat-body">
                    <span className="chat-row">
                      <span className="chat-name">{chat.name}</span>
                      <span className={chat.unread ? "chat-time unread" : "chat-time"}>
                        {chat.time}
                      </span>
                    </span>
                    <span className="chat-row">
                      <span className="chat-preview">{chat.lastMessage}</span>
                      {chat.unread > 0 ? (
                        <span className="unread-badge">{chat.unread}</span>
                      ) : null}
                    </span>
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>

      <button
        type="button"
        className="new-chat-fab"
        title="Nuevo mensaje"
        aria-label="Nuevo mensaje"
        onClick={() => setNewChatOpen(true)}
      >
        <FiPlus size={28} aria-hidden="true" />
      </button>

      {newChatOpen ? (
        <NewChatDialog
          onClose={() => setNewChatOpen(false)}
          onSubmit={onStartNewChat}
        />
      ) : null}
    </aside>
  );
}
