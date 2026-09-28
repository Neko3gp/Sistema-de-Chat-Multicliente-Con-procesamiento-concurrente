import { useEffect, useRef, useState } from "react";
import { FiBell } from "react-icons/fi";

function formatNotifTime(at) {
  if (!at) return "";
  const date = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-MX", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function NotificationTray({
  items = [],
  totalUnread = 0,
  groupName = "Sala general",
  onOpenChat,
  onMarkAllRead,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const unreadItems = items.filter((item) => !item.read);

  function labelFor(item) {
    if (item.chatKey === "__broadcast__") return groupName;
    return item.chatLabel || item.from || "Chat";
  }

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button
        type="button"
        className="icon-btn notif-bell"
        title="Notificaciones"
        aria-label="Bandeja de notificaciones"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <FiBell size={18} aria-hidden="true" />
        {totalUnread > 0 ? (
          <span className="notif-badge">{totalUnread > 99 ? "99+" : totalUnread}</span>
        ) : null}
      </button>

      {open ? (
        <div className="notif-tray" role="dialog" aria-label="Notificaciones">
          <header className="notif-tray-head">
            <strong>Notificaciones</strong>
            {unreadItems.length > 0 ? (
              <button
                type="button"
                className="notif-mark-all"
                onClick={() => {
                  onMarkAllRead?.();
                }}
              >
                Marcar leídas
              </button>
            ) : null}
          </header>

          {unreadItems.length === 0 ? (
            <p className="notif-empty">Sin mensajes sin leer</p>
          ) : (
            <ul className="notif-list">
              {unreadItems.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="notif-item"
                    onClick={() => {
                      onOpenChat?.(item);
                      setOpen(false);
                    }}
                  >
                    <span className="notif-item-title">{labelFor(item)}</span>
                    <span className="notif-item-preview">{item.preview}</span>
                    <span className="notif-item-time">
                      {formatNotifTime(item.at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
