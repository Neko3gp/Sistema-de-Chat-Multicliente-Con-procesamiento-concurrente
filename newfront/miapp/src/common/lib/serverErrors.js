/**
 * Traduce códigos de error del servidor a texto en español para la UI.
 */
export function mapServerReason(reason) {
  switch (reason) {
    case "invalid_credentials":
      return "Usuario o contraseña incorrectos";
    case "username_taken":
      return "Ese nombre de usuario ya está en uso";
    case "already_connected":
      return "Ese usuario ya tiene una sesión abierta";
    case "user_not_found":
      return "El destinatario no está conectado";
    case "authentication_required":
      return "Debes iniciar sesión";
    case "file_too_large":
      return "El archivo supera el límite de 5 MiB";
    case "forbidden":
      return "No tienes permiso para esa acción";
    case "invalid_message":
      return "Mensaje inválido";
    case "invalid_user":
      return "Los datos del usuario no son válidos";
    case "cannot_delete_user":
      return "No puedes eliminar esa cuenta desde esta sesión";
    case "invalid_group":
      return "El grupo necesita nombre e integrantes válidos";
    case "group_not_found":
      return "El grupo ya no existe";
    case "connection_failed":
      return "No se pudo conectar al servidor";
    case "connection_closed":
      return "Se cerró la conexión con el servidor";
    default:
      return reason || "Error del servidor";
  }
}
