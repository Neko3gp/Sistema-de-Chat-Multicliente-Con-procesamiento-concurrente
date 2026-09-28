import { useMemo, useState } from "react";
import { FiFile } from "react-icons/fi";
import { getInitials, getNameColor } from "../utils/avatar";
import { buildFileDataUrl, getFileKind } from "../utils/files";
import AudioPlayer from "./AudioPlayer";
import MessageStatus from "./MessageStatus";
import FilePreview from "./FilePreview";

export default function FileMessage({ message, currentUser, avatarUrl = "" }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const mine = message.from === currentUser;
  const isGroup = !message.to;
  const author = message.from || "sistema";
  const authorColor = getNameColor(author);
  const filename = message.filename || "archivo";
  const kind = getFileKind(filename, message.mimeType);
  // Notas de voz: blob dentro de AudioPlayer (más fiable y liviano).
  const href = useMemo(() => {
    if (kind === "audio") return null;
    return buildFileDataUrl(message.data, filename, message.mimeType);
  }, [kind, message.data, filename, message.mimeType]);
  const time = new Date(message.at || Date.now()).toLocaleTimeString("es-MX", {
    hour: "numeric",
    minute: "2-digit",
  });

  function openPreview(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!message.data && !href) return;
    document.querySelectorAll("audio").forEach((el) => {
      if (!el.paused) el.pause();
    });
    setPreviewOpen(true);
  }

  return (
    <>
      <div className={mine ? "bubble-row mine" : "bubble-row"}>
        {!mine ? (
          avatarUrl ? (
            <img className="bubble-avatar photo" src={avatarUrl} alt="" />
          ) : (
            <span
              className="bubble-avatar"
              style={{ background: authorColor }}
              aria-hidden="true"
            >
              {getInitials(author)}
            </span>
          )
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
                {kind === "image"
                  ? "imagen"
                  : kind === "audio"
                    ? "audio"
                    : "documento"}
              </span>
            </header>
          ) : (
            <span className="bubble-tag">
              {kind === "image"
                ? "imagen"
                : kind === "audio"
                  ? "audio"
                  : "documento"}
            </span>
          )}

          {kind === "image" && href ? (
            <button
              type="button"
              className="file-image-wrap"
              onClick={openPreview}
              aria-label={`Ver ${filename}`}
            >
              <img className="file-image" src={href} alt={filename} />
            </button>
          ) : null}

          {kind === "audio" && message.data ? (
            <div className="file-audio-block">
              <AudioPlayer
                data={message.data}
                mimeType={message.mimeType || ""}
                filename={filename}
                compact
              />
              <button
                type="button"
                className="file-open-preview"
                onClick={openPreview}
              >
                Ampliar / descargar
              </button>
            </div>
          ) : null}

          {kind === "document" || (!href && kind !== "audio") ? (
            <button
              type="button"
              className="file-card"
              onClick={openPreview}
              disabled={!message.data && !href}
            >
              <span className="file-icon" aria-hidden="true">
                <FiFile size={20} />
              </span>
              <span className="file-card-text">
                <strong>{filename}</strong>
                <small>
                  {message.data || href
                    ? "Toca para ver / descargar"
                    : "Archivo no disponible"}
                </small>
              </span>
            </button>
          ) : kind === "image" ? (
            <button
              type="button"
              className="file-open-preview"
              onClick={openPreview}
            >
              {filename}
            </button>
          ) : null}

          <footer className="bubble-meta">
            <time>{time}</time>
            <MessageStatus status={message.status} mine={mine} />
          </footer>
        </article>
      </div>

      <FilePreview
        open={previewOpen}
        href={href}
        data={message.data}
        filename={filename}
        mimeType={message.mimeType || ""}
        kind={kind}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  );
}
