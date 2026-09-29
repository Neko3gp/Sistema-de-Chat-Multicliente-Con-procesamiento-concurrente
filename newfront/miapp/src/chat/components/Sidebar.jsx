import { useState } from "react";
import { FiPlus, FiSearch, FiSettings } from "react-icons/fi";
import { getInitials, getNameColor } from "../../common/lib/avatar";
import { chatKey } from "../lib/messageKeys";
import BrandMark from "../../common/components/BrandMark";
import ComposeMenu from "./ComposeMenu";
import NewGroupDialog from "../../groups/components/NewGroupDialog";
import NewMessageDialog from "./NewMessageDialog";
import NotificationTray from "../../common/components/NotificationTray";
import ProfilePhoto from "../../auth/components/ProfilePhoto";

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
      <ProfilePhoto name={name} avatarUrl={avatarUrl} className={sizeClass} />
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
  customGroups = [],
  messages,
  selectedUser,
  selectedGroupId = null,
  groupName = "Sala general",
  groupAvatarUrl = "",
  unreadCounts = {},
  notifications = [],
  directoryUsers = [],
  directoryLoading = false,
  onSelectUser,
  onSelectGroup,
  onOpenProfile,
  onOpenSettings,
  onRequestDirectory,
  onStartNewChat,
  onCreateGroup,
  onMarkAllNotificationsRead,
  onLogout,
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Todos");
  const [composeStep, setComposeStep] = useState(null);

  const privateUsers = Array.from(
    new Set([
      ...chatUsers,
      ...users,
      ...messages
        .filter(
          (message) =>
            message.type === "private_message" ||
            (message.type === "file" && !message.groupId && message.to),
        )
        .flatMap((message) => [message.from, message.to])
        .filter(Boolean),
    ]),
  ).filter((user) => user && user !== username);

  const entries = [
    {
      id: null,
      name: groupName,
      isBroadcast: true,
      isGroup: false,
      avatarUrl: groupAvatarUrl,
    },
    ...customGroups.map((group) => ({
      id: group.id,
      name: group.name,
      isBroadcast: false,
      isGroup: true,
      avatarUrl: group.avatarUrl || "",
      members: group.members || [],
    })),
    ...privateUsers.map((user) => ({
      id: user,
      name: user,
      isBroadcast: false,
      isGroup: false,
      avatarUrl: contacts[user]?.avatarUrl || "",
    })),
  ];

  const chats = entries.map((entry) => {
    const related = messages.filter((message) => {
      if (entry.isBroadcast) {
        return (
          message.type === "broadcast" ||
          (message.type === "file" && !message.to && !message.groupId)
        );
      }
      if (entry.isGroup) {
        return (
          (message.type === "group_message" ||
            message.type === "group_notice" ||
            message.type === "file") &&
          message.groupId === entry.id
        );
      }
      return (
        (message.type === "private_message" ||
          (message.type === "file" && !message.groupId)) &&
        (message.from === entry.id || message.to === entry.id)
      );
    });
    const last = related[related.length - 1] || null;
    const key = entry.isGroup
      ? chatKey(null, entry.id)
      : chatKey(entry.isBroadcast ? null : entry.id);
    const unread = unreadCounts[key] || 0;
    const lastAtMs = last?.at ? new Date(last.at).getTime() : 0;

    return {
      ...entry,
      lastMessage: getPreview(last),
      time: last ? formatTime(last.at ? new Date(last.at) : new Date()) : "",
      lastAtMs: Number.isNaN(lastAtMs) ? 0 : lastAtMs,
      unread,
      online: entry.isBroadcast || entry.isGroup ? false : users.includes(entry.id),
    };
  });

  const totalUnread = Object.values(unreadCounts).reduce(
    (sum, n) => sum + (Number(n) || 0),
    0,
  );

  const visibleChats = chats
    .filter((chat) => {
      const matchesQuery = chat.name
        .toLowerCase()
        .includes(query.trim().toLowerCase());
      if (!matchesQuery) return false;
      if (filter === "Conectados") return !chat.isBroadcast && !chat.isGroup && chat.online;
      if (filter === "Sin conexión") return !chat.isBroadcast && !chat.isGroup && !chat.online;
      return true;
    })
    .sort((a, b) => {
      // Sala general fija arriba; el resto por mensaje más reciente.
      if (a.isBroadcast && !b.isBroadcast) return -1;
      if (!a.isBroadcast && b.isBroadcast) return 1;
      return (b.lastAtMs || 0) - (a.lastAtMs || 0);
    });

  function openCompose(step) {
    setComposeStep(step);
    // Precarga el directorio al abrir el menú, no solo al entrar al diálogo.
    if (step === "menu" || step === "message" || step === "group") {
      onRequestDirectory?.();
    }
  }

  function handleSelectChat(chat) {
    if (chat.isGroup) {
      onSelectGroup?.(chat.id);
      return;
    }
    onSelectUser?.(chat.isBroadcast ? null : chat.id);
  }

  return (
    <aside className="sidebar">
      <header className="sidebar-top">
        <BrandMark
          className="sidebar-brand"
          as="h1"
          label="Chats"
          logoClassName=""
          labelClassName=""
        />
        <div className="sidebar-actions">
          <NotificationTray
            items={notifications}
            totalUnread={totalUnread}
            groupName={groupName}
            onOpenChat={(item) => {
              if (!item) return;
              if (typeof item.chatKey === "string" && item.chatKey.startsWith("__group__:")) {
                onSelectGroup?.(item.chatKey.slice("__group__:".length));
                return;
              }
              onSelectUser?.(item.chatKey === "__broadcast__" ? null : item.chatKey);
            }}
            onMarkAllRead={onMarkAllNotificationsRead}
          />
          <button
            type="button"
            className="icon-btn profile-entry"
            title="Perfil"
            aria-label="Abrir perfil"
            onClick={onOpenProfile}
          >
            <ProfilePhoto
              name={username}
              avatarUrl={avatarUrl}
              className="sidebar-mini-avatar"
            />
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
            const active = chat.isGroup
              ? selectedGroupId === chat.id
              : !selectedGroupId &&
                ((chat.isBroadcast && selectedUser === null) ||
                  selectedUser === chat.id);

            return (
              <li
                key={
                  chat.isBroadcast
                    ? "broadcast"
                    : chat.isGroup
                      ? `group-${chat.id}`
                      : chat.id
                }
              >
                <button
                  type="button"
                  className={active ? "chat-item active" : "chat-item"}
                  onClick={() => handleSelectChat(chat)}
                >
                  <AvatarWithStatus
                    name={chat.name}
                    avatarUrl={chat.avatarUrl}
                    online={chat.online}
                  />

                  <span className="chat-body">
                    <span className="chat-row">
                      <span className="chat-name">
                        {chat.name}
                        {chat.isGroup ? (
                          <span className="chat-kind">grupo</span>
                        ) : null}
                      </span>
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
        title="Crear"
        aria-label="Crear mensaje o grupo"
        onClick={() => openCompose("menu")}
      >
        <FiPlus size={28} aria-hidden="true" />
      </button>

      {composeStep === "menu" ? (
        <ComposeMenu
          onClose={() => setComposeStep(null)}
          onNewMessage={() => openCompose("message")}
          onNewGroup={() => openCompose("group")}
        />
      ) : null}

      {composeStep === "message" ? (
        <NewMessageDialog
          onClose={() => setComposeStep(null)}
          directoryUsers={directoryUsers}
          onlineUsers={users}
          loading={directoryLoading}
          onSelectUser={(name) => {
            const result = onStartNewChat?.(name);
            if (!result?.error && result?.username) {
              onSelectUser?.(result.username);
            }
          }}
        />
      ) : null}

      {composeStep === "group" ? (
        <NewGroupDialog
          onClose={() => setComposeStep(null)}
          directoryUsers={directoryUsers}
          onlineUsers={users}
          loading={directoryLoading}
          onCreate={onCreateGroup}
        />
      ) : null}
    </aside>
  );
}
