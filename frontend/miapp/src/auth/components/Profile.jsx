import { useState } from "react";
import { getNameColor } from "../../common/lib/avatar";
import PageTopBar from "../../common/components/PageTopBar";
import ProfileHero from "./ProfileHero";

function formatLastSeen(date) {
  if (!date) return "Desconectado";
  const value = date instanceof Date ? date : new Date(date);
  const time = value.toLocaleTimeString("es-MX", {
    hour: "numeric",
    minute: "2-digit",
  });
  const day = value.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
  return `Última vez ${day} a las ${time}`;
}

export default function Profile({
  mode = "own",
  profile,
  onSave,
  onBack,
  onLogout,
}) {
  const isOwn = mode === "own";

  const [username, setUsername] = useState(profile.username || "");
  const [email, setEmail] = useState(profile.email || "");
  const [password, setPassword] = useState(profile.password || "");
  const [description, setDescription] = useState(profile.description || "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl || "");
  const [urlDraft, setUrlDraft] = useState(profile.avatarUrl || "");
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState(false);
  const [saved, setSaved] = useState(false);

  const displayName = isOwn ? username : profile.username;
  const displayEmail = isOwn ? email : profile.email;
  const displayDescription = isOwn ? description : profile.description;
  const displayAvatar = isOwn ? avatarUrl : profile.avatarUrl;
  const color = getNameColor(displayName || "Usuario");
  const isOnline = Boolean(profile.isOnline);
  const statusText = isOnline
    ? "en línea"
    : formatLastSeen(profile.lastSeen);

  function handleSave(event) {
    event.preventDefault();
    onSave({
      username: username.trim() || profile.username,
      email: email.trim(),
      password,
      description: description.trim(),
      avatarUrl: avatarUrl.trim(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  function applyPhotoUrl() {
    const nextUrl = urlDraft.trim();
    setAvatarUrl(nextUrl);
    setEditingPhoto(false);
    setPhotoMenuOpen(false);
    onSave({
      username: username.trim() || profile.username,
      email: email.trim(),
      password,
      description: description.trim(),
      avatarUrl: nextUrl,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  function removePhoto() {
    setAvatarUrl("");
    setUrlDraft("");
    setEditingPhoto(false);
    setPhotoMenuOpen(false);
    onSave({
      username: username.trim() || profile.username,
      email: email.trim(),
      password,
      description: description.trim(),
      avatarUrl: "",
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  function openChangePhoto() {
    setUrlDraft(avatarUrl);
    setEditingPhoto(true);
  }

  return (
    <div className="profile-page">
      <PageTopBar
        title={isOwn ? "Perfil" : "Info. del contacto"}
        onBack={onBack}
      />

      <ProfileHero
        name={displayName || "Usuario"}
        avatarUrl={displayAvatar}
        avatarAlt="Foto de perfil"
        color={color}
        editButton={
          isOwn ? (
            <button
              type="button"
              className="photo-edit-btn"
              aria-label="Editar foto de perfil"
              onClick={() => {
                setPhotoMenuOpen((open) => !open);
                if (editingPhoto) setEditingPhoto(false);
              }}
            >
              ✎
            </button>
          ) : null
        }
        belowPhoto={
          isOwn && photoMenuOpen ? (
            <div className="profile-photo-actions">
              <button type="button" onClick={openChangePhoto}>
                {avatarUrl ? "Cambiar foto" : "Agregar foto"}
              </button>
              {avatarUrl ? (
                <button type="button" className="danger" onClick={removePhoto}>
                  Eliminar
                </button>
              ) : null}
            </div>
          ) : null
        }
      >
        {isOwn && editingPhoto ? (
          <div className="profile-url-box">
            <label>
              URL de la foto
              <input
                type="url"
                placeholder="https://ejemplo.com/foto.jpg"
                value={urlDraft}
                onChange={(event) => setUrlDraft(event.target.value)}
              />
              <small>Debe ser http(s); la verán todos los usuarios</small>
            </label>
            <div className="profile-url-actions">
              <button type="button" onClick={applyPhotoUrl}>
                Usar URL
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setUrlDraft(avatarUrl);
                  setEditingPhoto(false);
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

        <h2 className="profile-display-name">{displayName || "Usuario"}</h2>
        <p className={isOnline ? "profile-status online" : "profile-status"}>
          {isOwn ? displayEmail || "Sin correo" : statusText}
        </p>
        <p className="profile-display-description">
          {displayDescription || "Sin descripción"}
        </p>
      </ProfileHero>

      {!isOwn ? (
        <section className="profile-contact-info">
          <div className="profile-info-row">
            <span>Nombre de usuario</span>
            <strong>{displayName || "Usuario"}</strong>
          </div>
          <div className="profile-info-row">
            <span>Correo</span>
            <strong>{displayEmail || "Sin correo"}</strong>
          </div>
          <div className="profile-info-row">
            <span>Estado</span>
            <strong className={isOnline ? "online" : ""}>{statusText}</strong>
          </div>
        </section>
      ) : (
        <>
          <form className="profile-form" onSubmit={handleSave}>
            <label>
              <span>Nombre de usuario</span>
              <small>Lo define tu cuenta en el servidor</small>
              <input
                type="text"
                value={username}
                readOnly
                disabled
              />
            </label>

            <label>
              <span>Descripción</span>
              <small>Visible para todos los usuarios conectados</small>
              <textarea
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Hey ahí estoy usando Chat"
                maxLength={140}
              />
            </label>

            <label>
              <span>Correo</span>
              <small>Visible en tu perfil</small>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="correo@ejemplo.com"
              />
            </label>

            <label>
              <span>Contraseña</span>
              <small>Cámbiala solo desde el servidor; aquí no se modifica</small>
              <input
                type="password"
                value={password ? "••••••••" : ""}
                disabled
                readOnly
                placeholder="••••••••"
              />
            </label>

            {saved ? <p className="profile-saved">Cambios guardados</p> : null}

            <button type="submit" className="profile-save-btn">
              Guardar cambios
            </button>
          </form>

          <button type="button" className="profile-logout-btn" onClick={onLogout}>
            Cerrar sesión
          </button>
        </>
      )}
    </div>
  );
}
