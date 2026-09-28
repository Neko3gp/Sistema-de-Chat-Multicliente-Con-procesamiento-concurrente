import { useEffect, useReducer, useRef, useState } from "react";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Home from "./pages/Home";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import GroupInfo from "./pages/GroupInfo";
import Monitor from "./pages/Monitor";
import { initialMonitorState, monitorReducer } from "./utils/monitor";
import {
  connectSocket,
  registerUser,
  sendBroadcast,
  sendPrivateMessage,
  sendFile,
  sendGroupMessage,
  sendUpdateProfile,
  sendReadReceipt,
  requestDirectory,
  isSocketOpen,
  requestAdminUsers,
  requestAdminGroups,
  adminCreateUser,
  adminUpdateUser,
  adminDeleteUser,
  adminCreateGroup,
  adminUpdateGroup,
  adminDeleteGroup,
  disconnectSocket,
} from "./services/socket";
import { groups as mockGroups } from "./data/conversations";
import { fileToBase64 } from "./utils/files";
import { loadLocalChats, saveLocalChats } from "./utils/localChats";
import { loadLocalProfile, saveLocalProfile } from "./utils/localProfile";
import {
  chatKey,
  createMessageId,
  groupKeyFromChatKey,
  messageChatKey,
  truncateText,
} from "./utils/messageStatus";
import IncomingToast from "./components/IncomingToast";
import {
  clearSession,
  loadSession,
  refreshSession,
  saveSession,
} from "./utils/session";
import {
  applyTheme,
  followsSystem,
  loadThemePreference,
  resolveTheme,
  saveThemePreference,
} from "./utils/theme";
import {
  loadUnreadStore,
  saveUnreadStore,
} from "./utils/unreadStore";
import "./App.css";

const EMPTY_GROUPS = {
  general: {
    ...mockGroups.general,
    admin: "",
    members: [],
  },
};

function mapServerReason(reason) {
  switch (reason) {
    case "invalid_credentials":
      return "Usuario o contraseña incorrectos";
    case "username_taken":
      return "Ese nombre de usuario ya está en uso";
    case "already_connected":
      return "Ese usuario ya tiene una sesión abierta";
    case "user_not_found":
      return "El destinatario no está conectado";
    case "authentication_required":
      return "Debes iniciar sesión";
    case "file_too_large":
      return "El archivo supera el límite de 5 MiB";
    case "forbidden":
      return "No tienes permiso para esa acción";
    case "invalid_message":
      return "Mensaje inválido";
    case "invalid_user":
      return "Los datos del usuario no son válidos";
    case "cannot_delete_user":
      return "No puedes eliminar esa cuenta desde esta sesión";
    case "invalid_group":
      return "El grupo necesita nombre e integrantes válidos";
    case "group_not_found":
      return "El grupo ya no existe";
    case "connection_failed":
      return "No se pudo conectar al servidor";
    case "connection_closed":
      return "Se cerró la conexión con el servidor";
    default:
      return reason || "Error del servidor";
  }
}

function stubContact(name) {
  return {
    username: name,
    email: "",
    description: "",
    avatarUrl: "",
    lastSeen: new Date(),
  };
}

