/**
 * Texto corto de vista previa para notificaciones según el tipo de mensaje.
 */
export function previewFromMessage(message) {
  if (message.type === "file") return message.filename || "Archivo";
  return message.message || "Nuevo mensaje";
}
