export const EVENT_LIMIT = 200;
export const SAMPLE_LIMIT = 60;

export const initialMonitorState = {
  ready: false,
  stats: null,
  users: [],
  log: [],
  events: [],
  samples: [],
  lastUpdated: null,
  nextEventId: 0,
};

export function monitorReducer(state, message) {
  switch (message.type) {
    case "reset":
      return initialMonitorState;
    case "monitor_snapshot":
      // Un nuevo snapshot sustituye el estado anterior, también al reconectar.
      return {
        ...initialMonitorState,
        ready: true,
        stats: message.stats,
        users: message.users || [],
        log: (message.log || []).slice(-EVENT_LIMIT),
        samples: [{ ...message.stats, at: message.receivedAt }],
        lastUpdated: message.receivedAt,
      };
    case "monitor_stats":
      return {
        ...state,
        stats: message,
        users: Array.isArray(message.users) ? message.users : state.users,
        samples: [...state.samples, { ...message, at: message.receivedAt }].slice(-SAMPLE_LIMIT),
        lastUpdated: message.receivedAt,
      };
    case "monitor_event":
      return {
        ...state,
        events: [...state.events, { ...message, id: state.nextEventId }].slice(-EVENT_LIMIT),
        nextEventId: state.nextEventId + 1,
      };
    default:
      return state;
  }
}

export const eventLabels = {
  connect: "Conexión",
  disconnect: "Desconexión",
  login_failed: "Login rechazado",
  message: "Mensaje recibido",
  broadcast: "Difusión",
  file: "Archivo",
  error: "Error",
};

export function formatTime(value) {
  if (value === null || value === undefined) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString("es-MX", { hour12: false });
}

export function formatNumber(value, decimals = 0) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("es-MX", { maximumFractionDigits: decimals })
    : "—";
}

export function formatBytes(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value < 1024) return `${formatNumber(value)} B`;
  if (value < 1024 * 1024) return `${formatNumber(value / 1024, 1)} KiB`;
  return `${formatNumber(value / (1024 * 1024), 1)} MiB`;
}
