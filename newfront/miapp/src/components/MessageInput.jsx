import { useRef, useState } from "react";
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

export default function MessageInput({ selectedUser, onSend, onSendFile }) {
  const [text, setText] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedType, setSelectedType] = useState("image");
  const fileRef = useRef(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

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

    const kind = getFileKind(file.name, file.type);
    if (kind !== selectedType) {
      setError(
        `Selecciona un archivo de tipo ${FILE_TYPES[selectedType].label.toLowerCase()}`,
      );
      setPendingFile(null);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setPendingFile(file);
    setPickerOpen(false);
  }

  function clearFile() {
    setPendingFile(null);
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function chooseType(type) {
    setSelectedType(type);
    setError("");
    setTimeout(() => fileRef.current?.click(), 0);
  }

  const kind = pendingFile ? getFileKind(pendingFile.name, pendingFile.type) : null;
  const accept = FILE_TYPES[selectedType].accept;

  return (
    <form className="message-input" onSubmit={handleSubmit}>
      <input
        ref={fileRef}
        className="file-picker"
        type="file"
        accept={accept}
        onChange={handleFileChange}
      />

      <div className="attach-wrap">
        <button
          type="button"
          className="attach-btn"
          title="Adjuntar archivo"
          aria-label="Adjuntar archivo"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((open) => !open)}
          disabled={sending}
        >
          <FiPaperclip size={18} aria-hidden="true" />
        </button>

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
      </div>

      <div className="message-input-main">
        {pendingFile ? (
          <div className="pending-file">
            <span className="pending-file-label">
              <KindIcon kind={kind} />
              {pendingFile.name}
            </span>
            <button type="button" onClick={clearFile} aria-label="Quitar archivo">
              <FiX size={16} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <input
            type="text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={
              selectedUser
                ? `Mensaje privado a ${selectedUser}...`
                : "Mensaje para todos..."
            }
            disabled={sending}
            onFocus={() => setPickerOpen(false)}
          />
        )}
        {error ? <p className="input-error">{error}</p> : null}
      </div>

      <button type="submit" disabled={sending || (!text.trim() && !pendingFile)}>
        {sending ? "..." : "Enviar"}
      </button>
    </form>
  );
}
