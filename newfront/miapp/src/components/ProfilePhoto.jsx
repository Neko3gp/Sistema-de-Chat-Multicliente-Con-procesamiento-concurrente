import { useState } from "react";
import { getInitials, getNameColor } from "../utils/avatar";

/** Foto de perfil con fallback a iniciales si la URL falla o está vacía. */
export default function ProfilePhoto({
  name = "?",
  avatarUrl = "",
  className = "avatar",
}) {
  const [failed, setFailed] = useState(false);
  const showPhoto = Boolean(avatarUrl) && !failed;

  if (!showPhoto) {
    return (
      <span
        className={`${className} initials`}
        style={{ background: getNameColor(name) }}
        aria-hidden="true"
      >
        {getInitials(name)}
      </span>
    );
  }

  return (
    <img
      className={`${className} photo`}
      src={avatarUrl}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
