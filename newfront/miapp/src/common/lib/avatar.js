const NAME_COLORS = [
  "#53bdeb",
  "#e389b9",
  "#00a884",
  "#ffbc38",
  "#a5b4fc",
  "#f87171",
  "#34d399",
  "#f472b6",
  "#38bdf8",
  "#fbbf24",
  "#c084fc",
  "#fb923c",
];

export function getInitials(name) {
  return (name || "?")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function getNameColor(name) {
  const value = name || "?";
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = value.charCodeAt(i) + ((hash << 5) - hash);
  }
  return NAME_COLORS[Math.abs(hash) % NAME_COLORS.length];
}
