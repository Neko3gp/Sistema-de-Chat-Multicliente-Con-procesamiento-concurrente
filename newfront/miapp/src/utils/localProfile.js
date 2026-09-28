const PROFILE_KEY = "chat-local-profiles";

function readAll() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function loadLocalProfile(username) {
  if (!username) return null;
  const all = readAll();
  const entry = all[username];
  if (!entry || typeof entry !== "object") return null;
  return {
    email: typeof entry.email === "string" ? entry.email : "",
    description: typeof entry.description === "string" ? entry.description : "",
    avatarUrl: typeof entry.avatarUrl === "string" ? entry.avatarUrl : "",
  };
}

export function saveLocalProfile(username, profile) {
  if (!username) return;
  const all = readAll();
  all[username] = {
    email: profile.email || "",
    description: profile.description || "",
    avatarUrl: profile.avatarUrl || "",
  };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(all));
}
