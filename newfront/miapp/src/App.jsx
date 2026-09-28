import { useEffect, useRef, useState } from "react";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Home from "./pages/Home";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import GroupInfo from "./pages/GroupInfo";
import {
  connectSocket,
  registerUser,
  sendBroadcast,
  sendPrivateMessage,
  sendFile,
  sendUpdateProfile,
  disconnectSocket,
} from "./services/socket";
import { groups as mockGroups } from "./data/conversations";
import { fileToBase64 } from "./utils/files";
import { loadLocalChats, saveLocalChats } from "./utils/localChats";
import { loadLocalProfile, saveLocalProfile } from "./utils/localProfile";
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
  const [viewedContact, setViewedContact] = useState(null);
  const [groupsData, setGroupsData] = useState(EMPTY_GROUPS);
  const [contacts, setContacts] = useState({});
  const [chatUsers, setChatUsers] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const usernameRef = useRef("");
  const passwordRef = useRef("");
  const authenticatedRef = useRef(false);
  const reconnectTimerRef = useRef(null);
  const intentionalCloseRef = useRef(false);
  const messageHandlerRef = useRef(null);

  const generalGroup = groupsData.general;

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
      const session = loadSession();
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
    saveLocalChats(username, { chatUsers, contacts });
  }, [authenticated, username, chatUsers, contacts]);

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
    const raw = query.trim();
    const q = raw.toLowerCase();

    if (!q) {
      return { error: "Escribe un nombre de usuario" };
    }

    if (q === username.toLowerCase() || q === email.toLowerCase()) {
      return { error: "No puedes enviarte un mensaje a ti mismo" };
    }

    let contactName = findContactByQuery(raw);

    if (!contactName) {
      contactName = raw;
      ensureContact(contactName);
    }

    setChatUsers((prev) =>
      prev.includes(contactName) ? prev : [...prev, contactName],
    );

    return { username: contactName };
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
    setViewedContact(null);
    setViewedGroup(null);
    setGroupsData(EMPTY_GROUPS);
    setContacts({});
    setChatUsers([]);
    setSuccess("");
    setError(keepAuthError);
  }

  function handleServerMessage(message) {
    switch (message.type) {
      case "login_result":
        if (message.ok) {
          if (message.role === "admin") {
            intentionalCloseRef.current = true;
            disconnectSocket({ silent: true });
            clearSession();
            setError(
              "La cuenta admin es solo para el monitor (usa el cliente de consola).",
            );
            setAuthenticated(false);
            setReconnecting(false);
            setView("login");
            return;
          }

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
            setMessages([]);
            setUsers([]);
            setChatUsers(saved.chatUsers);
            setContacts(saved.contacts);
            setGroupsData({
              general: {
                ...EMPTY_GROUPS.general,
                admin: usernameRef.current,
                members: [],
              },
            });
          }
        } else {
          setReconnecting(false);
          clearSession();
          setError(mapServerReason(message.reason || "invalid_credentials"));
          setAuthenticated(false);
          setView("login");
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
      case "broadcast":
      case "private_message":
      case "file":
        if (message.from && message.from !== usernameRef.current) {
          ensureContact(message.from);
          setChatUsers((prev) =>
            prev.includes(message.from) ? prev : [...prev, message.from],
          );
        }
        setMessages((prev) => [...prev, { ...message, at: new Date() }]);
        refreshSession();
        break;
      case "connection_closed":
        if (intentionalCloseRef.current) {
          intentionalCloseRef.current = false;
          break;
        }
        if (authenticatedRef.current && loadSession()) {
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
          loadSession()
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
    const payload = selectedUser
      ? {
          type: "private_message",
          from: username,
          to: selectedUser,
          message: text,
          at: new Date(),
        }
      : {
          type: "broadcast",
          from: username,
          message: text,
          at: new Date(),
        };

    if (selectedUser) {
      sendPrivateMessage(selectedUser, text);
    } else {
      sendBroadcast(text);
    }

    setMessages((prev) => [...prev, payload]);
  }

  async function handleSendFile(file) {
    if (selectedUser && !users.includes(selectedUser)) {
      throw new Error("user_not_found");
    }

    const data = await fileToBase64(file);
    const payload = {
      type: "file",
      from: username,
      to: selectedUser || null,
      filename: file.name,
      mimeType: file.type || undefined,
      data,
      at: new Date(),
    };

    sendFile(selectedUser || null, file.name, data);
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

  if (inApp) {
    const isContact = Boolean(viewedContact);

    return (
      <div className="app-shell">
        {reconnecting ? (
          <div className="reconnect-banner" role="status">
            Reconectando sesión…
          </div>
        ) : null}
        <Home
          username={username}
          avatarUrl={avatarUrl}
          users={users}
          messages={messages}
          selectedUser={selectedUser}
          groupName={generalGroup?.name || "Sala general"}
          groupAvatarUrl={generalGroup?.avatarUrl || ""}
          chatUsers={chatUsers}
          contacts={contacts}
          onSelectUser={setSelectedUser}
          onSend={handleSend}
          onSendFile={handleSendFile}
          onOpenProfile={() => openOwnProfile("home")}
          onOpenContactProfile={(name) => openContactProfile(name, "home")}
          onOpenGroupInfo={openGroupInfo}
          onOpenSettings={openSettings}
          onStartNewChat={handleStartNewChat}
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
