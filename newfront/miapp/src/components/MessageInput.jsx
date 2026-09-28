import { useEffect, useRef, useState } from "react";
import { FiFile, FiImage, FiMusic, FiPaperclip, FiX } from "react-icons/fi";
import { getFileKind } from "../utils/files";

const FILE_TYPES = {
  image: {
    label: "Imagen",
    Icon: FiImage,
    accept: "image/*",
  },
  audio: {
    label: "Audio",
    Icon: FiMusic,
    accept: "audio/*",
  },
  document: {
    label: "Documento",
    Icon: FiFile,
    accept: ".pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx,.zip,.rar",
  },
};

function KindIcon({ kind, size = 16 }) {
  if (kind === "image") return <FiImage size={size} aria-hidden="true" />;
  if (kind === "audio") return <FiMusic size={size} aria-hidden="true" />;
  return <FiFile size={size} aria-hidden="true" />;
}

function shortenFileName(name, max = 28) {
  if (!name || name.length <= max) return name;
  const extMatch = name.match(/(\.[^./\\]+)$/);
  const ext = extMatch ? extMatch[1] : "";
  const base = ext ? name.slice(0, -ext.length) : name;
  const keep = Math.max(8, max - ext.length - 1);
  return `${base.slice(0, keep)}…${ext}`;
}

export default function MessageInput({
  selectedUser,
  selectedGroupId = null,
  onSend,
  onSendFile,
  onTyping,
}) {
  const [text, setText] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedType, setSelectedType] = useState("image");
  const fileRef = useRef(null);
  const typingActiveRef = useRef(false);
  const typingTimerRef = useRef(null);

  function setTyping(active) {
    if (typingActiveRef.current === active) return;
    typingActiveRef.current = active;
    onTyping?.(active);
  }

  function stopTypingSoon() {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => setTyping(false), 1800);
  }

  function handleTextChange(event) {
    const value = event.target.value;
    setText(value);
    if (value.trim()) {
      setTyping(true);
      stopTypingSoon();
    } else {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      setTyping(false);
    }
  }

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (typingActiveRef.current) {
        typingActiveRef.current = false;
        onTyping?.(false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser, selectedGroupId]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    setTyping(false);

    if (pendingFile) {
      setSending(true);
      try {
        await onSendFile?.(pendingFile);
        setPendingFile(null);
        if (fileRef.current) fileRef.current.value = "";
      } catch (err) {
        setError(
          err?.message === "file_too_large"
            ? "El archivo supera 5 MiB"
            : err?.message === "user_not_found"
              ? "Ese usuario no está conectado"
              : err?.message?.includes("grupos")
                ? err.message
                : "No se pudo enviar el archivo",
        );
      } finally {
        setSending(false);
      }
      return;
    }

    const value = text.trim();
    if (!value) return;
    onSend(value);
    setText("");
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0] || null;
    setError("");

    if (!file) {
      setPendingFile(null);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("El archivo supera 5 MiB");
      setPendingFile(null);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setPendingFile(file);
  }

  function clearFile() {
    setPendingFile(null);
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function chooseType(type) {
    setSelectedType(type);
    setError("");
    setPickerOpen(false);
    setTimeout(() => fileRef.current?.click(), 0);
  }

  const kind = pendingFile ? getFileKind(pendingFile.name, pendingFile.type) : null;
  const accept = FILE_TYPES[selectedType].accept;
  const placeholder = selectedGroupId
    ? "Mensaje al grupo..."
    : selectedUser
      ? `Mensaje privado a ${selectedUser}...`
      : "Mensaje para todos...";

  return (
    <form className="message-input" onSubmit={handleSubmit}>
      <input
        ref={fileRef}
        className="file-picker"
        type="file"
        accept={accept}
        onChange={handleFileChange}
      />

      {pickerOpen ? (
        <div className="file-type-menu" role="menu">
          {Object.entries(FILE_TYPES).map(([type, config]) => {
            const Icon = config.Icon;
            return (
              <button
                key={type}
                type="button"
                role="menuitem"
                className={selectedType === type ? "active" : ""}
                onClick={() => chooseType(type)}
              >
                <Icon size={18} aria-hidden="true" />
                {config.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="message-input-row">
        <div className="attach-wrap">
          <button
            type="button"
            className="attach-btn"
            title="Adjuntar archivo"
            aria-label="Adjuntar archivo"
            onClick={() => setPickerOpen((open) => !open)}
            disabled={sending}
          >
            <FiPaperclip size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="message-input-main">
          {pendingFile ? (
            <div className="pending-file">
              <span className="pending-file-label">
                <KindIcon kind={kind} />
                <span className="pending-file-name" title={pendingFile.name}>
                  {shortenFileName(pendingFile.name)}
                </span>
              </span>
              <button type="button" onClick={clearFile} aria-label="Quitar archivo">
                <FiX size={16} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <input
              type="text"
              value={text}
              onChange={handleTextChange}
              placeholder={placeholder}
              disabled={sending}
              onFocus={() => {
                setPickerOpen(false);
                window.scrollTo(0, 0);
                requestAnimationFrame(() => window.scrollTo(0, 0));
              }}
              onBlur={() => {
                if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
                setTyping(false);
              }}
            />
          )}
          {error ? <p className="input-error">{error}</p> : null}
        </div>

        <button type="submit" disabled={sending || (!text.trim() && !pendingFile)}>
          {sending ? "..." : "Enviar"}
        </button>
      </div>
    </form>
  );
}
