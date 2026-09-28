const PREFIX = "chat-unread:";

export function loadUnreadStore(username) {
  if (!username) return { counts: {}, items: [] };
  try {
    const raw = localStorage.getItem(`${PREFIX}${username}`);
    if (!raw) return { counts: {}, items: [] };
    const parsed = JSON.parse(raw);
    return {
      counts: parsed.counts && typeof parsed.counts === "object" ? parsed.counts : {},
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return { counts: {}, items: [] };
  }
}

export function saveUnreadStore(username, counts, items) {
  if (!username) return;
  try {
    localStorage.setItem(
      `${PREFIX}${username}`,
      JSON.stringify({ counts, items }),
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
