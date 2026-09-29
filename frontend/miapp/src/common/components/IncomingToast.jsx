import { useEffect, useRef } from "react";
import { getInitials, getNameColor } from "../lib/avatar";
import { playNotificationSound } from "../lib/notificationSound";

const AUTO_HIDE_MS = 4800;

export default function IncomingToast({ toast, onOpen, onDismiss }) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const lastSoundIdRef = useRef(null);

  useEffect(() => {
    if (!toast) return undefined;
    const id = toast.id;
    if (lastSoundIdRef.current !== id) {
      lastSoundIdRef.current = id;
      playNotificationSound();
    }
    const timer = window.setTimeout(() => {
      onDismissRef.current?.(id);
    }, AUTO_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  const name = toast.from || toast.chatLabel || "Contacto";
  const color = getNameColor(name);

  return (
    <div className="incoming-toast-host" role="status" aria-live="polite">
      <div className="incoming-toast">
        <button
          type="button"
          className="incoming-toast-main"
          onClick={() => onOpen?.(toast)}
        >
          {toast.avatarUrl ? (
            <img
              className="incoming-toast-avatar"
              src={toast.avatarUrl}
              alt=""
            />
          ) : (
            <span
              className="incoming-toast-avatar initials"
              style={{ background: color }}
              aria-hidden="true"
            >
              {getInitials(name)}
            </span>
          )}

          <span className="incoming-toast-body">
            <span className="incoming-toast-name">{name}</span>
            {toast.context ? (
              <span className="incoming-toast-context">{toast.context}</span>
            ) : null}
            <span className="incoming-toast-preview">{toast.preview}</span>
          </span>
        </button>

        <button
          type="button"
          className="incoming-toast-close"
          aria-label="Cerrar notificación"
          onClick={() => onDismiss?.(toast.id)}
        >
          ×
        </button>
      </div>
    </div>
  );
}
