import { useEffect, useRef, useState } from "react";
import Sidebar from "../components/Sidebar";
import Message from "../components/Message";
import FileMessage from "../components/FileMessage";
import MessageInput from "../components/MessageInput";
import TypingBubble from "../components/TypingBubble";
import SystemNotice from "../components/SystemNotice";
import { getInitials, getNameColor } from "../utils/avatar";
import { chatKey } from "../utils/messageStatus";

function filterMessages(messages, username, selectedUser, selectedGroupId) {
  return messages.filter((message) => {
    if (selectedGroupId) {
      return (
        ((message.type === "group_message" ||
          message.type === "group_notice" ||
          message.type === "file") &&
          message.groupId === selectedGroupId)
      );
    }

    if (selectedUser === null) {
      return (
        message.type === "broadcast" ||
        (message.type === "file" && !message.to && !message.groupId)
      );
    }

    return (
      (message.type === "private_message" ||
        (message.type === "file" && !message.groupId)) &&
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
  selectedGroupId = null,
  customGroups = [],
  groupName = "Sala general",
  groupAvatarUrl = "",
  onSelectUser,
  onSelectGroup,
  onLeaveChatView,
  onViewingChange,
  onSend,
  onSendFile,
  onOpenProfile,
  onOpenContactProfile,
  onOpenGroupInfo,
  onOpenSettings,
  onStartNewChat,
  onCreateGroup,
  onRequestDirectory,
  onMarkAllNotificationsRead,
  chatUsers,
  contacts = {},
  unreadCounts = {},
  notifications = [],
  typingByChat = {},
  directoryUsers = [],
  directoryLoading = false,
  openChatNonce = 0,
  onTyping,
  onLogout,
}) {
  const [chatOpen, setChatOpen] = useState(false);
  const messagesEndRef = useRef(null);

  const activeGroup = selectedGroupId
    ? customGroups.find((group) => group.id === selectedGroupId)
    : null;
  const title = activeGroup
    ? activeGroup.name
    : selectedUser
      ? selectedUser
      : groupName;
  const visibleMessages = filterMessages(
    messages,
    username,
    selectedUser,
    selectedGroupId,
  );
  const layoutClass = chatOpen ? "home-layout chat-open" : "home-layout list-open";
  const contactOnline = selectedUser ? users.includes(selectedUser) : false;
  const memberCount = activeGroup
    ? (activeGroup.members || []).length
    : users.length;
  const headerAvatarUrl = activeGroup
    ? activeGroup.avatarUrl || ""
    : selectedUser
      ? contacts[selectedUser]?.avatarUrl || ""
      : groupAvatarUrl;

  useEffect(() => {
    if (openChatNonce > 0) setChatOpen(true);
  }, [openChatNonce]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(min-width: 721px)");
    const sync = () => {
      onViewingChange?.(mq.matches || chatOpen);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen]);

  function handleSelectChat(user) {
    onSelectUser(user);
    setChatOpen(true);
  }

  function handleSelectGroupChat(groupId) {
    onSelectGroup?.(groupId);
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

  function handleCreateGroup(payload) {
    const result = onCreateGroup?.(payload);
    if (result?.error) return result;
    if (result?.group?.id) {
      setChatOpen(true);
    }
    return result;
  }

  function handleBackToList() {
    setChatOpen(false);
    onLeaveChatView?.();
  }

  const typingNames = typingByChat[chatKey(selectedUser, selectedGroupId)]?.names || [];
  const showAuthorOnTyping = Boolean(activeGroup) || selectedUser === null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [visibleMessages.length, typingNames.join("|")]);

  function handleOpenHeaderProfile() {

    if (activeGroup) {
      onOpenGroupInfo?.(activeGroup.id);
      return;
    }
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
        contacts={contacts}
        customGroups={customGroups}
        messages={messages}
        selectedUser={selectedUser}
        selectedGroupId={selectedGroupId}
        groupName={groupName}
        groupAvatarUrl={groupAvatarUrl}
        unreadCounts={unreadCounts}
        notifications={notifications}
        directoryUsers={directoryUsers}
        directoryLoading={directoryLoading}
        onSelectUser={handleSelectChat}
        onSelectGroup={handleSelectGroupChat}
        onOpenProfile={onOpenProfile}
        onOpenSettings={onOpenSettings}
        onStartNewChat={handleStartNewChat}
        onCreateGroup={handleCreateGroup}
        onRequestDirectory={onRequestDirectory}
        onMarkAllNotificationsRead={onMarkAllNotificationsRead}
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

          {headerAvatarUrl ? (
            <img className="header-avatar photo" src={headerAvatarUrl} alt="" />
          ) : (
            <span
              className="header-avatar"
              style={{ background: getNameColor(title) }}
              aria-hidden="true"
            >
              {getInitials(title)}
            </span>
          )}

          <div className="header-info">
            <h1>{title}</h1>
            <p className={selectedUser && contactOnline ? "status-online" : ""}>
              {activeGroup
                ? `Grupo · ${memberCount} integrantes`
                : selectedUser
                  ? contactOnline
                    ? "en línea"
                    : "visto hace poco"
                  : `Grupo · ${memberCount} conectados`}
            </p>
          </div>
        </header>

        <section className="messages">
          {visibleMessages.length === 0 && typingNames.length === 0 ? (
            <p className="empty">Aún no hay mensajes. Escribe el primero.</p>
          ) : (
            <>
              {visibleMessages.map((message, index) =>
                message.type === "group_notice" ? (
                  <SystemNotice
                    key={message.id || `notice-${index}`}
                    message={message}
                  />
                ) : message.type === "file" ? (
                  <FileMessage
                    key={message.id || `file-${index}`}
                    message={message}
                    currentUser={username}
                    avatarUrl={contacts[message.from]?.avatarUrl || ""}
                  />
                ) : (
                  <Message
                    key={message.id || `msg-${index}`}
                    message={message}
                    currentUser={username}
                    avatarUrl={contacts[message.from]?.avatarUrl || ""}
                  />
                ),
              )}
              {typingNames.length > 0 ? (
                <TypingBubble
                  names={typingNames}
                  contacts={contacts}
                  showAuthor={showAuthorOnTyping}
                />
              ) : null}
              <div ref={messagesEndRef} />
            </>
          )}
        </section>

        <MessageInput
          selectedUser={selectedUser}
          selectedGroupId={selectedGroupId}
          onSend={onSend}
          onSendFile={onSendFile}
          onTyping={onTyping}
        />
      </main>
    </div>
  );
}
