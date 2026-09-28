const CHATS_KEY = "chat-local-chats";

function readAll() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHATS_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function loadLocalChats(owner) {
  if (!owner) {
    return { chatUsers: [], contacts: {} };
  }
  const entry = readAll()[owner];
  if (!entry || typeof entry !== "object") {
    return { chatUsers: [], contacts: {} };
  }

  const chatUsers = Array.isArray(entry.chatUsers)
    ? entry.chatUsers.filter((name) => typeof name === "string" && name && name !== owner)
    : [];

  const contacts = {};
  if (entry.contacts && typeof entry.contacts === "object") {
    for (const [name, profile] of Object.entries(entry.contacts)) {
      if (!name || name === owner || !profile || typeof profile !== "object") continue;
      contacts[name] = {
        username: name,
        email: typeof profile.email === "string" ? profile.email : "",
        description: typeof profile.description === "string" ? profile.description : "",
        avatarUrl: typeof profile.avatarUrl === "string" ? profile.avatarUrl : "",
        lastSeen: profile.lastSeen ? new Date(profile.lastSeen) : new Date(),
      };
    }
  }

  for (const name of chatUsers) {
    if (!contacts[name]) {
      contacts[name] = {
        username: name,
        email: "",
        description: "",
        avatarUrl: "",
        lastSeen: new Date(),
      };
    }
  }

  return { chatUsers, contacts };
}

export function saveLocalChats(owner, { chatUsers = [], contacts = {} } = {}) {
  if (!owner) return;
  const all = readAll();
  const names = Array.from(
    new Set(
      (chatUsers || []).filter(
        (name) => typeof name === "string" && name && name !== owner,
      ),
    ),
  );

  const compactContacts = {};
  for (const name of names) {
    const profile = contacts[name] || {};
    compactContacts[name] = {
      username: name,
      email: profile.email || "",
      description: profile.description || "",
      avatarUrl: profile.avatarUrl || "",
      lastSeen:
        profile.lastSeen instanceof Date
          ? profile.lastSeen.toISOString()
          : profile.lastSeen || null,
    };
  }

  all[owner] = { chatUsers: names, contacts: compactContacts };
  localStorage.setItem(CHATS_KEY, JSON.stringify(all));
}
