/**
 * Login, registro, logout, reconexión y guardado de perfil.
 */
import {
  connectSocket,
  registerUser,
  disconnectSocket,
  sendUpdateProfile,
} from "../../websockets";
import { loadSession, clearSession } from "../../common/lib/session";
import { saveLocalProfile } from "../lib/localProfile";

export function createAuthHelpers(ctx) {
  const {
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
  } = ctx;

  function clearReconnectTimer() {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
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
    setLastReadAt({});
    lastReadAtRef.current = {};
    setTypingByChat({});
    setIncomingToast(null);
    setIsViewingChat(false);
    setSuccess("");
    setError(keepAuthError);
  }

  function scheduleReconnect(delayMs = 900) {
    clearReconnectTimer();
    setReconnecting(true);
    setError("Reconectando…");
    reconnectTimerRef.current = setTimeout(() => {
      const session =
        roleRef.current === "admin"
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

  function handleLogin(user, pass) {
    setError("");
    setSuccess("");
    setReconnecting(false);
    clearReconnectTimer();

    const trimmed = user.trim();
    if (!trimmed || !pass) {
      setError("Completa usuario/correo y contraseña");
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

  function handleLogout() {
    intentionalCloseRef.current = true;
    clearReconnectTimer();
    disconnectSocket({ silent: true });
    resetSession("");
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
      email: nextEmail,
    });
  }

  return {
    clearReconnectTimer,
    scheduleReconnect,
    resetSession,
    handleLogin,
    handleRegister,
    handleLogout,
    handleSaveProfile,
  };
}
