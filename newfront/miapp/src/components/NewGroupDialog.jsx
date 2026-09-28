import { useMemo, useState } from "react";
import { FiSearch, FiX } from "react-icons/fi";
import { getInitials, getNameColor } from "../utils/avatar";

export default function NewGroupDialog({
  onClose,
  onCreate,
  directoryUsers = [],
  onlineUsers = [],
  loading = false,
}) {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = Array.isArray(directoryUsers) ? directoryUsers : [];
    if (!q) return list;
    return list.filter((user) => {
      const username = (user.username || "").toLowerCase();
      const desc = (user.description || "").toLowerCase();
      return username.includes(q) || desc.includes(q);
    });
  }, [directoryUsers, query]);

  function toggleMember(username) {
    setSelected((prev) =>
      prev.includes(username)
        ? prev.filter((item) => item !== username)
        : [...prev, username],
    );
    setError("");
  }

  function handleCreate() {
    const groupName = name.trim();
    if (!groupName) {
      setError("Escribe el nombre del grupo");
      return;
    }
    if (selected.length === 0) {
      setError("Añade al menos un integrante");
      return;
    }
    const result = onCreate?.({ name: groupName, members: selected });
    if (result?.error) {
      setError(result.error);
      return;
    }
    onClose?.();
  }

  return (
    <div className="confirm-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="confirm-dialog compose-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Nuevo grupo"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="new-chat-header">
          <h3>Nuevo grupo</h3>
          <button
            type="button"
            className="field-edit-btn"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <FiX size={16} aria-hidden="true" />
          </button>
        </div>

        <label className="compose-field">
          <span>Nombre del grupo</span>
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError("");
            }}
            placeholder="Ej. Equipo frontend"
            maxLength={60}
          />
        </label>

        <p className="compose-selected-count">
          Integrantes: <strong>{selected.length}</strong>
        </p>

        <div className="compose-search">
          <FiSearch size={16} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar integrantes…"
          />
        </div>

        <ul className="compose-user-list">
          {loading ? (
            <li className="compose-empty">Cargando usuarios…</li>
          ) : filtered.length === 0 ? (
            <li className="compose-empty">No hay usuarios que coincidan</li>
          ) : (
            filtered.map((user) => {
              const username = user.username;
              const checked = selected.includes(username);
              const online = onlineUsers.includes(username);
              return (
                <li key={username}>
                  <button
                    type="button"
                    className={
                      checked
                        ? "compose-user-item selected"
                        : "compose-user-item"
                    }
                    onClick={() => toggleMember(username)}
                  >
                    {user.avatarUrl ? (
                      <img
                        className="compose-user-avatar"
                        src={user.avatarUrl}
                        alt=""
                      />
                    ) : (
                      <span
                        className="compose-user-avatar initials"
                        style={{ background: getNameColor(username) }}
                      >
                        {getInitials(username)}
                      </span>
                    )}
                    <span className="compose-user-text">
                      <strong>{username}</strong>
                      <small>
                        {online ? "en línea" : user.description || "sin descripción"}
                      </small>
                    </span>
                    <span
                      className={
                        checked ? "compose-check on" : "compose-check"
                      }
                      aria-hidden="true"
                    >
                      {checked ? "✓" : ""}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        {error ? <p className="input-error">{error}</p> : null}

        <div className="confirm-dialog-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" onClick={handleCreate}>
            Crear grupo
          </button>
        </div>
      </div>
    </div>
  );
}
