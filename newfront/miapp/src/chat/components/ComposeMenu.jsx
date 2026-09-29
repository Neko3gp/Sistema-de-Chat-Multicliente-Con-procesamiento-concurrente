import { FiMessageSquare, FiUsers, FiX } from "react-icons/fi";

export default function ComposeMenu({ onClose, onNewMessage, onNewGroup }) {
  return (
    <div className="confirm-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="confirm-dialog compose-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Crear"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="new-chat-header">
          <h3>Crear</h3>
          <button
            type="button"
            className="field-edit-btn"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <FiX size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="compose-menu-actions">
          <button type="button" className="compose-menu-item" onClick={onNewMessage}>
            <span className="compose-menu-icon" aria-hidden="true">
              <FiMessageSquare size={20} />
            </span>
            <span>
              <strong>Nuevo mensaje</strong>
              <small>Escribe a un usuario registrado</small>
            </span>
          </button>
          <button type="button" className="compose-menu-item" onClick={onNewGroup}>
            <span className="compose-menu-icon" aria-hidden="true">
              <FiUsers size={20} />
            </span>
            <span>
              <strong>Nuevo grupo</strong>
              <small>Nombre e integrantes</small>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
