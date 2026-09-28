import { FiFile } from "react-icons/fi";
import { getInitials, getNameColor } from "../utils/avatar";
import { buildFileDataUrl, getFileKind } from "../utils/files";

export default function FileMessage({ message, currentUser }) {
  const mine = message.from === currentUser;
  const isGroup = !message.to;
  const author = message.from || "sistema";
  const authorColor = getNameColor(author);
  const kind = getFileKind(message.filename, message.mimeType);
  const href = buildFileDataUrl(message.data, message.filename, message.mimeType);
  const time = new Date(message.at || Date.now()).toLocaleTimeString("es-MX", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className={mine ? "bubble-row mine" : "bubble-row"}>
      {!mine ? (
        <span
          className="bubble-avatar"
          style={{ background: authorColor }}
          aria-hidden="true"
        >
          {getInitials(author)}
        </span>
      ) : null}

      <article className={mine ? "bubble mine file" : "bubble file"}>
        {!mine ? (
          <header className="bubble-head">
            <span
              className={isGroup ? "bubble-author group" : "bubble-author"}
              style={{ color: authorColor }}
            >
              {author}
            </span>
            <span className="bubble-tag">
              {kind === "image" ? "imagen" : kind === "audio" ? "audio" : "documento"}
            </span>
          </header>
        ) : (
          <span className="bubble-tag">
            {kind === "image" ? "imagen" : kind === "audio" ? "audio" : "documento"}
          </span>
        )}

        {kind === "image" && href ? (
          <a className="file-image-wrap" href={href} target="_blank" rel="noreferrer">
            <img className="file-image" src={href} alt={message.filename || "imagen"} />
          </a>
        ) : null}

        {kind === "audio" && href ? (
          <audio className="file-audio" controls src={href}>
            Tu navegador no soporta audio.
          </audio>
        ) : null}

        {kind === "document" || !href ? (
          <div className="file-card">
            <span className="file-icon" aria-hidden="true">
              <FiFile size={20} />
            </span>
            {href ? (
              <a href={href} download={message.filename || "archivo"}>
                {message.filename || "Descargar archivo"}
              </a>
            ) : (
              <p className="bubble-text">{message.filename || "Archivo"}</p>
            )}
          </div>
        ) : (
          <div className="file-card compact">
            {href ? (
              <a href={href} download={message.filename || "archivo"}>
                {message.filename || "Descargar"}
              </a>
            ) : null}
          </div>
        )}

        <footer className="bubble-meta">
          <time>{time}</time>
          {mine ? (
            <span className="ticks" aria-hidden="true">
              ✓✓
            </span>
          ) : null}
        </footer>
      </article>
    </div>
  );
}
