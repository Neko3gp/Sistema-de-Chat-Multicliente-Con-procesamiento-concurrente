/**
 * Despacha cada mensaje JSON entrante del servidor hacia el estado de la UI.
 * Recibe un contexto (setters/refs/helpers) y devuelve el handler del switch.
 */
import {
  requestAdminUsers,
  requestAdminGroups,
} from "./socket.js";
import { mapServerReason } from "../common/lib/serverErrors";
import { stubContact, hydrateHistory } from "../chat/lib/history";
import { loadLocalChats } from "../chat/lib/localChats";
import { loadLocalProfile, saveLocalProfile } from "../auth/lib/localProfile";
import {
  chatKey,
  createMessageId,
} from "../chat/lib/messageKeys";
import {
  clearSession,
  loadSession,
  refreshSession,
  saveSession,
} from "../common/lib/session";
import { loadUnreadStore } from "../chat/lib/unreadStore";

export function createServerMessageHandler(ctx) {
  return function handleServerMessage(message) {
    switch (message.type) {
      case "login_result":
        if (message.ok) {
          if (message.role === "admin") {
            ctx.roleRef.current = "admin";
            ctx.authenticatedRef.current = true;
            clearSession();
            ctx.clearReconnectTimer();
            ctx.setError("");
            ctx.setSuccess("");
            ctx.setAuthenticated(true);
            ctx.setReconnecting(false);
            ctx.setView("monitor");
            requestAdminUsers();
            requestAdminGroups();
            return;
          }

          ctx.roleRef.current = "user";
          const wasAuthenticated = ctx.authenticatedRef.current;
          const local = loadLocalProfile(ctx.usernameRef.current) || {};
          const canonicalUsername =
            typeof message.username === "string" && message.username.trim()
              ? message.username.trim()
              : ctx.usernameRef.current;
          if (canonicalUsername !== ctx.usernameRef.current) {
            ctx.usernameRef.current = canonicalUsername;
            ctx.setUsername(canonicalUsername);
          }
          const nextDescription =
            typeof message.description === "string"
              ? message.description
              : local.description || "";
          const nextAvatar =
            typeof message.avatarUrl === "string"
              ? message.avatarUrl
              : local.avatarUrl || "";
          const nextEmail =
            typeof message.email === "string" && message.email
              ? message.email
              : local.email || "";

          saveSession({
            username: canonicalUsername,
            password: ctx.passwordRef.current,
          });
          ctx.setEmail(nextEmail);
          ctx.setDescription(nextDescription);
          ctx.setAvatarUrl(nextAvatar);
          saveLocalProfile(canonicalUsername, {
            email: nextEmail,
            description: nextDescription,
            avatarUrl: nextAvatar,
          });
          ctx.setError("");
          ctx.setSuccess("");
          ctx.setReconnecting(false);
          ctx.setAuthenticated(true);
          ctx.setView("home");

          if (!wasAuthenticated) {
            const saved = loadLocalChats(ctx.usernameRef.current);
            const unread = loadUnreadStore(ctx.usernameRef.current);
            ctx.setMessages([]);
            ctx.setUsers([]);
            ctx.setChatUsers(saved.chatUsers);
            ctx.setContacts(saved.contacts);
            ctx.setCustomGroups(saved.customGroups || []);
            ctx.setDirectoryUsers([]);
            ctx.setUnreadCounts(unread.counts);
            ctx.setNotifications(unread.items);
            ctx.setLastReadAt(unread.lastReadAt || {});
            ctx.lastReadAtRef.current = unread.lastReadAt || {};
            ctx.setSelectedGroupId(null);
            ctx.setIsViewingChat(false);
            ctx.setGroupsData({
              general: {
                ...ctx.EMPTY_GROUPS.general,
                admin: ctx.usernameRef.current,
                members: [],
              },
            });
          }
        } else {
          ctx.clearReconnectTimer();
          ctx.roleRef.current = null;
          ctx.authenticatedRef.current = false;
          ctx.dispatchMonitor({ type: "reset" });
          ctx.setReconnecting(false);
          clearSession();
          ctx.setError(mapServerReason(message.reason || "invalid_credentials"));
          ctx.setAuthenticated(false);
          ctx.setView("login");
        }
        break;
      case "monitor_snapshot":
      case "monitor_event":
      case "monitor_stats":
        if (ctx.roleRef.current === "admin") {
          ctx.dispatchMonitor({ ...message, receivedAt: Date.now() });
        }
        break;
      case "admin_users":
        ctx.setAdminUsers(Array.isArray(message.users) ? message.users : []);
        break;
      case "admin_groups":
        ctx.setAdminGroups(Array.isArray(message.groups) ? message.groups : []);
        break;
      case "admin_result":
        if (message.ok) {
          ctx.setError("");
          requestAdminUsers();
          requestAdminGroups();
        } else {
          ctx.setError(mapServerReason(message.reason || "invalid_message"));
        }
        break;
      case "register_result":
        if (message.ok) {
          ctx.setError("");
          ctx.setSuccess("Cuenta creada. Ahora inicia sesión.");
          if (ctx.usernameRef.current) {
            saveLocalProfile(ctx.usernameRef.current, {
              email: ctx.email,
              description: "",
              avatarUrl: "",
            });
          }
          ctx.setView("login");
        } else {
          ctx.setError(mapServerReason(message.reason || "username_taken"));
        }
        break;
      case "profile_result":
        if (message.ok) {
          const nextDescription = message.description || "";
          const nextAvatar = message.avatarUrl || "";
          const nextEmail =
            typeof message.email === "string" ? message.email : ctx.email;
          ctx.setEmail(nextEmail);
          ctx.setDescription(nextDescription);
          ctx.setAvatarUrl(nextAvatar);
          saveLocalProfile(ctx.usernameRef.current, {
            email: nextEmail,
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
        ctx.setUsers(nextUsers);
        ctx.setGroupsData((prev) => ({
          ...prev,
          general: {
            ...prev.general,
            members: nextUsers,
          },
        }));
        ctx.setContacts((prev) => {
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
              email:
                typeof remote.email === "string"
                  ? remote.email
                  : base.email || "",
            };
          }
          return next;
        });
        ctx.setChatUsers((prev) => {
          const merged = new Set(prev);
          for (const name of nextUsers) {
            if (name !== ctx.usernameRef.current) merged.add(name);
          }
          return Array.from(merged);
        });
        // Si el destinatario vuelve a conectarse, ✓ → ✓✓ (entregado, aún no visto).
        ctx.setMessages((prev) =>
          prev.map((item) => {
            if (item.from !== ctx.usernameRef.current) return item;
            if (item.status !== "sent") return item;
            if (
              (item.type === "private_message" || item.type === "file") &&
              item.to &&
              nextUsers.includes(item.to)
            ) {
              return { ...item, status: "delivered" };
            }
            return item;
          }),
        );
        refreshSession();
        break;
      }
      case "directory": {
        const list = Array.isArray(message.users) ? message.users : [];
        const normalized = list
          .filter((user) => user && typeof user.username === "string")
          .map((user) => ({
            username: user.username,
            avatarUrl: typeof user.avatarUrl === "string" ? user.avatarUrl : "",
            description:
              typeof user.description === "string" ? user.description : "",
            email: typeof user.email === "string" ? user.email : "",
          }));
        ctx.setDirectoryUsers(normalized);
        // El directorio es la fuente de verdad: limpia fotos viejas en caché.
        ctx.setContacts((prev) => {
          const next = { ...prev };
          for (const user of normalized) {
            const base = next[user.username] || stubContact(user.username);
            next[user.username] = {
              ...base,
              username: user.username,
              avatarUrl: user.avatarUrl,
              description: user.description || base.description || "",
              email: user.email || base.email || "",
            };
          }
          return next;
        });
        ctx.setDirectoryLoading(false);
        ctx.setAdminUsers([]);
        ctx.setAdminGroups([]);
        refreshSession();
        break;
      }
      case "history": {
        const restored = hydrateHistory(message.messages, ctx.usernameRef.current);
        ctx.setMessages(restored.messages);
        ctx.setChatUsers((prev) => Array.from(new Set([...prev, ...restored.chatUsers])));
        ctx.setContacts((prev) => {
          const next = { ...prev };
          for (const [name, profile] of Object.entries(restored.contacts)) {
            next[name] = next[name] || profile;
          }
          return next;
        });
        for (const restoredMessage of restored.messages) {
          if (
            restoredMessage.type === "group_message" ||
            restoredMessage.type === "group_notice" ||
            (restoredMessage.type === "file" && restoredMessage.groupId)
          ) {
            ctx.ensureCustomGroupFromMessage(restoredMessage);
          }
        }
        // Mensajes llegados offline → mismos avisos que estando en línea sin abrir el chat.
        ctx.applyUnreadFromHistory(restored.messages);
        break;
      }
      case "group_list":
        for (const group of message.groups || []) {
          ctx.upsertCustomGroup(group, { replaceMembers: true });
        }
        break;
      case "group_added":
        ctx.notifyGroupAdded(message.group, message.message || undefined);
        break;
      case "group_updated":
        ctx.upsertCustomGroup(message.group, { replaceMembers: true });
        break;
      case "group_removed": {
        const removedId = message.group?.id;
        ctx.setCustomGroups((prev) => prev.filter((group) => group.id !== removedId));
        if (ctx.selectedGroupIdRef.current === removedId) {
          ctx.setSelectedGroupId(null);
          ctx.setView("home");
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
        ctx.setUnreadCounts((prev) => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
        ctx.setNotifications((prev) => [notification, ...prev].slice(0, 40));
        ctx.showIncomingToast({
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
        ctx.setCustomGroups((prev) => prev.filter((group) => group.id !== message.group?.id));
        break;
      case "username_changed": {
        const nextUsername = message.username;
        if (!nextUsername) break;
        const previousUsername = ctx.usernameRef.current;
        ctx.usernameRef.current = nextUsername;
        ctx.setUsername(nextUsername);
        saveSession({ username: nextUsername, password: ctx.passwordRef.current });
        ctx.setChatUsers((prev) => prev.map((name) => name === previousUsername ? nextUsername : name));
        ctx.setMessages((prev) => prev.map((item) => ({
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
      case "group_notice":
        if (
          message.type === "group_message" ||
          message.type === "group_notice" ||
          (message.type === "file" && message.groupId)
        ) {
          ctx.ensureCustomGroupFromMessage(message);
        }
        if (message.from && message.from !== ctx.usernameRef.current) {
          ctx.ensureContact(message.from);
          const isGroupScoped =
            message.type === "group_message" ||
            message.type === "group_notice" ||
            (message.type === "file" && message.groupId);
          if (!isGroupScoped) {
            ctx.setChatUsers((prev) =>
              prev.includes(message.from) ? prev : [...prev, message.from],
            );
          }
          const viewingGroup =
            message.type === "group_notice" &&
            ctx.selectedGroupIdRef.current === message.groupId;
          if (message.type !== "group_notice" || !viewingGroup) {
            ctx.pushIncomingUnread(message);
          }
          if (message.type !== "group_notice") {
            ctx.applyRemoteTyping({
              from: message.from,
              isTyping: false,
              groupId:
                message.type === "group_message" ||
                (message.type === "file" && message.groupId)
                  ? message.groupId
                  : null,
              chat:
                message.type === "broadcast" ||
                (message.type === "file" && !message.to && !message.groupId)
                  ? null
                  : message.from,
            });
          }
        }
        ctx.setMessages((prev) => [
          ...prev,
          {
            ...message,
            id: message.id || createMessageId(),
            at: new Date(),
            status:
              message.type === "group_notice"
                ? undefined
                : message.from === ctx.usernameRef.current
                  ? "delivered"
                  : undefined,
          },
        ]);
        refreshSession();
        break;
      case "read_receipt": {
        const reader = message.from;
        const me = ctx.usernameRef.current;
        if (!reader || reader === me) break;
        ctx.setMessages((prev) =>
          prev.map((item) => {
            if (item.from !== me) return item;
            if (item.status === "seen") return item;
            if (message.chat == null) {
              if (
                item.type === "broadcast" ||
                (item.type === "file" && !item.to && !item.groupId)
              ) {
                return { ...item, status: "seen" };
              }
              return item;
            }
            if (
              (item.type === "private_message" ||
                (item.type === "file" && !item.groupId)) &&
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
      case "typing":
        ctx.applyRemoteTyping(message);
        break;
      case "connection_closed":
        if (ctx.intentionalCloseRef.current) {
          ctx.intentionalCloseRef.current = false;
          break;
        }
        if (ctx.authenticatedRef.current && (ctx.roleRef.current === "admin" || loadSession())) {
          ctx.scheduleReconnect();
        } else if (ctx.authenticatedRef.current) {
          ctx.resetSession(mapServerReason("connection_closed"));
        }
        break;
      case "error":
        if (
          (message.reason === "connection_failed" ||
            message.reason === "already_connected") &&
          ctx.authenticatedRef.current &&
          (ctx.roleRef.current === "admin" || loadSession())
        ) {
          ctx.scheduleReconnect(message.reason === "already_connected" ? 2500 : 1500);
          break;
        }
        ctx.setError(mapServerReason(message.reason));
        break;
      default:
        break;
    }
  };
}
