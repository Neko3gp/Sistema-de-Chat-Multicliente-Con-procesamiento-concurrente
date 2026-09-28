import { useMemo, useState } from "react";
import { FiSearch, FiX } from "react-icons/fi";
import ProfilePhoto from "./ProfilePhoto";

export default function NewMessageDialog({
  onClose,
  onSelectUser,
  directoryUsers = [],
  onlineUsers = [],
  loading = false,
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = Array.isArray(directoryUsers) ? directoryUsers : [];
    if (!q) return list;
    return list.filter((user) => {
      const name = (user.username || "").toLowerCase();
      const desc = (user.description || "").toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
  }, [directoryUsers, query]);

  return (
    <div className="confirm-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="confirm-dialog compose-dialog"
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

        <p>Elige un usuario de la base de datos para iniciar el chat.</p>

        <div className="compose-search">
          <FiSearch size={16} aria-hidden="true" />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar usuario…"
          />
        </div>

        <ul className="compose-user-list">
          {loading && filtered.length === 0 ? (
            <li className="compose-empty">Cargando usuarios…</li>
          ) : filtered.length === 0 ? (
            <li className="compose-empty">No hay usuarios que coincidan</li>
          ) : (
            filtered.map((user) => {
              const name = user.username;
              const online = onlineUsers.includes(name);
              return (
                <li key={name}>
                  <button
                    type="button"
                    className="compose-user-item"
                    onClick={() => {
                      onSelectUser?.(name);
                      onClose?.();
                    }}
                  >
                    <ProfilePhoto
                      name={name}
                      avatarUrl={user.avatarUrl}
                      className="compose-user-avatar"
                    />
                    <span className="compose-user-text">
                      <strong>{name}</strong>
                      <small>
                        {online ? "en línea" : user.description || "sin descripción"}
                      </small>
                    </span>
                    {online ? <span className="compose-online-dot" /> : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="confirm-dialog-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