function hydrateHistory(history, owner) {
  const messages = Array.isArray(history) ? history : [];
  const chatUsers = new Set();
  const contacts = {};
  for (const message of messages) {
    if (message.type === "group_message") continue;
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
    })),
    chatUsers: Array.from(chatUsers),
    contacts,
  };
}

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

  const generalGroup = groupsData.general;
  groupNameRef.current = generalGroup?.name || "Sala general";
  selectedUserRef.current = selectedUser;
  selectedGroupIdRef.current = selectedGroupId;
  isViewingChatRef.current = isViewingChat;
  contactsRef.current = contacts;
  customGroupsRef.current = customGroups;

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

  function clearReconnectTimer() {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }

  function scheduleReconnect(delayMs = 900) {
    clearReconnectTimer();
    setReconnecting(true);
    setError("Reconectando…");
    reconnectTimerRef.current = setTimeout(() => {
      const session = roleRef.current === "admin"
        ? { username: usernameRef.current, password: passwordRef.current }
        : loadSession();
      if (!session) {
        setReconnecting(false);
        resetSession("La sesión expiró. Vuelve a iniciar sesión.");
        return;
      }
      intentionalCloseRef.current = false;
      setUsername(session.username);
      usernameRef.current = session.username;
      setPassword(session.password);
      passwordRef.current = session.password;
      disconnectSocket({ silent: true });
      connectSocket(session.username, session.password, dispatchServerMessage);
    }, delayMs);
  }

  useEffect(() => {
    if (!authenticated || !username) return;
    saveLocalChats(username, { chatUsers, contacts, customGroups });
  }, [authenticated, username, chatUsers, contacts, customGroups]);

  useEffect(() => {
    if (!authenticated || !username) return;
    saveUnreadStore(username, unreadCounts, notifications);
  }, [authenticated, username, unreadCounts, notifications]);

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

  function previewFromMessage(message) {
    if (message.type === "file") return message.filename || "Archivo";
    return message.message || "Nuevo mensaje";
  }

  function markChatRead(user = null, groupId = null) {
    const key = chatKey(user, groupId);
    setUnreadCounts((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setNotifications((prev) =>
      prev.map((item) =>
        item.chatKey === key ? { ...item, read: true } : item,
      ),
    );
    if (!groupId && isSocketOpen()) {
      sendReadReceipt(user || null);
    }
  }

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

  function handleMarkAllNotificationsRead() {
    setUnreadCounts({});
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
  }

  function dismissIncomingToast(id) {
    setIncomingToast((prev) => (prev && prev.id === id ? null : prev));
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

  function ensureCustomGroupFromMessage(message) {
    if (message.type !== "group_message" || !message.groupId) return;
    upsertCustomGroup({
      id: message.groupId,
      name: message.groupName || "Grupo",
      admin: message.from || usernameRef.current,
      members: message.members || [],
    });
  }

  function upsertCustomGroup(group) {
    if (!group?.id) return;
    const id = group.id;
    const me = usernameRef.current;
    setCustomGroups((prev) => {
      if (prev.some((g) => g.id === id)) {
        return prev.map((g) => {
          if (g.id !== id) return g;
          const members = Array.from(
            new Set([...(g.members || []), ...(group.members || []), me].filter(Boolean)),
          );
          return {
            ...g,
            name: group.name || g.name,
            members,
          };
        });
      }
      return [
        ...prev,
        {
          id,
          name: group.name || "Grupo",
          avatarUrl: group.avatarUrl || "",
          description: group.description || "",
          admin: group.owner || group.admin || me,
          members: Array.from(
            new Set([...(group.members || []), me].filter(Boolean)),
          ),
        },
      ];
    });
  }

  function notifyGroupAdded(group, text = "Se te agregó a este grupo") {
    upsertCustomGroup(group);
    const key = chatKey(null, group.id);
    const notification = {
      id: createMessageId(),
      chatKey: key,
      chatLabel: group.name,
      from: "Administrador",
      preview: text,
      at: new Date(),
      read: false,
    };
    setUnreadCounts((prev) => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
    setNotifications((prev) => [notification, ...prev].slice(0, 40));
    setIncomingToast({
      id: notification.id,
      chatKey: key,
      from: "Administrador",
      chatLabel: group.name,
      avatarUrl: "",
      preview: text,
      context: "Grupos de chat",
    });
  }

  function pushIncomingUnread(message) {
    const me = usernameRef.current;
    if (!message.from || message.from === me) return;

    const key = messageChatKey(message, me);
    const viewingKey = chatKey(selectedUserRef.current, selectedGroupIdRef.current);
    const viewingThis =
      isViewingChatRef.current && key === viewingKey;

    if (viewingThis) {
      if (!groupKeyFromChatKey(key) && isSocketOpen()) {
        sendReadReceipt(selectedUserRef.current || null);
      }
      return;
    }

    const groupId = groupKeyFromChatKey(key);
    const label = groupId
      ? (message.groupName || customGroupsRef.current.find((g) => g.id === groupId)?.name || "Grupo")
      : key === "__broadcast__"
        ? groupNameRef.current
        : message.from;
    const rawPreview = previewFromMessage(message);
    const preview =
      key === "__broadcast__" || groupId
        ? truncateText(`${message.from}: ${rawPreview}`, 72)
        : truncateText(rawPreview, 72);
    const toastId = createMessageId();
    const avatarUrl = contactsRef.current[message.from]?.avatarUrl || "";

    setUnreadCounts((prev) => ({
      ...prev,
      [key]: (prev[key] || 0) + 1,
    }));
    setNotifications((prev) =>
      [
        {
          id: toastId,
          chatKey: key,
          chatLabel: label,
          from: message.from,
          preview,
          at: new Date(),
          read: false,
        },
        ...prev,
      ].slice(0, 40),
    );
    setIncomingToast({
      id: toastId,
      chatKey: key,
      from: message.from,
      chatLabel: label,
      avatarUrl,
      preview,
      context: key === "__broadcast__" ? groupNameRef.current : null,
    });
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
          description: profile.description || prev[contactName]?.description || "",
          avatarUrl: profile.avatarUrl || prev[contactName]?.avatarUrl || "",
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
    setDirectoryLoading(true);
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
    if (nextGroup.admin !== username) return;

    if (nextGroup.id !== "general") {
      setCustomGroups((prev) =>
        prev.map((group) =>
          group.id === nextGroup.id ? { ...group, ...nextGroup } : group,
        ),
      );
      setViewedGroup(nextGroup);
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

  function resetSession(keepAuthError = "") {
    clearReconnectTimer();
    setReconnecting(false);
    clearSession();
    setAuthenticated(false);
    authenticatedRef.current = false;
    roleRef.current = null;
    dispatchMonitor({ type: "reset" });
    setView("login");
    setUsername("");
    usernameRef.current = "";
    setEmail("");
    setPassword("");
    passwordRef.current = "";
    setDescription("");
    setAvatarUrl("");
    setUsers([]);
    setMessages([]);
    setSelectedUser(null);
    setSelectedGroupId(null);
    setViewedContact(null);
    setViewedGroup(null);
    setGroupsData(EMPTY_GROUPS);
    setContacts({});
    setChatUsers([]);
    setCustomGroups([]);
    setDirectoryUsers([]);
    setDirectoryLoading(false);
    setUnreadCounts({});
    setNotifications([]);
    setIncomingToast(null);
    setIsViewingChat(false);
    setSuccess("");
    setError(keepAuthError);
  }

  function handleServerMessage(message) {
    switch (message.type) {
      case "login_result":
        if (message.ok) {
          if (message.role === "admin") {
            roleRef.current = "admin";
            authenticatedRef.current = true;
            clearSession();
            clearReconnectTimer();
            setError("");
            setSuccess("");
            setAuthenticated(true);
            setReconnecting(false);
            setView("monitor");
            requestAdminUsers();
            requestAdminGroups();
            return;
          }

          roleRef.current = "user";
          const wasAuthenticated = authenticatedRef.current;
          const local = loadLocalProfile(usernameRef.current) || {};
          const nextDescription =
            typeof message.description === "string"
              ? message.description
              : local.description || "";
          const nextAvatar =
            typeof message.avatarUrl === "string"
              ? message.avatarUrl
              : local.avatarUrl || "";

          saveSession({
            username: usernameRef.current,
            password: passwordRef.current,
          });
          setEmail(local.email || "");
          setDescription(nextDescription);
          setAvatarUrl(nextAvatar);
          saveLocalProfile(usernameRef.current, {
            email: local.email || "",
            description: nextDescription,
            avatarUrl: nextAvatar,
          });
          setError("");
          setSuccess("");
          setReconnecting(false);
          setAuthenticated(true);
          setView("home");

          if (!wasAuthenticated) {
            const saved = loadLocalChats(usernameRef.current);
            const unread = loadUnreadStore(usernameRef.current);
            setMessages([]);
            setUsers([]);
            setChatUsers(saved.chatUsers);
            setContacts(saved.contacts);
            setCustomGroups(saved.customGroups || []);
            setDirectoryUsers([]);
            setUnreadCounts(unread.counts);
            setNotifications(unread.items);
            setSelectedGroupId(null);
            setIsViewingChat(false);
            setGroupsData({
              general: {
                ...EMPTY_GROUPS.general,
                admin: usernameRef.current,
                members: [],
              },
            });
          }
        } else {
          clearReconnectTimer();
          roleRef.current = null;
          authenticatedRef.current = false;
          dispatchMonitor({ type: "reset" });
          setReconnecting(false);
          clearSession();
          setError(mapServerReason(message.reason || "invalid_credentials"));
          setAuthenticated(false);
          setView("login");
        }
        break;
      case "monitor_snapshot":
      case "monitor_event":
      case "monitor_stats":
        if (roleRef.current === "admin") {
          dispatchMonitor({ ...message, receivedAt: Date.now() });
        }
        break;
      case "admin_users":
        setAdminUsers(Array.isArray(message.users) ? message.users : []);
        break;
      case "admin_groups":
        setAdminGroups(Array.isArray(message.groups) ? message.groups : []);
        break;
      case "admin_result":
        if (message.ok) {
          setError("");
          requestAdminUsers();
          requestAdminGroups();
        } else {
          setError(mapServerReason(message.reason || "invalid_message"));
        }
        break;
      case "register_result":
        if (message.ok) {
          setError("");
          setSuccess("Cuenta creada. Ahora inicia sesión.");
          if (usernameRef.current) {
            saveLocalProfile(usernameRef.current, {
              email,
              description: "",
              avatarUrl: "",
            });
          }
          setView("login");
        } else {
          setError(mapServerReason(message.reason || "username_taken"));
        }
        break;
      case "profile_result":
        if (message.ok) {
          const nextDescription = message.description || "";
          const nextAvatar = message.avatarUrl || "";
          setDescription(nextDescription);
          setAvatarUrl(nextAvatar);
          saveLocalProfile(usernameRef.current, {
            email,
            description: nextDescription,
            avatarUrl: nextAvatar,
          });
          refreshSession();
        }
        break;
      case "user_list": {
        const nextUsers = (message.users || []).filter(Boolean);
        const profiles =
          message.profiles && typeof message.profiles === "object"
            ? message.profiles
            : {};
        setUsers(nextUsers);
        setGroupsData((prev) => ({
          ...prev,
          general: {
            ...prev.general,
            members: nextUsers,
          },
        }));
        setContacts((prev) => {
          const next = { ...prev };
          for (const name of nextUsers) {
            const remote = profiles[name] || {};
            const base = next[name] || stubContact(name);
            next[name] = {
              ...base,
              username: name,
              avatarUrl:
                typeof remote.avatarUrl === "string"
                  ? remote.avatarUrl
                  : base.avatarUrl || "",
              description:
                typeof remote.description === "string"
                  ? remote.description
                  : base.description || "",
            };
          }
          return next;
        });
        setChatUsers((prev) => {
          const merged = new Set(prev);
          for (const name of nextUsers) {
            if (name !== usernameRef.current) merged.add(name);
          }
          return Array.from(merged);
        });
        refreshSession();
        break;
      }
      case "directory": {
        const list = Array.isArray(message.users) ? message.users : [];
        setDirectoryUsers(
          list
            .filter((user) => user && typeof user.username === "string")
            .map((user) => ({
              username: user.username,
              avatarUrl: typeof user.avatarUrl === "string" ? user.avatarUrl : "",
              description:
                typeof user.description === "string" ? user.description : "",
            })),
        );
        setDirectoryLoading(false);
        setAdminUsers([]);
        setAdminGroups([]);
        refreshSession();
        break;
      }
      case "history": {
        const restored = hydrateHistory(message.messages, usernameRef.current);
        setMessages(restored.messages);
        setChatUsers((prev) => Array.from(new Set([...prev, ...restored.chatUsers])));
        setContacts((prev) => {
          const next = { ...prev };
          for (const [name, profile] of Object.entries(restored.contacts)) {
            next[name] = next[name] || profile;
          }
          return next;
        });
        for (const restoredMessage of restored.messages) {
          if (restoredMessage.type === "group_message") {
            ensureCustomGroupFromMessage(restoredMessage);
          }
        }
        break;
      }
      case "group_list":
        for (const group of message.groups || []) upsertCustomGroup(group);
        break;
      case "group_added":
        notifyGroupAdded(message.group, message.message || undefined);
        break;
      case "group_updated":
        upsertCustomGroup(message.group);
        break;
      case "group_removed": {
        const removedId = message.group?.id;
        setCustomGroups((prev) => prev.filter((group) => group.id !== removedId));
        if (selectedGroupIdRef.current === removedId) {
          setSelectedGroupId(null);
          setView("home");
        }
        const key = chatKey(null, removedId);
        const notification = {
          id: createMessageId(),
          chatKey: key,
          chatLabel: message.group?.name || "Grupo",
          from: "Administrador",
          preview: "Se te removió de este grupo",
          at: new Date(),
          read: false,
        };
        setUnreadCounts((prev) => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
        setNotifications((prev) => [notification, ...prev].slice(0, 40));
        setIncomingToast({
          id: notification.id,
          chatKey: key,
          from: "Administrador",
          chatLabel: message.group?.name || "Grupo",
          avatarUrl: "",
          preview: notification.preview,
          context: "Grupos de chat",
        });
        break;
      }
      case "group_deleted":
        setCustomGroups((prev) => prev.filter((group) => group.id !== message.group?.id));
        break;
      case "username_changed": {
        const nextUsername = message.username;
        if (!nextUsername) break;
        const previousUsername = usernameRef.current;
        usernameRef.current = nextUsername;
        setUsername(nextUsername);
        saveSession({ username: nextUsername, password: passwordRef.current });
        setChatUsers((prev) => prev.map((name) => name === previousUsername ? nextUsername : name));
        setMessages((prev) => prev.map((item) => ({
          ...item,
          from: item.from === previousUsername ? nextUsername : item.from,
          to: item.to === previousUsername ? nextUsername : item.to,
          members: Array.isArray(item.members) ? item.members.map((name) => name === previousUsername ? nextUsername : name) : item.members,
        })));
        break;
      }
      case "broadcast":
      case "private_message":
      case "file":
      case "group_message":
        if (message.type === "group_message") {
          ensureCustomGroupFromMessage(message);
        }
        if (message.from && message.from !== usernameRef.current) {
          ensureContact(message.from);
          if (message.type !== "group_message") {
            setChatUsers((prev) =>
              prev.includes(message.from) ? prev : [...prev, message.from],
            );
          }
          pushIncomingUnread(message);
        }
        setMessages((prev) => [
          ...prev,
          {
            ...message,
            id: message.id || createMessageId(),
            at: new Date(),
            status: message.from === usernameRef.current ? "sent" : undefined,
          },
        ]);
        refreshSession();
        break;
      case "read_receipt": {
        const reader = message.from;
        const me = usernameRef.current;
        if (!reader || reader === me) break;
        setMessages((prev) =>
          prev.map((item) => {
            if (item.from !== me) return item;
            if (item.status === "seen") return item;
            if (message.chat == null) {
              if (
                item.type === "broadcast" ||
                (item.type === "file" && !item.to)
              ) {
                return { ...item, status: "seen" };
              }
              return item;
            }
            if (
              (item.type === "private_message" || item.type === "file") &&
              item.to === reader
            ) {
              return { ...item, status: "seen" };
            }
            return item;
          }),
        );
        refreshSession();
        break;
      }
      case "connection_closed":
        if (intentionalCloseRef.current) {
          intentionalCloseRef.current = false;
          break;
        }
        if (authenticatedRef.current && (roleRef.current === "admin" || loadSession())) {
          scheduleReconnect();
        } else if (authenticatedRef.current) {
          resetSession(mapServerReason("connection_closed"));
        }
        break;
      case "error":
        if (
          (message.reason === "connection_failed" ||
            message.reason === "already_connected") &&
          authenticatedRef.current &&
          (roleRef.current === "admin" || loadSession())
        ) {
          scheduleReconnect(message.reason === "already_connected" ? 2500 : 1500);
          break;
        }
        setError(mapServerReason(message.reason));
        break;
      default:
        break;
    }
  }

  messageHandlerRef.current = handleServerMessage;

  function handleLogin(user, pass) {
    setError("");
    setSuccess("");
    setReconnecting(false);
    clearReconnectTimer();

    const trimmed = user.trim();
    if (!trimmed || !pass) {
      setError("Completa usuario y contraseña");
      return;
    }

    intentionalCloseRef.current = false;
    setUsername(trimmed);
    usernameRef.current = trimmed;
    setPassword(pass);
    passwordRef.current = pass;
    disconnectSocket({ silent: true });
    connectSocket(trimmed, pass, dispatchServerMessage);
  }

  function handleRegister(user, mail, pass) {
    setError("");
    setSuccess("");

    const nextUsername = user.trim();
    const emailValue = mail.trim().toLowerCase();

    if (!nextUsername || !pass) {
      setError("Completa usuario y contraseña");
      return;
    }

    intentionalCloseRef.current = false;
    setUsername(nextUsername);
    usernameRef.current = nextUsername;
    setEmail(emailValue);
    setPassword(pass);
    passwordRef.current = pass;
    disconnectSocket({ silent: true });
    registerUser(nextUsername, pass, dispatchServerMessage);
  }

  function handleSend(text) {
    const id = createMessageId();
    const open = isSocketOpen();
    const activeGroup = selectedGroupId
      ? customGroups.find((group) => group.id === selectedGroupId)
      : null;

    let payload;
    if (activeGroup) {
      payload = {
        id,
        type: "group_message",
        from: username,
        groupId: activeGroup.id,
        groupName: activeGroup.name,
        members: activeGroup.members || [],
        message: text,
        at: new Date(),
        status: open ? "sent" : "failed",
      };
      if (open) {
        sendGroupMessage({
          groupId: activeGroup.id,
          groupName: activeGroup.name,
          members: activeGroup.members || [],
          message: text,
        });
      }
    } else if (selectedUser) {
      payload = {
        id,
        type: "private_message",
        from: username,
        to: selectedUser,
        message: text,
        at: new Date(),
        status: open ? "sent" : "failed",
      };
      if (open) sendPrivateMessage(selectedUser, text);
    } else {
      payload = {
        id,
        type: "broadcast",
        from: username,
        message: text,
        at: new Date(),
        status: open ? "sent" : "failed",
      };
      if (open) sendBroadcast(text);
    }

    setMessages((prev) => [...prev, payload]);
  }

  async function handleSendFile(file) {
    if (selectedGroupId) {
      throw new Error("Los archivos en grupos aún no están disponibles");
    }
    if (selectedUser && !users.includes(selectedUser)) {
      throw new Error("user_not_found");
    }

    const data = await fileToBase64(file);
    const id = createMessageId();
    const open = isSocketOpen();
    const payload = {
      id,
      type: "file",
      from: username,
      to: selectedUser || null,
      filename: file.name,
      mimeType: file.type || undefined,
      data,
      at: new Date(),
      status: open ? "sent" : "failed",
    };

    if (open) {
      sendFile(selectedUser || null, file.name, data);
    }
    setMessages((prev) => [...prev, payload]);
  }

  function handleSaveProfile(nextProfile) {
    const nextEmail = nextProfile.email || "";
    const nextDescription = nextProfile.description || "";
    const nextAvatar = nextProfile.avatarUrl || "";

    setEmail(nextEmail);
    setDescription(nextDescription);
    setAvatarUrl(nextAvatar);
    saveLocalProfile(username, {
      email: nextEmail,
      description: nextDescription,
      avatarUrl: nextAvatar,
    });
    sendUpdateProfile({
      avatarUrl: nextAvatar,
      description: nextDescription,
    });
  }

  function handleLogout() {
    intentionalCloseRef.current = true;
    clearReconnectTimer();
    disconnectSocket({ silent: true });
    resetSession("");
  }

  if (authenticated && view === "monitor") {
    return (
      <Monitor
        username={username}
        monitor={monitor}
        reconnecting={reconnecting}
        error={error}
        onLogout={handleLogout}
        themePreference={themePreference}
        onThemeChange={handleThemeChange}
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
          directoryUsers={directoryUsers}
          directoryLoading={directoryLoading}
          openChatNonce={openChatNonce}
          onSelectUser={handleSelectUser}
          onSelectGroup={handleSelectGroup}
          onLeaveChatView={handleLeaveChatView}
          onViewingChange={handleViewingChange}
          onSend={handleSend}
          onSendFile={handleSendFile}
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
