/** Datos mock para simular chats mientras el backend no está conectado */

const now = Date.now();
const minutes = (n) => new Date(now - n * 60 * 1000);

export const demoUser = {
  username: "Demo",
  email: "demo@chat.com",
  password: "1234",
  description: "Hey ahí estoy usando Chat",
  avatarUrl: "",
};

export const connectedUsers = ["Demo", "Ana", "Carlos", "Luis", "María"];

/** Grupos / salas (broadcast) */
export const groups = {
  general: {
    id: "general",
    name: "Sala general",
    avatarUrl: "",
    description: "Canal principal del proyecto de chat multicliente",
    admin: "Demo",
    members: ["Demo", "Ana", "Carlos", "Luis", "María"],
  },
};

export const contactProfiles = {
  Ana: {
    username: "Ana",
    email: "ana@chat.com",
    description: "Diseñando la UI del chat",
    avatarUrl: "",
    lastSeen: minutes(12),
  },
  Carlos: {
    username: "Carlos",
    email: "carlos@chat.com",
    description: "Backend con sockets y threads",
    avatarUrl: "",
    lastSeen: minutes(5),
  },
  Luis: {
    username: "Luis",
    email: "luis@chat.com",
    description: "Probando concurrencia",
    avatarUrl: "",
    lastSeen: minutes(90),
  },
  María: {
    username: "María",
    email: "maria@chat.com",
    description: "Documentando el protocolo",
    avatarUrl: "",
    lastSeen: minutes(180),
  },
};

/** Conversación general (broadcast) + privados */
export const mockMessages = [
  // Sala general
  {
    type: "broadcast",
    from: "Carlos",
    message: "¿Alguien ya levantó el servidor en el puerto 5000?",
    at: minutes(55),
  },
  {
    type: "broadcast",
    from: "Ana",
    message: "Yo estoy en el front. Aún uso modo demo.",
    at: minutes(54),
  },
  {
    type: "broadcast",
    from: "Demo",
    message: "Perfecto, yo también. Luego conectamos el WebSocket.",
    at: minutes(53),
  },
  {
    type: "broadcast",
    from: "Luis",
    message: "Recuerden: un hilo por cliente y Lock en ConnectionManager 👀",
    at: minutes(50),
  },
  {
    type: "broadcast",
    from: "María",
    message: "El contrato de mensajes está en docs/PROTOCOLO_MENSAJES.md",
    at: minutes(48),
  },
  {
    type: "broadcast",
    from: "Carlos",
    message: "Hola a todos 👋 ¿reunión a las 6?",
    at: minutes(20),
  },
  {
    type: "broadcast",
    from: "Ana",
    message: "Va, yo sí puedo.",
    at: minutes(19),
  },

  // Chat privado con Ana
  {
    type: "private_message",
    from: "Ana",
    to: "Demo",
    message: "Oye, ¿ya viste el sidebar tipo WhatsApp?",
    at: minutes(40),
  },
  {
    type: "private_message",
    from: "Demo",
    to: "Ana",
    message: "Sí, quedó bien. Falta pulir el perfil.",
    at: minutes(39),
  },
  {
    type: "private_message",
    from: "Ana",
    to: "Demo",
    message: "También podemos meter temas liquid glass ✨",
    at: minutes(38),
  },
  {
    type: "private_message",
    from: "Demo",
    to: "Ana",
    message: "Hecho. Luego lo revisamos juntos.",
    at: minutes(36),
  },

  // Chat privado con Carlos
  {
    type: "private_message",
    from: "Carlos",
    to: "Demo",
    message: "Cuando conectemos el socket, el login manda username + password.",
    at: minutes(30),
  },
  {
    type: "private_message",
    from: "Demo",
    to: "Carlos",
    message: "Ok. Por ahora SKIP_AUTH está en true.",
    at: minutes(29),
  },
  {
    type: "private_message",
    from: "Carlos",
    to: "Demo",
    message: "Perfecto. Avísame para probar broadcast y privados.",
    at: minutes(28),
  },

  // Chat privado con Luis
  {
    type: "private_message",
    from: "Luis",
    to: "Demo",
    message: "¿Ya corriste el script de escalabilidad?",
    at: minutes(25),
  },
  {
    type: "private_message",
    from: "Demo",
    to: "Luis",
    message: "Todavía no. Lo hago después de terminar la UI.",
    at: minutes(24),
  },

  // Chat privado con María
  {
    type: "private_message",
    from: "María",
    to: "Demo",
    message: "Te pasé el formato JSON de file en base64.",
    at: minutes(15),
  },
  {
    type: "private_message",
    from: "Demo",
    to: "María",
    message: "Gracias. Lo dejo listo en FileMessage.",
    at: minutes(14),
  },
  {
    type: "private_message",
    from: "María",
    to: "Demo",
    message: "Máximo 5 MiB, si no responde file_too_large.",
    at: minutes(13),
  },
];

export const initialDemoState = {
  username: demoUser.username,
  email: demoUser.email,
  password: demoUser.password,
  description: demoUser.description,
  avatarUrl: demoUser.avatarUrl,
  users: connectedUsers,
  messages: mockMessages,
  contactProfiles,
  groups,
};
