const SESSION_KEY = "chat-session";
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hora

export function saveSession({ username, password }) {
  if (!username || !password) return;
  const payload = {
    username,
    password,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed.username !== "string" ||
      typeof parsed.password !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      clearSession();
      return null;
    }
    if (Date.now() > parsed.expiresAt) {
      clearSession();
      return null;
    }
    return {
      username: parsed.username,
      password: parsed.password,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    clearSession();
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

/** Renueva la ventana de 1 hora mientras la sesión sigue activa. */
export function refreshSession() {
  const current = loadSession();
  if (!current) return null;
  saveSession(current);
  return loadSession();
}
