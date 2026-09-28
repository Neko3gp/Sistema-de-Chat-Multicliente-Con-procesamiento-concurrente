const PREFIX = "chat-unread:";

export function loadUnreadStore(username) {
  if (!username) return { counts: {}, items: [], lastReadAt: {} };
  try {
    const raw = localStorage.getItem(`${PREFIX}${username}`);
    if (!raw) return { counts: {}, items: [], lastReadAt: {} };
    const parsed = JSON.parse(raw);
    return {
      counts: parsed.counts && typeof parsed.counts === "object" ? parsed.counts : {},
      items: Array.isArray(parsed.items) ? parsed.items : [],
      lastReadAt:
        parsed.lastReadAt && typeof parsed.lastReadAt === "object"
          ? parsed.lastReadAt
          : {},
    };
  } catch {
    return { counts: {}, items: [], lastReadAt: {} };
  }
}

export function saveUnreadStore(username, counts, items, lastReadAt = {}) {
  if (!username) return;
  try {
    localStorage.setItem(
      `${PREFIX}${username}`,
      JSON.stringify({ counts, items, lastReadAt }),
    );
  } catch {
    // ignore quota errors
  }
}

export function clearUnreadStore(username) {
  if (!username) return;
  try {
    localStorage.removeItem(`${PREFIX}${username}`);
  } catch {
    // ignore
  }
}
