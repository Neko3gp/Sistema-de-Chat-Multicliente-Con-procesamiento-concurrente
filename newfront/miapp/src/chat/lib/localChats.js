const CHATS_KEY = "chat-local-chats";

function readAll() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHATS_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeGroup(group, owner) {
  if (!group || typeof group !== "object") return null;
  const id = typeof group.id === "string" ? group.id.trim() : "";
  const name = typeof group.name === "string" ? group.name.trim() : "";
  if (!id || !name) return null;
  const members = Array.isArray(group.members)
    ? Array.from(
        new Set(
          group.members.filter(
            (m) => typeof m === "string" && m.trim() && m !== owner,
          ),
        ),
      )
    : [];
  return {
    id,
    name,
    avatarUrl: typeof group.avatarUrl === "string" ? group.avatarUrl : "",
    description: typeof group.description === "string" ? group.description : "",
    admin: typeof group.admin === "string" ? group.admin : owner,
    members: owner ? Array.from(new Set([owner, ...members])) : members,
  };
}

export function loadLocalChats(owner) {
  if (!owner) {
    return { chatUsers: [], contacts: {}, customGroups: [] };
  }
  const entry = readAll()[owner];
  if (!entry || typeof entry !== "object") {
    return { chatUsers: [], contacts: {}, customGroups: [] };
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

  const customGroups = Array.isArray(entry.customGroups)
    ? entry.customGroups
        .map((group) => normalizeGroup(group, owner))
        .filter(Boolean)
    : [];

  return { chatUsers, contacts, customGroups };
}

export function saveLocalChats(
  owner,
  { chatUsers = [], contacts = {}, customGroups = [] } = {},
) {
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

  const groups = (customGroups || [])
    .map((group) => normalizeGroup(group, owner))
    .filter(Boolean);

  all[owner] = {
    chatUsers: names,
    contacts: compactContacts,
    customGroups: groups,
  };
  localStorage.setItem(CHATS_KEY, JSON.stringify(all));
}
