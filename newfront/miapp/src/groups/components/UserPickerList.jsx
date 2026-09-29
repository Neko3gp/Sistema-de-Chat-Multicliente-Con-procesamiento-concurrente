/**
 * Buscador + lista de usuarios del directorio.
 * Sirve para nuevo mensaje, nuevo grupo y agregar participante.
 */
import { useMemo, useState } from "react";
import { FiSearch } from "react-icons/fi";
import ProfilePhoto from "../../auth/components/ProfilePhoto";

function filterUsers(users, query) {
  const q = query.trim().toLowerCase();
  const list = Array.isArray(users) ? users : [];
  if (!q) return list;
  return list.filter((user) => {
    const name = (user.username || "").toLowerCase();
    const desc = (user.description || "").toLowerCase();
    const email = (user.email || "").toLowerCase();
    return name.includes(q) || desc.includes(q) || email.includes(q);
  });
}

export default function UserPickerList({
  users = [],
  onlineUsers = [],
  loading = false,
  mode = "single",
  selected = [],
  onSelect,
  onToggle,
  searchPlaceholder = "Buscar usuario…",
  emptyLabel = "No hay usuarios que coincidan",
  loadingLabel = "Cargando usuarios…",
  autoFocus = true,
  query: controlledQuery,
  onQueryChange,
}) {
  const [internalQuery, setInternalQuery] = useState("");
  const isControlled = controlledQuery != null;
  const query = isControlled ? controlledQuery : internalQuery;

  function setQuery(value) {
    if (isControlled) onQueryChange?.(value);
    else setInternalQuery(value);
  }

  const filtered = useMemo(
    () => filterUsers(users, query),
    [users, query],
  );

  const multi = mode === "multi";

  return (
    <>
      <div className="compose-search">
        <FiSearch size={16} aria-hidden="true" />
        <input
          type="search"
          autoFocus={autoFocus}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder}
        />
      </div>

      <ul className="compose-user-list">
        {loading && filtered.length === 0 ? (
          <li className="compose-empty">{loadingLabel}</li>
        ) : filtered.length === 0 ? (
          <li className="compose-empty">{emptyLabel}</li>
        ) : (
          filtered.map((user) => {
            const username = user.username;
            const online = onlineUsers.includes(username);
            const checked = multi && selected.includes(username);
            return (
              <li key={username}>
                <button
                  type="button"
                  className={
                    checked ? "compose-user-item selected" : "compose-user-item"
                  }
                  onClick={() => {
                    if (multi) onToggle?.(username);
                    else onSelect?.(username);
                  }}
                >
                  <ProfilePhoto
                    name={username}
                    avatarUrl={user.avatarUrl}
                    className="compose-user-avatar"
                  />
                  <span className="compose-user-text">
                    <strong>{username}</strong>
                    <small>
                      {online
                        ? "en línea"
                        : user.description || "sin descripción"}
                    </small>
                  </span>
                  {multi ? (
                    <span
                      className={checked ? "compose-check on" : "compose-check"}
                      aria-hidden="true"
                    >
                      {checked ? "✓" : ""}
                    </span>
                  ) : online ? (
                    <span className="compose-online-dot" />
                  ) : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </>
  );
}
