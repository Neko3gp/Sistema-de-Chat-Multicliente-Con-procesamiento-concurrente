const THEME_KEY = "chat-theme";
const MANUAL_THEMES = ["light", "dark", "uach-light", "uach-dark"];
const RESOLVED_THEMES = ["light", "dark", "uach-light", "uach-dark"];

export function getSystemTheme() {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function loadThemePreference() {
  const saved = localStorage.getItem(THEME_KEY);
  if (!saved || saved === "system") return "system";
  if (saved === "uach") {
    return getSystemTheme() === "light" ? "uach-light" : "uach-dark";
  }
  if (saved === "midnight") return "system";
  if (MANUAL_THEMES.includes(saved)) return saved;
  return "system";
}

export function resolveTheme(preference) {
  if (preference === "system") return getSystemTheme();
  return MANUAL_THEMES.includes(preference) ? preference : getSystemTheme();
}

export function saveThemePreference(preference) {
  localStorage.setItem(THEME_KEY, preference);
}

export function applyTheme(theme) {
  const resolved = RESOLVED_THEMES.includes(theme) ? theme : "dark";
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.style.colorScheme =
    resolved === "light" || resolved === "uach-light" ? "light" : "dark";
}

export function followsSystem(preference) {
  return preference === "system";
}
