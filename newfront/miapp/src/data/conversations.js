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

export const mockMessages = [
  {
    type: "broadcast",
    from: "Carlos",
    message: "¿Alguien ya levantó el servidor en el puerto 5000?",
    at: minutes(55),
  },
  {
    type: "broadcast",
    from: "Ana",
    message: "Sí, yo estoy en el front revisando la interfaz.",
    at: minutes(54),
  },
  {
    type: "broadcast",
    from: "Demo",
    message: "Perfecto. En un rato probamos la conexión juntos.",
    at: minutes(53),
  },
  {
    type: "broadcast",
    from: "Luis",
    message: "Recuerden: un hilo por cliente y Lock en ConnectionManager.",
    at: minutes(50),
  },
  {
    type: "broadcast",
    from: "María",
    message: "El contrato de mensajes está en la carpeta docs.",
    at: minutes(48),
  },
  {
    type: "broadcast",
    from: "Carlos",
    message: "Hola a todos, ¿reunión a las 6?",
    at: minutes(20),
  },
  {
    type: "broadcast",
    from: "Ana",
    message: "Va, yo sí puedo.",
    at: minutes(19),
  },
  {
    type: "private_message",
    from: "Ana",
    to: "Demo",
    message: "Oye, ¿ya viste el sidebar?",
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
    message: "También podemos agregar temas de color.",
    at: minutes(38),
  },
  {
    type: "private_message",
    from: "Demo",
    to: "Ana",
    message: "Hecho. Luego lo revisamos juntos.",
    at: minutes(36),
  },
  {
    type: "private_message",
    from: "Carlos",
    to: "Demo",
    message: "El login manda username y password al servidor.",
    at: minutes(30),
  },
  {
    type: "private_message",
    from: "Demo",
    to: "Carlos",
    message: "Ok. Lo dejo listo para cuando conectemos.",
    at: minutes(29),
  },
  {
    type: "private_message",
    from: "Carlos",
    to: "Demo",
    message: "Perfecto. Avísame para probar broadcast y privados.",
    at: minutes(28),
  },
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
  {
    type: "private_message",
    from: "María",
    to: "Demo",
    message: "Te pasé el formato para enviar archivos.",
    at: minutes(15),
  },
  {
    type: "private_message",
    from: "Demo",
    to: "María",
    message: "Gracias. Ya lo tengo en la vista de mensajes.",
    at: minutes(14),
  },
  {
    type: "private_message",
    from: "María",
    to: "Demo",
    message: "Máximo 5 MiB por archivo.",
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
