import { useState } from "react";
import Sidebar from "../components/Sidebar";
import Message from "../components/Message";
import FileMessage from "../components/FileMessage";
import MessageInput from "../components/MessageInput";
import { getInitials, getNameColor } from "../utils/avatar";

function filterMessages(messages, username, selectedUser) {
  return messages.filter((message) => {
    if (selectedUser === null) {
      return (
        message.type === "broadcast" ||
        (message.type === "file" && !message.to)
      );
    }

    return (
      (message.type === "private_message" || message.type === "file") &&
      ((message.from === selectedUser &&
        (message.to === username || !message.to)) ||
        (message.from === username && message.to === selectedUser))
    );
  });
}

export default function Home({
  username,
  avatarUrl,
  users,
  messages,
  selectedUser,
  groupName = "Sala general",
  groupAvatarUrl = "",
  onSelectUser,
  onSend,
  onSendFile,
  onOpenProfile,
  onOpenContactProfile,
  onOpenGroupInfo,
  onOpenSettings,
  onStartNewChat,
  chatUsers,
  onLogout,
}) {
  const [chatOpen, setChatOpen] = useState(false);

  const title = selectedUser ? selectedUser : groupName;
  const visibleMessages = filterMessages(messages, username, selectedUser);
  const layoutClass = chatOpen ? "home-layout chat-open" : "home-layout list-open";
  const contactOnline = selectedUser ? users.includes(selectedUser) : false;
  const memberCount = users.length;

  function handleSelectChat(user) {
    onSelectUser(user);
    setChatOpen(true);
  }

  function handleStartNewChat(query) {
    const result = onStartNewChat?.(query);
    if (result?.error) return result;
    if (result?.username) {
      onSelectUser(result.username);
      setChatOpen(true);
    }
    return result;
  }

  function handleBackToList() {
    setChatOpen(false);
  }

  function handleOpenHeaderProfile() {
    if (selectedUser) {
      onOpenContactProfile(selectedUser);
      return;
    }
    onOpenGroupInfo?.("general");
  }

  return (
    <div className={layoutClass}>
      <Sidebar
        username={username}
        avatarUrl={avatarUrl}
        users={users}
        chatUsers={chatUsers}
        messages={messages}
        selectedUser={selectedUser}
        groupName={groupName}
        groupAvatarUrl={groupAvatarUrl}
        onSelectUser={handleSelectChat}
        onOpenProfile={onOpenProfile}
        onOpenSettings={onOpenSettings}
        onStartNewChat={handleStartNewChat}
        onLogout={onLogout}
      />

      <main className="home-main">
        <header
          className="home-header clickable"
          onClick={handleOpenHeaderProfile}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleOpenHeaderProfile();
            }
          }}
          role="button"
          tabIndex={0}
        >
          <button
            type="button"
            className="back-btn"
            onClick={(event) => {
              event.stopPropagation();
              handleBackToList();
            }}
            aria-label="Volver a chats"
          >
            ←
          </button>

          {selectedUser || !groupAvatarUrl ? (
            <span
              className="header-avatar"
              style={{ background: getNameColor(title) }}
              aria-hidden="true"
            >
              {getInitials(title)}
            </span>
          ) : (
            <img className="header-avatar photo" src={groupAvatarUrl} alt="" />
          )}

          <div className="header-info">
            <h1>{title}</h1>
            <p className={selectedUser && contactOnline ? "status-online" : ""}>
              {selectedUser
                ? contactOnline
                  ? "en línea"
                  : "visto hace poco"
                : `Grupo · ${memberCount} conectados`}
            </p>
          </div>
        </header>

        <section className="messages">
          {visibleMessages.length === 0 ? (
            <p className="empty">Aún no hay mensajes. Escribe el primero.</p>
          ) : (
            visibleMessages.map((message, index) =>
              message.type === "file" ? (
                <FileMessage
                  key={index}
                  message={message}
                  currentUser={username}
                />
              ) : (
                <Message
                  key={index}
                  message={message}
                  currentUser={username}
                />
              ),
            )
          )}
        </section>

        <MessageInput
          selectedUser={selectedUser}
          onSend={onSend}
          onSendFile={onSendFile}
        />
      </main>
    </div>
  );
}
