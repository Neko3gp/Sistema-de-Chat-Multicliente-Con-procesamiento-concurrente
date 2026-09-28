import { useEffect, useState } from "react";
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
  disconnectSocket,
} from "./services/socket";
import {
  initialDemoState,
  contactProfiles as mockContactProfiles,
  groups as mockGroups,
} from "./data/conversations";
import { fileToBase64 } from "./utils/files";
import "./App.css";

// TODO: poner en false cuando el backend esté listo
// true = tras login usa datos demo (sin WebSocket)
const SKIP_AUTH = true;
const DEMO_ACCOUNTS_KEY = "chat-demo-accounts";

function loadDemoAccounts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DEMO_ACCOUNTS_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveDemoAccounts(accounts) {
  localStorage.setItem(DEMO_ACCOUNTS_KEY, JSON.stringify(accounts));
}

function resolveDemoAccount(identifier) {
  const q = identifier.trim().toLowerCase();
  if (!q) return null;

  if (
    q === initialDemoState.username.toLowerCase() ||
    q === initialDemoState.email.toLowerCase()
  ) {
    return {
      username: initialDemoState.username,
      email: initialDemoState.email,
      password: initialDemoState.password,
      description: initialDemoState.description,
      avatarUrl: initialDemoState.avatarUrl,
    };
  }

  const accounts = loadDemoAccounts();
  for (const [username, account] of Object.entries(accounts)) {
    if (
      username.toLowerCase() === q ||
      account.email?.toLowerCase() === q
    ) {
      return {
        username,
        email: account.email || "",
        password: account.password || "",
        description: account.description || "",
        avatarUrl: account.avatarUrl || "",
      };
    }
  }

  return null;
}

