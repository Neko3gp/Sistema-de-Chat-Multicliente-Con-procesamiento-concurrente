/**
 * Diálogo para crear un grupo: nombre + selección múltiple de integrantes.
 */
import { useState } from "react";
import ComposeDialog from "../../chat/components/ComposeDialog";
import UserPickerList from "./UserPickerList";

export default function NewGroupDialog({
  onClose,
  onCreate,
  directoryUsers = [],
  onlineUsers = [],
  loading = false,
}) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState("");

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
    <ComposeDialog
      title="Nuevo grupo"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" onClick={handleCreate}>
            Crear grupo
          </button>
        </>
      }
    >
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

      <UserPickerList
        users={directoryUsers}
        onlineUsers={onlineUsers}
        loading={loading}
        mode="multi"
        selected={selected}
        onToggle={toggleMember}
        searchPlaceholder="Buscar integrantes…"
        autoFocus={false}
      />

      {error ? <p className="input-error">{error}</p> : null}
    </ComposeDialog>
  );
}
