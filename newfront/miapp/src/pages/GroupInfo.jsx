import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FiPlus, FiX } from "react-icons/fi";
import { getInitials, getNameColor } from "../utils/avatar";

const FIELD_LABELS = {
  name: "el nombre del grupo",
  description: "la descripción",
  avatarUrl: "la foto del grupo",
};

export default function GroupInfo({
  group,
  currentUser,
  onlineUsers = [],
  contacts = {},
  onBack,
  onOpenMember,
  onSave,
}) {
  const isAdmin = currentUser && group?.admin === currentUser;
  const [members, setMembers] = useState(group?.members || []);

  const [name, setName] = useState(group?.name || "Grupo");
  const [description, setDescription] = useState(group?.description || "");
  const [avatarUrl, setAvatarUrl] = useState(group?.avatarUrl || "");

  const [confirmField, setConfirmField] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [draft, setDraft] = useState("");
  const [savedField, setSavedField] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addValue, setAddValue] = useState("");
  const [addError, setAddError] = useState("");
  const [addSaved, setAddSaved] = useState(false);

  const color = getNameColor(name);

  useEffect(() => {
    setMembers(group?.members || []);
    setName(group?.name || "Grupo");
    setDescription(group?.description || "");
    setAvatarUrl(group?.avatarUrl || "");
  }, [group]);

  function resolveParticipant(query) {
    const q = query.trim().toLowerCase();
    if (!q) return null;

    for (const [username, profile] of Object.entries(contacts)) {
      if (
        username.toLowerCase() === q ||
        profile.email?.toLowerCase() === q
      ) {
        return username;
      }
    }

    const onlineMatch = onlineUsers.find(
      (user) => user.toLowerCase() === q,
    );
    if (onlineMatch) return onlineMatch;

    const memberMatch = members.find((user) => user.toLowerCase() === q);
    if (memberMatch) return memberMatch;

    if (q.includes("@")) {
      return q.split("@")[0].replace(/[^\w.-]/g, "") || null;
    }

    return query.trim();
  }

  function askEdit(field) {
    if (!isAdmin) return;
    setConfirmField(field);
  }

  function cancelConfirm() {
    setConfirmField(null);
  }

  function acceptConfirm() {
    const field = confirmField;
    setConfirmField(null);
    if (!field) return;

    if (field === "name") setDraft(name);
    if (field === "description") setDraft(description);
    if (field === "avatarUrl") setDraft(avatarUrl);
    setEditingField(field);
  }

  function cancelEdit() {
    setEditingField(null);
    setDraft("");
  }

  function saveField() {
    if (!isAdmin || !editingField) return;

    const next = {
      ...group,
      name,
      description,
      avatarUrl,
      members,
    };

    if (editingField === "name") {
      next.name = draft.trim() || group.name;
      setName(next.name);
    }
    if (editingField === "description") {
      next.description = draft.trim();
      setDescription(next.description);
    }
    if (editingField === "avatarUrl") {
      next.avatarUrl = draft.trim();
      setAvatarUrl(next.avatarUrl);
    }

    onSave?.(next);
    setSavedField(editingField);
    setEditingField(null);
    setDraft("");
    setTimeout(() => setSavedField(""), 1600);
  }

  function clearPhoto() {
    if (!isAdmin) return;
    const next = { ...group, name, description, avatarUrl: "", members };
    setAvatarUrl("");
    setDraft("");
    setEditingField(null);
    onSave?.(next);
    setSavedField("avatarUrl");
    setTimeout(() => setSavedField(""), 1600);
  }

  function handleAddParticipant(event) {
    event.preventDefault();
    const query = addValue.trim();
    if (!query) {
      setAddError("Escribe un nombre de usuario o correo");
      return;
    }

    const participant = resolveParticipant(query);
    if (!participant) {
      setAddError("No se pudo identificar al usuario");
      return;
    }

    if (participant.toLowerCase() === currentUser?.toLowerCase()) {
      setAddError("Ya formas parte del grupo");
      return;
    }

    if (members.some((member) => member.toLowerCase() === participant.toLowerCase())) {
      setAddError("Esa persona ya está en el grupo");
      return;
    }

    const nextMembers = [...members, participant];
    setMembers(nextMembers);
    onSave?.({
      ...group,
      name,
      description,
      avatarUrl,
      members: nextMembers,
    });

    setAddValue("");
    setAddError("");
    setAddOpen(false);
    setAddSaved(true);
    setTimeout(() => setAddSaved(false), 1600);
  }

  return (
    <div className="profile-page">
      <header className="profile-topbar">
        <button type="button" className="back-btn" onClick={onBack} aria-label="Volver">
          ←
        </button>
        <h1>Info. del grupo</h1>
      </header>

      <section className="profile-hero">
        <div className="profile-photo-wrap">
          <div className="profile-photo-frame">
            {avatarUrl ? (
              <img className="profile-photo" src={avatarUrl} alt={name} />
            ) : (
              <div
                className="profile-photo placeholder"
                style={{ background: color }}
              >
                {getInitials(name)}
              </div>
            )}

            {isAdmin ? (
              <button
                type="button"
                className="photo-edit-btn"
                aria-label="Editar foto del grupo"
                onClick={() => askEdit("avatarUrl")}
              >
                ✎
              </button>
            ) : null}
          </div>
        </div>

        <h2 className="profile-display-name">{name}</h2>
        <p className="profile-status">
          Grupo · {members.length} integrante{members.length === 1 ? "" : "s"}
          {isAdmin ? " · Eres admin" : ""}
        </p>
        {description ? (
          <p className="profile-display-description">{description}</p>
        ) : null}
      </section>

      <section className="profile-contact-info">
        <div className="profile-info-row editable-row">
          <div className="editable-row-text">
            <span>Nombre del grupo</span>
            <strong>{name}</strong>
          </div>
          {isAdmin ? (
            <button
              type="button"
              className="field-edit-btn"
              aria-label="Editar nombre"
              onClick={() => askEdit("name")}
            >
              ✎
            </button>
          ) : null}
        </div>

        <div className="profile-info-row editable-row">
          <div className="editable-row-text">
            <span>Descripción</span>
            <strong>{description || "Sin descripción"}</strong>
          </div>
          {isAdmin ? (
            <button
              type="button"
              className="field-edit-btn"
              aria-label="Editar descripción"
              onClick={() => askEdit("description")}
            >
              ✎
            </button>
          ) : null}
        </div>

        <div className="profile-info-row">
          <span>Administrador</span>
          <strong>{group?.admin || "—"}</strong>
        </div>
        <div className="profile-info-row">
          <span>Integrantes</span>
          <strong>
            {members.length} persona{members.length === 1 ? "" : "s"}
          </strong>
        </div>
      </section>

      {savedField || addSaved ? (
        <p className="profile-saved field-saved">
          {addSaved ? "Participante agregado" : "Campo actualizado"}
        </p>
      ) : null}

      <section className="group-members">
        <div className="group-members-header">
          <h3>Integrantes ({members.length})</h3>
          {isAdmin ? (
            <button
              type="button"
              className="add-member-btn"
              onClick={() => {
                setAddOpen(true);
                setAddError("");
                setAddValue("");
              }}
            >
              <FiPlus size={16} aria-hidden="true" />
              Agregar
            </button>
          ) : null}
        </div>

        <ul>
          {members.map((member) => {
            const online = onlineUsers.includes(member);
            const memberIsAdmin = member === group?.admin;

            return (
              <li key={member}>
                <button
                  type="button"
                  className="group-member-row"
                  onClick={() => onOpenMember?.(member)}
                >
                  <span
                    className="avatar"
                    style={{ background: getNameColor(member) }}
                    aria-hidden="true"
                  >
                    {getInitials(member)}
                  </span>
                  <span className="group-member-text">
                    <strong>
                      {member}
                      {memberIsAdmin ? " · Admin" : ""}
                    </strong>
                    <small className={online ? "online" : ""}>
                      {online ? "en línea" : "desconectado"}
                    </small>
                  </span>
                  <span className="settings-row-chevron">›</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {addOpen
        ? createPortal(
            <div
              className="confirm-dialog-backdrop"
              role="presentation"
              onClick={() => setAddOpen(false)}
            >
              <div
                className="confirm-dialog"
                role="dialog"
                aria-modal="true"
                aria-label="Agregar participante"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="new-chat-header">
                  <h3>Agregar participante</h3>
                  <button
                    type="button"
                    className="field-edit-btn"
                    onClick={() => setAddOpen(false)}
                    aria-label="Cerrar"
                  >
                    <FiX size={16} aria-hidden="true" />
                  </button>
                </div>

                <p>Escribe el nombre de usuario o el correo de la persona.</p>

                <form onSubmit={handleAddParticipant} className="new-chat-form">
                  <input
                    type="text"
                    autoFocus
                    value={addValue}
                    onChange={(event) => {
                      setAddValue(event.target.value);
                      setAddError("");
                    }}
                    placeholder="usuario o correo@ejemplo.com"
                  />

                  {addError ? <p className="input-error">{addError}</p> : null}

                  <div className="confirm-dialog-actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setAddOpen(false)}
                    >
                      Cancelar
                    </button>
                    <button type="submit">Agregar</button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}

      {confirmField
        ? createPortal(
            <div className="confirm-dialog-backdrop" role="presentation">
              <div className="confirm-dialog" role="dialog" aria-modal="true">
                <h3>¿Seguro que quieres editar?</h3>
                <p>
                  Vas a modificar {FIELD_LABELS[confirmField] || "este campo"}.
                </p>
                <div className="confirm-dialog-actions">
                  <button type="button" className="ghost" onClick={cancelConfirm}>
                    Cancelar
                  </button>
                  <button type="button" onClick={acceptConfirm}>
                    Sí, editar
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {editingField
        ? createPortal(
            <div className="confirm-dialog-backdrop" role="presentation">
              <div className="confirm-dialog" role="dialog" aria-modal="true">
                <h3>
                  Editar{" "}
                  {editingField === "name"
                    ? "nombre"
                    : editingField === "description"
                      ? "descripción"
                      : "foto"}
                </h3>

                {editingField === "description" ? (
                  <textarea
                    rows={4}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Descripción del grupo"
                    maxLength={160}
                  />
                ) : (
                  <input
                    type={editingField === "avatarUrl" ? "url" : "text"}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={
                      editingField === "avatarUrl"
                        ? "https://ejemplo.com/foto.jpg"
                        : "Nombre del grupo"
                    }
                  />
                )}

                <div className="confirm-dialog-actions">
                  {editingField === "avatarUrl" && avatarUrl ? (
                    <button type="button" className="danger" onClick={clearPhoto}>
                      Eliminar foto
                    </button>
                  ) : null}
                  <button type="button" className="ghost" onClick={cancelEdit}>
                    Cancelar
                  </button>
                  <button type="button" onClick={saveField}>
                    Guardar
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
