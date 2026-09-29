export const EVENT_LIMIT = 200;
export const SAMPLE_LIMIT = 60;
export const TRACE_LIMIT = 200;

export const initialMonitorState = {
  ready: false,
  stats: null,
  users: [],
  log: [],
  events: [],
  chatTraces: [],
  samples: [],
  lastUpdated: null,
  nextEventId: 0,
};

export function isChatTraceEvent(event) {
  return event?.event === "chat_trace";
}

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
    case "monitor_event": {
      const item = { ...message, id: state.nextEventId };
      if (isChatTraceEvent(message)) {
        return {
          ...state,
          chatTraces: [...state.chatTraces, item].slice(-TRACE_LIMIT),
          nextEventId: state.nextEventId + 1,
        };
      }
      return {
        ...state,
        events: [...state.events, item].slice(-EVENT_LIMIT),
        nextEventId: state.nextEventId + 1,
      };
    }
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
  processed: "Procesado en el worker",
  routed: "Distribución a grupo",
  message_sent: "Mensaje enviado",
  server_started: "Servidor iniciado",
  error: "Error",
  chat_trace: "Traza de chat",
};

export const chatTraceFilters = {
  all: "Todas las etapas",
  queued: "Sin recepción en vivo",
  delivered: "Entregado · sin lectura",
  delivered_on_reconnect: "Entregado al reconectar",
  read: "Lectura confirmada",
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

const chatTypes = new Set(["broadcast", "private_message", "group_message", "group_notice"]);
const operationNames = {
  login: "Inicio de sesión", register: "Registro de cuenta", ping: "Comprobación de conexión",
  profile_update: "Actualización de perfil", monitor_subscribe: "Suscripción al monitor",
  typing: "Indicador de escritura", read_receipt: "Confirmación de lectura",
};
const fileNames = { image: "Imagen", audio: "Audio", document: "Documento" };

const chatTraceStages = {
  queued: {
    category: "chat_queued",
    label: "Enviado · sin recepción",
    summary: "Destinatario desconectado; el mensaje quedó en historial hasta que inicie sesión.",
  },
  delivered: {
    category: "chat_delivered",
    label: "Entregado · sin lectura",
    summary: "Escritura al socket completada; el destinatario aún no confirma apertura del chat.",
  },
  delivered_on_reconnect: {
    category: "chat_delivered",
    label: "Entregado al reconectar",
    summary: "El destinatario inició sesión y recuperó el mensaje pendiente por historial.",
  },
  read: {
    category: "chat_read",
    label: "Lectura confirmada",
    summary: "El destinatario abrió la conversación y envió acuse de lectura.",
  },
};

export function describeChatTrace(event) {
  const d = event.detail || {};
  const stage = chatTraceStages[d.stage] || {
    category: "chat_trace",
    label: "Traza de chat",
    summary: "Cambio de estado del ciclo de mensaje.",
  };
  const scope = { group: "Grupo", private: "Privado", general: "Sala general" }[d.scope];
  const target = d.to || d.chat;
  return {
    ...stage,
    route: scope ? `${scope}${target ? ` → ${target}` : ""}` : (target ? `→ ${target}` : ""),
    messageId: d.message_id || null,
    reader: d.reader || null,
  };
}

export function describeEvent(event) {
  if (isChatTraceEvent(event)) {
    const view = describeChatTrace(event);
    return {
      category: view.category,
      label: view.label,
      summary: view.summary,
      route: view.route,
    };
  }
  const d = event.detail || {};
  const kind = d.message_type || d.kind;
  const stage = d.direction;
  let category = event.event;
  let label = eventLabels[category] || category;
  let summary = "";
  if (category === "connect") {
    label = d.phase === "login" ? "Sesión iniciada" : "Conexión TCP";
    summary = d.phase === "login" ? "Credenciales aceptadas; sesión vinculada a sus hilos." : "Socket aceptado; aún falta autenticar al usuario.";
  } else if (category === "server_started") {
    summary = `Servidor escuchando en ${d.host}:${d.port}; listo para aceptar conexiones.`;
  } else if (category === "processed") {
    summary = "Guardado en SQLite; el worker resuelve los destinatarios y sus colas de salida.";
  } else if (kind === "file" || category === "file") {
    const name = String(d.filename || "").toLowerCase();
    const fileKind = d.file_kind || (/\.(mp3|m4a|aac|wav|ogg|webm)$/.test(name) ? "audio" : /\.(png|jpe?g|gif|webp|svg|bmp)$/.test(name) ? "image" : "document");
    category = fileKind;
    label = `${fileNames[fileKind] || "Archivo"} · ${stage === "sent" ? "enviado" : stage === "received" ? "recibido" : "distribución"}`;
    summary = stage === "sent" ? "Escritura al socket completada." : stage === "received" ? "Archivo recibido por el servidor; pendiente de validación." : "Destinos seleccionados para distribución.";
  } else if (category === "message" && !chatTypes.has(kind)) {
    category = "request";
    label = operationNames[kind] || "Solicitud de control";
    summary = `Solicitud recibida${operationNames[kind] ? "." : `: ${kind || "desconocida"}.`}`;
  } else if (category === "message" || category === "message_sent") {
    label = category === "message_sent" ? "Mensaje enviado" : "Mensaje recibido";
    summary = category === "message_sent" ? "Escritura al socket completada; no confirma lectura del destinatario." : "Recibido por el servidor; pendiente de procesamiento.";
  } else if (category === "routed") {
    summary = `${d.delivered ?? 0} destinos conectados seleccionados; los escritores realizan el envío.`;
  } else if (category === "broadcast") {
    summary = `${d.recipients ?? 0} destinos seleccionados para la sala general.`;
  } else if (category === "disconnect") {
    summary = `Sesión cerrada: ${d.reason || "conexión finalizada"}.`;
  } else if (category === "login_failed") {
    summary = d.reason === "already_connected" ? "La cuenta ya tiene una sesión activa." : "Usuario o contraseña incorrectos.";
  } else if (category === "error") {
    summary = `Operación rechazada o fallida: ${d.reason || "sin detalle"}.`;
  }
  const scope = { group: "Grupo", private: "Privado", general: "Sala general" }[d.scope];
  return { category, label, summary, route: scope ? `${scope}${d.to ? ` → ${d.to}` : ""}` : "" };
}

export function describeLog(entry) {
  const match = /^(\S+) usuario=(.*?) detalle=(.*)$/.exec(entry.msg || "");
  if (!match) return null;
  try {
    return { ...entry, event: match[1], user: JSON.parse(match[2]), detail: JSON.parse(match[3]) };
  } catch {
    return null;
  }
}

export const eventFilters = {
  connect: "Conexiones y sesiones", disconnect: "Desconexiones", message: "Mensajes recibidos",
  message_sent: "Mensajes enviados", image: "Imágenes", audio: "Audios", document: "Documentos",
  processed: "Procesamiento", routed: "Distribución a grupo", broadcast: "Difusión", request: "Solicitudes de control",
  login_failed: "Accesos rechazados", error: "Errores", server_started: "Arranque del servidor",
};
