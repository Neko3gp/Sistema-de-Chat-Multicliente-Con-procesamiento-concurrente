/**
 * Lógica de no leídos, toasts entrantes y "está escribiendo".
 * Factory que recibe refs/setters y devuelve helpers para App.
 */
import { previewFromMessage } from "../lib/messagePreview";
import { sendReadReceipt, isSocketOpen } from "../../websockets";
import {
  chatKey,
  createMessageId,
  groupKeyFromChatKey,
  messageChatKey,
  truncateText,
} from "../lib/messageKeys";

export function createUnreadHelpers(ctx) {
  const {
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
  } = ctx;

  function markChatRead(user = null, groupId = null) {
    const key = chatKey(user, groupId);
    if (!unreadCounts[key]) return;
    const readAt = new Date().toISOString();
    setLastReadAt((prev) => {
      const next = { ...prev, [key]: readAt };
      lastReadAtRef.current = next;
      return next;
    });
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

  function handleMarkAllNotificationsRead() {
    const now = new Date().toISOString();
    setLastReadAt((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(unreadCounts)) {
        next[key] = now;
      }
      lastReadAtRef.current = next;
      return next;
    });
    setUnreadCounts({});
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
  }

  function showIncomingToast(toast) {
    setIncomingToast(toast);
  }

  function applyUnreadFromHistory(messages) {
    const me = usernameRef.current;
    const list = Array.isArray(messages) ? messages : [];
    if (!me || list.length === 0) return;

    const viewingKey =
      isViewingChatRef.current
        ? chatKey(selectedUserRef.current, selectedGroupIdRef.current)
        : null;
    const lastRead = lastReadAtRef.current || {};

    const byChat = {};
    for (const message of list) {
      if (!message?.from || message.from === me) continue;
      const key = messageChatKey(message, me);
      if (!byChat[key]) byChat[key] = [];
      byChat[key].push(message);
    }

    const nextCounts = {};
    const notifItems = [];
    let newestToast = null;

    for (const [key, chatMessages] of Object.entries(byChat)) {
      if (key === viewingKey) continue;

      const sorted = [...chatMessages].sort(
        (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
      );

      let thresholdMs = null;
      if (lastRead[key]) {
        const parsed = new Date(lastRead[key]).getTime();
        if (!Number.isNaN(parsed)) thresholdMs = parsed;
      }
      if (thresholdMs == null) {
        const ownTimes = list
          .filter(
            (message) =>
              message.from === me && messageChatKey(message, me) === key,
          )
          .map((message) => new Date(message.at).getTime())
          .filter((value) => !Number.isNaN(value));
        if (ownTimes.length) thresholdMs = Math.max(...ownTimes);
      }

      const unreadMessages =
        thresholdMs == null
          ? sorted
          : sorted.filter(
              (message) => new Date(message.at).getTime() > thresholdMs,
            );

      if (unreadMessages.length === 0) continue;

      nextCounts[key] = unreadMessages.length;
      const newest = unreadMessages[unreadMessages.length - 1];
      const groupId = groupKeyFromChatKey(key);
      const label = groupId
        ? newest.groupName ||
          customGroupsRef.current.find((group) => group.id === groupId)?.name ||
          "Grupo"
        : key === "__broadcast__"
          ? groupNameRef.current
          : newest.from;
      const rawPreview = previewFromMessage(newest);
      const preview =
        key === "__broadcast__" || groupId
          ? truncateText(`${newest.from}: ${rawPreview}`, 72)
          : truncateText(rawPreview, 72);
      const toastId = createMessageId();
      const item = {
        id: toastId,
        chatKey: key,
        chatLabel: label,
        from: newest.from,
        preview,
        at: newest.at ? new Date(newest.at) : new Date(),
        read: false,
      };
      notifItems.push(item);

      if (
        !newestToast ||
        new Date(item.at).getTime() > new Date(newestToast.at).getTime()
      ) {
        newestToast = {
          id: toastId,
          chatKey: key,
          from: newest.from,
          chatLabel: label,
          avatarUrl: contactsRef.current[newest.from]?.avatarUrl || "",
          preview,
          context: key === "__broadcast__" ? groupNameRef.current : groupId ? label : null,
          at: item.at,
        };
      }
    }

    if (Object.keys(nextCounts).length === 0) return;

    setUnreadCounts((prev) => ({ ...prev, ...nextCounts }));
    setNotifications((prev) => {
      const kept = prev.filter((item) => !nextCounts[item.chatKey]);
      return [...notifItems, ...kept].slice(0, 40);
    });
    if (newestToast) showIncomingToast(newestToast);
  }

  function applyRemoteTyping(message) {
    const from = message.from;
    if (!from || from === usernameRef.current) return;

    const key = message.groupId
      ? chatKey(null, message.groupId)
      : message.chat == null
        ? chatKey(null)
        : chatKey(from);

    const timerKey = `${key}:${from}`;
    if (typingTimersRef.current[timerKey]) {
      clearTimeout(typingTimersRef.current[timerKey]);
      delete typingTimersRef.current[timerKey];
    }

    setTypingByChat((prev) => {
      const names = new Set(prev[key]?.names || []);
      if (message.isTyping) names.add(from);
      else names.delete(from);
      if (names.size === 0) {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: { names: Array.from(names) } };
    });

    if (message.isTyping) {
      typingTimersRef.current[timerKey] = setTimeout(() => {
        setTypingByChat((prev) => {
          const names = new Set(prev[key]?.names || []);
          names.delete(from);
          if (names.size === 0) {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
          }
          return { ...prev, [key]: { names: Array.from(names) } };
        });
        delete typingTimersRef.current[timerKey];
      }, 3200);
    }
  }

  function dismissIncomingToast(id) {
    setIncomingToast((prev) => (prev && prev.id === id ? null : prev));
  }

  function notifyGroupAdded(group, text = "Se te agregó a este grupo") {
    upsertCustomGroup(group, { replaceMembers: true });
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
    showIncomingToast({
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
      const readAt = new Date().toISOString();
      lastReadAtRef.current = { ...lastReadAtRef.current, [key]: readAt };
      setLastReadAt((prev) => ({ ...prev, [key]: readAt }));
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
    showIncomingToast({
      id: toastId,
      chatKey: key,
      from: message.from,
      chatLabel: label,
      avatarUrl,
      preview,
      context: key === "__broadcast__" ? groupNameRef.current : null,
    });
  }

  return {
    markChatRead,
    handleMarkAllNotificationsRead,
    applyUnreadFromHistory,
    applyRemoteTyping,
    dismissIncomingToast,
    showIncomingToast,
    notifyGroupAdded,
    pushIncomingUnread,
  };
}
