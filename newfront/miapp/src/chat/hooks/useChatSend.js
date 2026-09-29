/**
 * Envío de texto, archivos e indicador de escritura por WebSocket.
 */
import {
  isSocketOpen,
  sendTyping,
  sendGroupMessage,
  sendPrivateMessage,
  sendBroadcast,
  sendFile,
} from "../../websockets";
import {
  createMessageId,
  outgoingPrivateStatus,
  outgoingSharedStatus,
} from "../lib/messageKeys";
import { fileToBase64 } from "../../files/lib/files";

export function createChatSendHelpers(ctx) {
  const {
    username,
    selectedUser,
    selectedGroupId,
    users,
    customGroups,
    customGroupsRef,
    setMessages,
  } = ctx;

  function handleTyping(isTyping) {
    if (!isSocketOpen()) return;
    if (selectedGroupId) {
      const group =
        customGroupsRef.current.find((item) => item.id === selectedGroupId) ||
        customGroups.find((item) => item.id === selectedGroupId);
      sendTyping({
        isTyping,
        groupId: selectedGroupId,
        members: group?.members || [],
      });
      return;
    }
    if (selectedUser) {
      sendTyping({ isTyping, chat: selectedUser });
      return;
    }
    sendTyping({ isTyping, chat: null });
  }

  function handleSend(text) {
    const id = createMessageId();
    const open = isSocketOpen();
    const activeGroup = selectedGroupId
      ? customGroupsRef.current.find((group) => group.id === selectedGroupId) ||
        customGroups.find((group) => group.id === selectedGroupId)
      : null;

    let payload;
    if (activeGroup) {
      const members = activeGroup.members || [];
      payload = {
        id,
        type: "group_message",
        from: username,
        groupId: activeGroup.id,
        groupName: activeGroup.name,
        members,
        message: text,
        at: new Date(),
        status: outgoingSharedStatus(open),
      };
      if (open) {
        sendGroupMessage({
          groupId: activeGroup.id,
          groupName: activeGroup.name,
          members,
          message: text,
          id,
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
        status: outgoingPrivateStatus(open, users.includes(selectedUser)),
      };
      if (open) sendPrivateMessage(selectedUser, text, id);
    } else {
      payload = {
        id,
        type: "broadcast",
        from: username,
        message: text,
        at: new Date(),
        status: outgoingSharedStatus(open),
      };
      if (open) sendBroadcast(text, id);
    }

    setMessages((prev) => [...prev, payload]);
  }

  async function handleSendFile(file) {
    if (!isSocketOpen()) throw new Error("connection_closed");
    const data = await fileToBase64(file);
    if (!isSocketOpen()) throw new Error("connection_closed");
    const id = createMessageId();
    const open = isSocketOpen();
    const activeGroup = selectedGroupId
      ? customGroupsRef.current.find((group) => group.id === selectedGroupId) ||
        customGroups.find((group) => group.id === selectedGroupId)
      : null;

    let payload;
    if (activeGroup) {
      const members = activeGroup.members || [];
      payload = {
        id,
        type: "file",
        from: username,
        groupId: activeGroup.id,
        groupName: activeGroup.name,
        members,
        filename: file.name,
        mimeType: file.type || undefined,
        data,
        at: new Date(),
        status: outgoingSharedStatus(open),
      };
      if (open) {
        sendFile(null, file.name, data, file.type || "", {
          groupId: activeGroup.id,
          groupName: activeGroup.name,
          members,
        }, id);
      }
    } else {
      const recipientOnline = selectedUser ? users.includes(selectedUser) : true;
      payload = {
        id,
        type: "file",
        from: username,
        to: selectedUser || null,
        filename: file.name,
        mimeType: file.type || undefined,
        data,
        at: new Date(),
        status: selectedUser
          ? outgoingPrivateStatus(open, recipientOnline)
          : outgoingSharedStatus(open),
      };
      if (open) {
        sendFile(selectedUser || null, file.name, data, file.type || "", null, id);
      }
    }

    setMessages((prev) => [...prev, payload]);
  }

  return { handleSend, handleSendFile, handleTyping };
}
