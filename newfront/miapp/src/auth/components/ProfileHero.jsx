/**
 * Hero de perfil/grupo: foto grande (o iniciales) y contenido debajo.
 */
import { getInitials } from "../../common/lib/avatar";

export default function ProfileHero({
  name = "?",
  avatarUrl = "",
  avatarAlt = "",
  color,
  editButton = null,
  belowPhoto = null,
  children = null,
}) {
  const label = name || "?";

  return (
    <section className="profile-hero">
      <div className="profile-photo-wrap">
        <div className="profile-photo-frame">
          {avatarUrl ? (
            <img
              className="profile-photo"
              src={avatarUrl}
              alt={avatarAlt || label}
            />
          ) : (
            <div
              className="profile-photo placeholder"
              style={color ? { background: color } : undefined}
            >
              {getInitials(label)}
            </div>
          )}
          {editButton}
        </div>
        {belowPhoto}
      </div>
      {children}
    </section>
  );
}
