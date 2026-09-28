import { useState } from "react";
import { FiX } from "react-icons/fi";

export default function NewChatDialog({ onClose, onSubmit }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    const query = value.trim();
    if (!query) {
      setError("Escribe un nombre de usuario o correo");
      return;
    }

    const result = onSubmit?.(query);
    if (result?.error) {
      setError(result.error);
      return;
    }

    setError("");
    onClose?.();
  }

  return (
    <div className="confirm-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Nuevo mensaje"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="new-chat-header">
          <h3>Nuevo mensaje</h3>
          <button
            type="button"
            className="field-edit-btn"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <FiX size={16} aria-hidden="true" />
          </button>
        </div>

        <p>Escribe el nombre de usuario o el correo de la persona.</p>

        <form onSubmit={handleSubmit} className="new-chat-form">
          <input
            type="text"
            autoFocus
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError("");
            }}
            placeholder="usuario o correo@ejemplo.com"
          />

          {error ? <p className="input-error">{error}</p> : null}

          <div className="confirm-dialog-actions">
            <button type="button" className="ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit">Iniciar chat</button>
          </div>
        </form>
      </div>
    </div>
  );
}
