/**
 * Render de pantallas: monitor, chat autenticado, login y registro.
 */
import Login from "./auth/components/Login";
import Register from "./auth/components/Register";
import Home from "./chat/components/Home";
import Profile from "./auth/components/Profile";
import Settings from "./auth/components/Settings";
import GroupInfo from "./groups/components/GroupInfo";
import Monitor from "./admin/components/Monitor.jsx";
import IncomingToast from "./common/components/IncomingToast";
import {
  adminCreateUser,
  adminUpdateUser,
  adminDeleteUser,
  adminCreateGroup,
  adminUpdateGroup,
  adminDeleteGroup,
} from "./websockets";

export default function AppViews(props) {
  const {
    authenticated,
    view,
    inApp,
    reconnecting,
    error,
    success,
    username,
    password,
    email,
    description,
    avatarUrl,
    users,
    messages,
    selectedUser,
    selectedGroupId,
    customGroups,
    generalGroup,
    chatUsers,
    contacts,
    unreadCounts,
    notifications,
    typingByChat,
    directoryUsers,
    directoryLoading,
    openChatNonce,
    incomingToast,
    viewedContact,
    viewedGroup,
    returnView,
    themePreference,
    theme,
    monitor,
    adminUsers,
    adminGroups,
    handleLogout,
    handleThemeChange,
    openIncomingToast,
    dismissIncomingToast,
    handleSelectUser,
    handleSelectGroup,
    handleLeaveChatView,
    handleViewingChange,
    handleSend,
    handleSendFile,
    handleTyping,
    openOwnProfile,
    openContactProfile,
    openGroupInfo,
    openSettings,
    handleStartNewChat,
    handleCreateGroup,
    handleRequestDirectory,
    handleMarkAllNotificationsRead,
    closeOverlay,
    handleSaveProfile,
    handleSaveGroup,
    handleLogin,
    handleRegister,
    setView,
    setError,
    setSuccess,
    setViewedContact,
  } = props;

  if (authenticated && view === "monitor") {
    return (
      <Monitor
        username={username}
        monitor={monitor}
        reconnecting={reconnecting}
        error={error}
        onLogout={handleLogout}
        adminUsers={adminUsers}
        adminGroups={adminGroups}
        onCreateUser={adminCreateUser}
        onUpdateUser={adminUpdateUser}
        onDeleteUser={adminDeleteUser}
        onCreateGroup={adminCreateGroup}
        onUpdateGroup={adminUpdateGroup}
        onDeleteGroup={adminDeleteGroup}
      />
    );
  }

  if (inApp) {
    const isContact = Boolean(viewedContact);

    return (
      <div className="app-shell">
        {reconnecting ? (
          <div className="reconnect-banner" role="status">
            Reconectando sesión…
          </div>
        ) : null}
        <IncomingToast
          toast={incomingToast}
          onOpen={openIncomingToast}
          onDismiss={dismissIncomingToast}
        />
        <Home
          username={username}
          avatarUrl={avatarUrl}
          users={users}
          messages={messages}
          selectedUser={selectedUser}
          selectedGroupId={selectedGroupId}
          customGroups={customGroups}
          groupName={generalGroup?.name || "Sala general"}
          groupAvatarUrl={generalGroup?.avatarUrl || ""}
          chatUsers={chatUsers}
          contacts={contacts}
          unreadCounts={unreadCounts}
          notifications={notifications}
          typingByChat={typingByChat}
          directoryUsers={directoryUsers}
          directoryLoading={directoryLoading}
          openChatNonce={openChatNonce}
          onSelectUser={handleSelectUser}
          onSelectGroup={handleSelectGroup}
          onLeaveChatView={handleLeaveChatView}
          onViewingChange={handleViewingChange}
          onSend={handleSend}
          onSendFile={handleSendFile}
          onTyping={handleTyping}
          onOpenProfile={() => openOwnProfile("home")}
          onOpenContactProfile={(name) => openContactProfile(name, "home")}
          onOpenGroupInfo={openGroupInfo}
          onOpenSettings={openSettings}
          onStartNewChat={handleStartNewChat}
          onCreateGroup={handleCreateGroup}
          onRequestDirectory={handleRequestDirectory}
          onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
          onLogout={handleLogout}
        />

        {view === "settings" ? (
          <div
            className="app-dialog-backdrop"
            onClick={closeOverlay}
            role="presentation"
          >
            <div
              className="app-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Configuración"
              onClick={(event) => event.stopPropagation()}
            >
              <Settings
                themePreference={themePreference}
                resolvedTheme={theme}
                onThemeChange={handleThemeChange}
                onOpenProfile={() => openOwnProfile("settings")}
                onBack={closeOverlay}
              />
            </div>
          </div>
        ) : null}

        {view === "profile" ? (
          <div
            className="app-dialog-backdrop"
            onClick={() => {
              setViewedContact(null);
              setView(
                returnView === "settings"
                  ? "settings"
                  : returnView === "group"
                    ? "group"
                    : "home",
              );
            }}
            role="presentation"
          >
            <div
              className="app-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={isContact ? "Info del contacto" : "Perfil"}
              onClick={(event) => event.stopPropagation()}
            >
              <Profile
                mode={isContact ? "contact" : "own"}
                profile={
                  isContact
                    ? viewedContact
                    : { username, email, password, description, avatarUrl }
                }
                onSave={handleSaveProfile}
                onBack={() => {
                  setViewedContact(null);
                  setView(
                    returnView === "settings"
                      ? "settings"
                      : returnView === "group"
                        ? "group"
                        : "home",
                  );
                }}
                onLogout={handleLogout}
              />
            </div>
          </div>
        ) : null}

        {view === "group" && viewedGroup ? (
          <div
            className="app-dialog-backdrop"
            onClick={closeOverlay}
            role="presentation"
          >
            <div
              className="app-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Info del grupo"
              onClick={(event) => event.stopPropagation()}
            >
              <GroupInfo
                group={viewedGroup}
                currentUser={username}
                onlineUsers={users}
                contacts={contacts}
                directoryUsers={directoryUsers}
                directoryLoading={directoryLoading}
                onRequestDirectory={handleRequestDirectory}
                onBack={closeOverlay}
                onOpenMember={(member) => openContactProfile(member, "group")}
                onSave={handleSaveGroup}
              />
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (view === "register") {
    return (
      <Register
        onSubmit={handleRegister}
        onGoLogin={() => {
          setView("login");
          setError("");
          setSuccess("");
        }}
        error={error}
        success={success}
      />
    );
  }

  return (
    <Login
      onSubmit={handleLogin}
      onGoRegister={() => {
        setView("register");
        setError("");
        setSuccess("");
      }}
      error={error}
    />
  );
}
