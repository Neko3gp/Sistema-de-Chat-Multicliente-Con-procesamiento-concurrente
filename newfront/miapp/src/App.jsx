/**
 * Orquestador de la app (equivalente a client_handler.py del backend).
 *
 * Dominios = backend/handlers/. Dentro de cada uno:
 *   components/  UI React
 *   hooks/       lógica de estado / helpers
 *   lib/         utilidades puras (sin JSX)
 *   styles/      CSS del dominio
 *
 *   auth/   login, registro, perfil, settings   ← handlers/auth.py
 *   chat/   mensajes, sidebar, envío, compose   ← handlers/chat.py
 *   groups/ info de grupo, crear, picker        ← handlers/groups.py
 *   files/  adjuntos, audio, PDF                ← handlers/files.py
 *   admin/  Monitor / trazas                    ← handlers/admin.py
 *   common/ UI/util compartidos                 ← handlers/common.py
 *   websockets/ socket + despacho               ← websocket_handler.py
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { initialMonitorState, monitorReducer } from "./admin/lib/monitorState";
import {
  connectSocket,
  sendCreateGroup,
  sendUpdateGroup,
  requestDirectory,
  isSocketOpen,
  createServerMessageHandler,
} from "./websockets";
import { stubContact } from "./chat/lib/history";
import { createGroupHelpers } from "./groups/hooks/useGroups";
import { createUnreadHelpers } from "./chat/hooks/useUnread";
import { createAuthHelpers } from "./auth/hooks/useAuth";
import { createChatSendHelpers } from "./chat/hooks/useChatSend";
import AppViews from "./AppViews";
import { groups as mockGroups } from "./chat/lib/conversations";
import { saveLocalChats } from "./chat/lib/localChats";
import {
  createMessageId,
  groupKeyFromChatKey,
} from "./chat/lib/messageKeys";
import {
  unlockNotificationAudio,
} from "./common/lib/notificationSound";
import { loadSession } from "./common/lib/session";
import {
  applyTheme,
  followsSystem,
  loadThemePreference,
  resolveTheme,
  saveThemePreference,
} from "./auth/lib/theme";
import { saveUnreadStore } from "./chat/lib/unreadStore";
import "./App.css";

const EMPTY_GROUPS = {
  general: {
    ...mockGroups.general,
    admin: "",
    members: [],
  },
};

export default function App() {
  const [view, setView] = useState("login");
  const [returnView, setReturnView] = useState("home");
  const [viewedGroup, setViewedGroup] = useState(null);
  const [themePreference, setThemePreference] = useState(loadThemePreference);
  const [theme, setTheme] = useState(() =>
    resolveTheme(loadThemePreference()),
  );
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [viewedContact, setViewedContact] = useState(null);
  const [groupsData, setGroupsData] = useState(EMPTY_GROUPS);
  const [contacts, setContacts] = useState({});
  const [chatUsers, setChatUsers] = useState([]);
  const [customGroups, setCustomGroups] = useState([]);
  const [directoryUsers, setDirectoryUsers] = useState([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [lastReadAt, setLastReadAt] = useState({});
  const [typingByChat, setTypingByChat] = useState({});
  const [incomingToast, setIncomingToast] = useState(null);
  const [openChatNonce, setOpenChatNonce] = useState(0);
  const [isViewingChat, setIsViewingChat] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [monitor, dispatchMonitor] = useReducer(monitorReducer, initialMonitorState);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminGroups, setAdminGroups] = useState([]);

  const usernameRef = useRef("");
  const passwordRef = useRef("");
  const authenticatedRef = useRef(false);
  const roleRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const intentionalCloseRef = useRef(false);
  const messageHandlerRef = useRef(null);
  const selectedUserRef = useRef(null);
  const selectedGroupIdRef = useRef(null);
  const isViewingChatRef = useRef(false);
  const groupNameRef = useRef("Sala general");
  const contactsRef = useRef({});
  const customGroupsRef = useRef([]);
  const lastReadAtRef = useRef({});
  const typingTimersRef = useRef({});

  const generalGroup = groupsData.general;
  groupNameRef.current = generalGroup?.name || "Sala general";
  selectedUserRef.current = selectedUser;
  selectedGroupIdRef.current = selectedGroupId;
  isViewingChatRef.current = isViewingChat;
  contactsRef.current = contacts;
  customGroupsRef.current = customGroups;
  lastReadAtRef.current = lastReadAt;

  const { upsertCustomGroup, ensureCustomGroupFromMessage } = createGroupHelpers({
    usernameRef,
    setCustomGroups,
    setViewedGroup,
  });

  const {
    markChatRead,
    handleMarkAllNotificationsRead,
    applyUnreadFromHistory,
    applyRemoteTyping,
    dismissIncomingToast,
    showIncomingToast,
    notifyGroupAdded,
    pushIncomingUnread,
  } = createUnreadHelpers({
    setUnreadCounts,
    setNotifications,
    setLastReadAt,
    lastReadAtRef,
    setIncomingToast,
    setTypingByChat,
    typingTimersRef,
    usernameRef,
    selectedUserRef,
    selectedGroupIdRef,
    isViewingChatRef,
    groupNameRef,
    contactsRef,
    customGroupsRef,
    unreadCounts,
    upsertCustomGroup,
  });

  const inApp =
    authenticated &&
    (view === "home" ||
      view === "settings" ||
      view === "profile" ||
      view === "group");

  useEffect(() => {
    usernameRef.current = username;
  }, [username]);

  useEffect(() => {
    passwordRef.current = password;
  }, [password]);

  useEffect(() => {
    authenticatedRef.current = authenticated;
  }, [authenticated]);

  function dispatchServerMessage(message) {
    messageHandlerRef.current?.(message);
  }

  const {
    clearReconnectTimer,
    scheduleReconnect,
    resetSession,
    handleLogin,
    handleRegister,
    handleLogout,
    handleSaveProfile,
  } = createAuthHelpers({
    reconnectTimerRef,
    roleRef,
    usernameRef,
    passwordRef,
    authenticatedRef,
    intentionalCloseRef,
    lastReadAtRef,
    dispatchServerMessage,
    dispatchMonitor,
    EMPTY_GROUPS,
    username,
    setReconnecting,
    setError,
    setSuccess,
    setAuthenticated,
    setView,
    setUsername,
    setEmail,
    setPassword,
    setDescription,
    setAvatarUrl,
    setUsers,
    setMessages,
    setSelectedUser,
    setSelectedGroupId,
    setViewedContact,
    setViewedGroup,
    setGroupsData,
    setContacts,
    setChatUsers,
    setCustomGroups,
    setDirectoryUsers,
    setDirectoryLoading,
    setUnreadCounts,
    setNotifications,
    setLastReadAt,
    setTypingByChat,
    setIncomingToast,
    setIsViewingChat,
  });

  useEffect(() => {
    if (!authenticated || !username) return;
    saveLocalChats(username, { chatUsers, contacts, customGroups });
  }, [authenticated, username, chatUsers, contacts, customGroups]);

  useEffect(() => {
    if (!authenticated || !username) return;
    saveUnreadStore(username, unreadCounts, notifications, lastReadAt);
  }, [authenticated, username, unreadCounts, notifications, lastReadAt]);

  // Desbloquea el audio con gestos del usuario (iOS/PWA lo exige).
  useEffect(() => {
    if (!authenticated) return undefined;
    function unlock() {
      unlockNotificationAudio();
    }
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("touchstart", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [authenticated]);

  useEffect(() => {
    const session = loadSession();
    if (!session) return undefined;

    setUsername(session.username);
    usernameRef.current = session.username;
    setPassword(session.password);
    passwordRef.current = session.password;
    connectSocket(session.username, session.password, dispatchServerMessage);

    return () => {
      clearReconnectTimer();
    };
  }, []);

  function handleSelectUser(user) {
    setSelectedGroupId(null);
    setSelectedUser(user);
    setIsViewingChat(true);
    markChatRead(user, null);
  }

  function handleSelectGroup(groupId) {
    setSelectedUser(null);
    setSelectedGroupId(groupId);
    setIsViewingChat(true);
    markChatRead(null, groupId);
  }

  function handleLeaveChatView() {
    setIsViewingChat(false);
  }

  function handleViewingChange(viewing) {
    const wasViewing = isViewingChatRef.current;
    setIsViewingChat(viewing);
    if (viewing && !wasViewing) {
      markChatRead(selectedUserRef.current, selectedGroupIdRef.current);
    }
  }

  function openIncomingToast(toast) {
    if (!toast) return;
    setIncomingToast(null);
    setView("home");
    const groupId = groupKeyFromChatKey(toast.chatKey);
    if (groupId) {
      handleSelectGroup(groupId);
    } else {
      const user = toast.chatKey === "__broadcast__" ? null : toast.chatKey;
      handleSelectUser(user);
    }
    setOpenChatNonce((n) => n + 1);
  }

  function openOwnProfile(from = "home") {
    setViewedContact(null);
    setReturnView(from);
    setView("profile");
  }

  function openSettings() {
    setView("settings");
  }

  function handleThemeChange(nextPreference) {
    setThemePreference(nextPreference);
    saveThemePreference(nextPreference);
    setTheme(resolveTheme(nextPreference));
  }

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (!followsSystem(themePreference)) return undefined;

    const media = window.matchMedia("(prefers-color-scheme: light)");
    const syncSystemTheme = () => setTheme(resolveTheme(themePreference));

    syncSystemTheme();
    media.addEventListener("change", syncSystemTheme);
    return () => media.removeEventListener("change", syncSystemTheme);
  }, [themePreference]);

  function findContactByQuery(query) {
    const q = query.trim().toLowerCase();
    if (!q) return null;

    for (const [name, profile] of Object.entries(contacts)) {
      if (
        name.toLowerCase() === q ||
        profile.email?.toLowerCase() === q
      ) {
        return name;
      }
    }

    const onlineMatch = users.find((name) => name.toLowerCase() === q);
    return onlineMatch || null;
  }

  function ensureContact(name) {
    setContacts((prev) =>
      prev[name] ? prev : { ...prev, [name]: stubContact(name) },
    );
  }

  function handleStartNewChat(query) {
    const raw = String(query || "").trim();
    const q = raw.toLowerCase();

    if (!q) {
      return { error: "Escribe un nombre de usuario" };
    }

    if (q === username.toLowerCase() || q === email.toLowerCase()) {
      return { error: "No puedes enviarte un mensaje a ti mismo" };
    }

    let contactName = findContactByQuery(raw);
    if (!contactName) {
      const fromDirectory = directoryUsers.find(
        (user) => (user.username || "").toLowerCase() === q,
      );
      contactName = fromDirectory?.username || raw;
    }

    ensureContact(contactName);
    const profile = directoryUsers.find((user) => user.username === contactName);
    if (profile) {
      setContacts((prev) => ({
        ...prev,
        [contactName]: {
          ...(prev[contactName] || stubContact(contactName)),
          username: contactName,
          description:
            typeof profile.description === "string"
              ? profile.description
              : prev[contactName]?.description || "",
          avatarUrl:
            typeof profile.avatarUrl === "string"
              ? profile.avatarUrl
              : prev[contactName]?.avatarUrl || "",
          email:
            typeof profile.email === "string"
              ? profile.email
              : prev[contactName]?.email || "",
        },
      }));
    }

    setChatUsers((prev) =>
      prev.includes(contactName) ? prev : [...prev, contactName],
    );

    return { username: contactName };
  }

  function handleRequestDirectory() {
    if (!isSocketOpen()) {
      setDirectoryLoading(false);
      return;
    }
    // Si ya hay catálogo, no bloquees la UI: refresca en segundo plano.
    if (directoryUsers.length === 0) {
      setDirectoryLoading(true);
    }
    requestDirectory();
  }

  function handleCreateGroup({ name, members }) {
    const groupName = String(name || "").trim();
    const memberList = Array.isArray(members) ? members.filter(Boolean) : [];
    if (!groupName) return { error: "Escribe el nombre del grupo" };
    if (memberList.length === 0) return { error: "Añade al menos un integrante" };

    const id = createMessageId();
    const group = {
      id,
      name: groupName,
      avatarUrl: "",
      description: "",
      admin: username,
      members: Array.from(new Set([username, ...memberList])),
    };

    for (const member of memberList) {
      ensureContact(member);
    }

    setCustomGroups((prev) => [...prev, group]);
    if (isSocketOpen()) {
      sendCreateGroup({
        groupId: id,
        name: groupName,
        members: group.members,
      });
    }
    handleSelectGroup(id);
    setOpenChatNonce((n) => n + 1);
    return { group };
  }

  function openContactProfile(contactName, from = "home") {
    if (!contactName) return;
    const base = contacts[contactName] || stubContact(contactName);
    if (from !== "group") {
      setViewedGroup(null);
    }
    setViewedContact({
      ...base,
      isOnline: users.includes(contactName),
    });
    setReturnView(from);
    setView("profile");
  }

  function openGroupInfo(groupId = "general") {
    if (groupId && groupId !== "general") {
      const custom = customGroups.find((group) => group.id === groupId);
      if (custom) {
        setViewedContact(null);
        setViewedGroup({
          ...custom,
          members: custom.members?.length ? custom.members : [username],
        });
        setReturnView("home");
        setView("group");
        return;
      }
    }
    const base = groupsData[groupId] || groupsData.general;
    setViewedContact(null);
    setViewedGroup({
      ...base,
      members: base.members?.length ? base.members : users,
    });
    setReturnView("home");
    setView("group");
  }

  function handleSaveGroup(nextGroup) {
    if (!nextGroup?.id) return;
    const adminName = (nextGroup.admin || "").toLowerCase();
    if (!adminName || adminName !== username.toLowerCase()) return;

    if (nextGroup.id !== "general") {
      const members = Array.from(
        new Set([username, ...(nextGroup.members || [])].filter(Boolean)),
      );
      const saved = { ...nextGroup, admin: username, members };
      setCustomGroups((prev) =>
        prev.map((group) =>
          group.id === saved.id ? { ...group, ...saved } : group,
        ),
      );
      setViewedGroup(saved);
      if (isSocketOpen()) {
        sendUpdateGroup({
          groupId: saved.id,
          name: saved.name,
          members: saved.members,
        });
      }
      return;
    }

    setGroupsData((prev) => ({
      ...prev,
      [nextGroup.id]: {
        ...prev[nextGroup.id],
        ...nextGroup,
      },
    }));
    setViewedGroup(nextGroup);
  }

  function closeOverlay() {
    setViewedContact(null);
    setViewedGroup(null);
    setView("home");
  }

  const { handleSend, handleSendFile, handleTyping } = createChatSendHelpers({
    username,
    selectedUser,
    selectedGroupId,
    users,
    customGroups,
    customGroupsRef,
    setMessages,
  });

  messageHandlerRef.current = createServerMessageHandler({
    usernameRef,
    passwordRef,
    authenticatedRef,
    roleRef,
    intentionalCloseRef,
    selectedGroupIdRef,
    lastReadAtRef,
    email,
    setError,
    setSuccess,
    setAuthenticated,
    setReconnecting,
    setView,
    setUsername,
    setEmail,
    setDescription,
    setAvatarUrl,
    setUsers,
    setMessages,
    setChatUsers,
    setContacts,
    setCustomGroups,
    setDirectoryUsers,
    setDirectoryLoading,
    setUnreadCounts,
    setNotifications,
    setLastReadAt,
    setSelectedGroupId,
    setIsViewingChat,
    setAdminUsers,
    setAdminGroups,
    setGroupsData,
    clearReconnectTimer,
    scheduleReconnect,
    resetSession,
    dispatchMonitor,
    upsertCustomGroup,
    ensureCustomGroupFromMessage,
    notifyGroupAdded,
    showIncomingToast,
    applyUnreadFromHistory,
    ensureContact,
    applyRemoteTyping,
    pushIncomingUnread,
    EMPTY_GROUPS,
  });

  return (
    <AppViews
      authenticated={authenticated}
      view={view}
      inApp={inApp}
      reconnecting={reconnecting}
      error={error}
      success={success}
      username={username}
      password={password}
      email={email}
      description={description}
      avatarUrl={avatarUrl}
      users={users}
      messages={messages}
      selectedUser={selectedUser}
      selectedGroupId={selectedGroupId}
      customGroups={customGroups}
      generalGroup={generalGroup}
      chatUsers={chatUsers}
      contacts={contacts}
      unreadCounts={unreadCounts}
      notifications={notifications}
      typingByChat={typingByChat}
      directoryUsers={directoryUsers}
      directoryLoading={directoryLoading}
      openChatNonce={openChatNonce}
      incomingToast={incomingToast}
      viewedContact={viewedContact}
      viewedGroup={viewedGroup}
      returnView={returnView}
      themePreference={themePreference}
      theme={theme}
      monitor={monitor}
      adminUsers={adminUsers}
      adminGroups={adminGroups}
      handleLogout={handleLogout}
      handleThemeChange={handleThemeChange}
      openIncomingToast={openIncomingToast}
      dismissIncomingToast={dismissIncomingToast}
      handleSelectUser={handleSelectUser}
      handleSelectGroup={handleSelectGroup}
      handleLeaveChatView={handleLeaveChatView}
      handleViewingChange={handleViewingChange}
      handleSend={handleSend}
      handleSendFile={handleSendFile}
      handleTyping={handleTyping}
      openOwnProfile={openOwnProfile}
      openContactProfile={openContactProfile}
      openGroupInfo={openGroupInfo}
      openSettings={openSettings}
      handleStartNewChat={handleStartNewChat}
      handleCreateGroup={handleCreateGroup}
      handleRequestDirectory={handleRequestDirectory}
      handleMarkAllNotificationsRead={handleMarkAllNotificationsRead}
      closeOverlay={closeOverlay}
      handleSaveProfile={handleSaveProfile}
      handleSaveGroup={handleSaveGroup}
      handleLogin={handleLogin}
      handleRegister={handleRegister}
      setView={setView}
      setError={setError}
      setSuccess={setSuccess}
      setViewedContact={setViewedContact}
    />
  );
}