export default function App() {
  const [view, setView] = useState("login");
  const [returnView, setReturnView] = useState("home");
  const [viewedGroup, setViewedGroup] = useState(null);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("chat-theme") || "dark",
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
  const [groupsData, setGroupsData] = useState(mockGroups);
  const [contacts, setContacts] = useState(mockContactProfiles);
  const [chatUsers, setChatUsers] = useState(() =>
    Object.keys(mockContactProfiles),
  );
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const generalGroup = groupsData.general;

  const inApp =
    view === "home" ||
    view === "settings" ||
    view === "profile" ||
    view === "group";

  function openOwnProfile(from = "home") {
    setViewedContact(null);
    setReturnView(from);
    setView("profile");
  }

  function openSettings() {
    setView("settings");
  }

  function handleThemeChange(nextTheme) {
    setTheme(nextTheme);
    localStorage.setItem("chat-theme", nextTheme);
  }

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

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
    return null;
  }

  function handleStartNewChat(query) {
    const raw = query.trim();
    const q = raw.toLowerCase();

    if (!q) {
      return { error: "Escribe un nombre de usuario o correo" };
    }

    if (q === username.toLowerCase() || q === email.toLowerCase()) {
      return { error: "No puedes enviarte un mensaje a ti mismo" };
    }

    let contactName = findContactByQuery(raw);

    if (!contactName) {
      const isEmail = raw.includes("@");
      contactName = isEmail
        ? raw.split("@")[0].replace(/[^\w.-]/g, "") || "Usuario"
        : raw;

      // Evitar colisión de mayúsculas con un contacto existente
      const existing = findContactByQuery(contactName);
      if (existing) {
        contactName = existing;
      } else {
        setContacts((prev) => ({
          ...prev,
          [contactName]: {
            username: contactName,
            email: isEmail ? raw : `${contactName.toLowerCase()}@chat.com`,
            description: "",
            avatarUrl: "",
            lastSeen: new Date(Date.now() - 1000 * 60 * 30),
          },
        }));
      }
    }

    setChatUsers((prev) =>
      prev.includes(contactName) ? prev : [...prev, contactName],
    );

    return { username: contactName };
  }

  function openContactProfile(contactName, from = "home") {
    if (!contactName) return;
    const base = contacts[contactName] || {
      username: contactName,
      email: `${contactName.toLowerCase()}@chat.com`,
      description: "",
      avatarUrl: "",
      lastSeen: new Date(Date.now() - 1000 * 60 * 20),
    };
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

  function handleServerMessage(message) {
    switch (message.type) {
      case "login_result":
        if (message.ok) {
          setError("");
          setView("home");
        } else {
          setError(message.reason || "No se pudo iniciar sesión");
        }
        break;
      case "register_result":
        if (message.ok) {
          setError("");
          setSuccess("Cuenta creada. Ahora inicia sesión.");
          setView("login");
        } else {
          setError(message.reason || "No se pudo registrar");
        }
        break;
      case "user_list":
        setUsers(message.users || []);
        break;
      case "broadcast":
      case "private_message":
      case "file":
        setMessages((prev) => [...prev, message]);
        break;
      case "error":
        setError(message.reason || "Error del servidor");
        break;
      default:
        break;
    }
  }

  function handleLogin(identifier, pass) {
    setError("");
    setSuccess("");

    if (SKIP_AUTH) {
      const account = resolveDemoAccount(identifier);
      if (!account) {
        setError("Usuario o correo no encontrado");
        return;
      }
      if (account.password && pass !== account.password) {
        setError("Contraseña incorrecta");
        return;
      }

      setUsername(account.username);
      setEmail(account.email);
      setPassword(pass || account.password);
      setDescription(account.description || initialDemoState.description);
      setAvatarUrl(account.avatarUrl || initialDemoState.avatarUrl);
      setUsers(initialDemoState.users);
      setMessages(initialDemoState.messages);
      setContacts(mockContactProfiles);
      setChatUsers(Object.keys(mockContactProfiles));
      setView("home");
      return;
    }

    // Backend actual autentica por username; si es correo, se resuelve en local si existe
    const account = resolveDemoAccount(identifier);
    const user = account?.username || identifier.trim();
    setUsername(user);
    setPassword(pass || "");
    if (account?.email) setEmail(account.email);
    connectSocket(user, pass, handleServerMessage);
  }

  function handleRegister(user, mail, pass) {
    setError("");
    setSuccess("");

    const username = user.trim();
    const emailValue = mail.trim().toLowerCase();

    if (!username || !emailValue || !pass) {
      setError("Completa usuario, correo y contraseña");
      return;
    }

    if (SKIP_AUTH) {
      const accounts = loadDemoAccounts();
      const takenUser = Object.keys(accounts).some(
        (name) => name.toLowerCase() === username.toLowerCase(),
      );
      const takenEmail = Object.values(accounts).some(
        (account) => account.email?.toLowerCase() === emailValue,
      );

      if (
        takenUser ||
        username.toLowerCase() === initialDemoState.username.toLowerCase()
      ) {
        setError("Ese nombre de usuario ya está en uso");
        return;
      }
      if (
        takenEmail ||
        emailValue === initialDemoState.email.toLowerCase()
      ) {
        setError("Ese correo ya está registrado");
        return;
      }

      accounts[username] = {
        email: emailValue,
        password: pass,
        description: "",
        avatarUrl: "",
      };
      saveDemoAccounts(accounts);
      setSuccess("Cuenta creada. Ahora inicia sesión.");
      setView("login");
      return;
    }

    // El protocolo del backend solo envía username + password por ahora
    setEmail(emailValue);
    registerUser(username, pass, handleServerMessage);
  }

  function handleSend(text) {
    if (SKIP_AUTH) {
      setMessages((prev) => [
        ...prev,
        selectedUser
          ? {
              type: "private_message",
              from: username,
              to: selectedUser,
              message: text,
              at: new Date(),
            }
          : { type: "broadcast", from: username, message: text, at: new Date() },
      ]);
      return;
    }

    if (selectedUser) {
      sendPrivateMessage(selectedUser, text);
      setMessages((prev) => [
        ...prev,
        {
          type: "private_message",
          from: username,
          to: selectedUser,
          message: text,
          at: new Date(),
        },
      ]);
    } else {
      sendBroadcast(text);
    }
  }

  async function handleSendFile(file) {
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

    if (!SKIP_AUTH) {
      sendFile(selectedUser || null, file.name, data);
    }

    setMessages((prev) => [...prev, payload]);
  }

  function handleSaveProfile(nextProfile) {
    setUsername(nextProfile.username);
    setEmail(nextProfile.email);
    setPassword(nextProfile.password);
    setDescription(nextProfile.description);
    setAvatarUrl(nextProfile.avatarUrl);
  }

  function handleLogout() {
    if (!SKIP_AUTH) {
      disconnectSocket();
    }
    setView("login");
    setUsername("");
    setEmail("");
    setPassword("");
    setDescription("");
    setAvatarUrl("");
    setUsers([]);
    setMessages([]);
    setSelectedUser(null);
    setViewedContact(null);
    setViewedGroup(null);
    setGroupsData(mockGroups);
    setContacts(mockContactProfiles);
    setChatUsers(Object.keys(mockContactProfiles));
    setError("");
    setSuccess("");
  }

  if (inApp) {
    const isContact = Boolean(viewedContact);

    return (
      <div className="app-shell">
        <Home
          username={username}
          avatarUrl={avatarUrl}
          users={users}
          messages={messages}
          selectedUser={selectedUser}
          groupName={generalGroup?.name || "Sala general"}
          groupAvatarUrl={generalGroup?.avatarUrl || ""}
          chatUsers={chatUsers}
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
                theme={theme}
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
