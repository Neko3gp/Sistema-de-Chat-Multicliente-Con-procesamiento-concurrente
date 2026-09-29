import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FiPlus, FiUserMinus, FiX } from "react-icons/fi";
import { getInitials, getNameColor } from "../../common/lib/avatar";
import ComposeDialog from "../../chat/components/ComposeDialog";
import PageTopBar from "../../common/components/PageTopBar";
import ProfileHero from "../../auth/components/ProfileHero";
import UserPickerList from "./UserPickerList";

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
  directoryUsers = [],
  directoryLoading = false,
  onRequestDirectory,
  onBack,
  onOpenMember,
  onSave,
}) {
  const adminName = group?.admin || group?.owner || "";
  const isAdmin =
    Boolean(currentUser) &&
    Boolean(adminName) &&
    group?.id !== "general" &&
    adminName.toLowerCase() === currentUser.toLowerCase();
  const canManageMembers = isAdmin;
  const [members, setMembers] = useState(group?.members || []);

  const [name, setName] = useState(group?.name || "Grupo");
  const [description, setDescription] = useState(group?.description || "");
  const [avatarUrl, setAvatarUrl] = useState(group?.avatarUrl || "");

  const [confirmField, setConfirmField] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [draft, setDraft] = useState("");
  const [savedField, setSavedField] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState("");
  const [addSaved, setAddSaved] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removeSaved, setRemoveSaved] = useState(false);

  const color = getNameColor(name);

  const addEligible = useMemo(() => {
    const memberSet = new Set(
      (members || []).map((member) => member.toLowerCase()),
    );
    const list = Array.isArray(directoryUsers) ? directoryUsers : [];
    return list.filter((user) => {
      const username = user?.username || "";
      if (!username || memberSet.has(username.toLowerCase())) return false;
      if (username.toLowerCase() === currentUser?.toLowerCase()) return false;
      return true;
    });
  }, [directoryUsers, members, currentUser]);

  useEffect(() => {
    setMembers(group?.members || []);
    setName(group?.name || "Grupo");
    setDescription(group?.description || "");
    setAvatarUrl(group?.avatarUrl || "");
  }, [group]);

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
      admin: adminName || currentUser,
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
    const next = {
      ...group,
      name,
      description,
      avatarUrl: "",
      admin: adminName || currentUser,
      members,
    };
    setAvatarUrl("");
    setDraft("");
    setEditingField(null);
    onSave?.(next);
    setSavedField("avatarUrl");
    setTimeout(() => setSavedField(""), 1600);
  }

  function openAddParticipant() {
    if (!canManageMembers) return;
    setAddOpen(true);
    setAddError("");
    onRequestDirectory?.();
  }

  function handleAddParticipant(participant) {
    if (!canManageMembers || !participant) return;

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
      admin: adminName || currentUser,
      members: nextMembers,
    });

    setAddError("");
    setAddOpen(false);
    setAddSaved(true);
    setTimeout(() => setAddSaved(false), 1600);
  }

  function confirmRemoveMember() {
    if (!canManageMembers || !removeTarget) return;
    if (removeTarget.toLowerCase() === adminName.toLowerCase()) {
      setRemoveTarget(null);
      return;
    }

    const nextMembers = members.filter(
      (member) => member.toLowerCase() !== removeTarget.toLowerCase(),
    );
    setMembers(nextMembers);
    onSave?.({
      ...group,
      name,
      description,
      avatarUrl,
      admin: adminName || currentUser,
      members: nextMembers,
    });
    setRemoveTarget(null);
    setRemoveSaved(true);
    setTimeout(() => setRemoveSaved(false), 1600);
  }

  return (
    <div className="profile-page">
      <PageTopBar title="Info. del grupo" onBack={onBack} />

      <ProfileHero
        name={name}
        avatarUrl={avatarUrl}
        color={color}
        editButton={
          isAdmin ? (
            <button
              type="button"
              className="photo-edit-btn"
              aria-label="Editar foto del grupo"
              onClick={() => askEdit("avatarUrl")}
            >
              ✎
            </button>
          ) : null
        }
      >
        <h2 className="profile-display-name">{name}</h2>
        <p className="profile-status">
          Grupo · {members.length} integrante{members.length === 1 ? "" : "s"}
          {isAdmin ? " · Eres admin" : ""}
        </p>
        {description ? (
          <p className="profile-display-description">{description}</p>
        ) : null}
      </ProfileHero>

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
          <strong>{adminName || "—"}</strong>
        </div>
        <div className="profile-info-row">
          <span>Integrantes</span>
          <strong>
            {members.length} persona{members.length === 1 ? "" : "s"}
          </strong>
        </div>
      </section>

      {savedField || addSaved || removeSaved ? (
        <p className="profile-saved field-saved">
          {removeSaved
            ? "Participante expulsado"
            : addSaved
              ? "Participante agregado"
              : "Campo actualizado"}
        </p>
      ) : null}

      <section className="group-members">
        <div className="group-members-header">
          <h3>Integrantes ({members.length})</h3>
          {canManageMembers ? (
            <button
              type="button"
              className="add-member-btn"
              onClick={openAddParticipant}
            >
              <FiPlus size={16} aria-hidden="true" />
              Agregar
            </button>
          ) : null}
        </div>

        <ul>
          {members.map((member) => {
            const online = onlineUsers.includes(member);
            const memberIsAdmin =
              Boolean(adminName) &&
              member.toLowerCase() === adminName.toLowerCase();

            return (
              <li key={member}>
                <div className="group-member-row-wrap">
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
                  {canManageMembers && !memberIsAdmin ? (
                    <button
                      type="button"
                      className="kick-member-btn"
                      title={`Expulsar a ${member}`}
                      aria-label={`Expulsar a ${member}`}
                      onClick={() => setRemoveTarget(member)}
                    >
                      <FiUserMinus size={16} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {addOpen
        ? createPortal(
            <ComposeDialog
              title="Agregar participante"
              onClose={() => setAddOpen(false)}
              footer={
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setAddOpen(false)}
                >
                  Cancelar
                </button>
              }
            >
              <p>Elige un usuario del catálogo para añadirlo al grupo.</p>
              <UserPickerList
                users={addEligible}
                onlineUsers={onlineUsers}
                loading={directoryLoading}
                mode="single"
                emptyLabel="No hay usuarios disponibles"
                onSelect={handleAddParticipant}
              />
              {addError ? <p className="input-error">{addError}</p> : null}
            </ComposeDialog>,
            document.body,
          )
        : null}

      {removeTarget
        ? createPortal(
            <div
              className="confirm-dialog-backdrop confirm-dialog-backdrop--card"
              role="presentation"
              onClick={() => setRemoveTarget(null)}
            >
              <div
                className="confirm-dialog confirm-dialog--card"
                role="dialog"
                aria-modal="true"
                aria-label="Confirmar expulsión"
                onClick={(event) => event.stopPropagation()}
              >
                <h3>¿Expulsar del grupo?</h3>
                <p>
                  Vas a sacar a <strong>{removeTarget}</strong> de este grupo.
                </p>
                <div className="confirm-dialog-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setRemoveTarget(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={confirmRemoveMember}
                  >
                    Expulsar
                  </button>
                </div>
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
