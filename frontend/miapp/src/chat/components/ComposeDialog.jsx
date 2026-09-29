/**
 * Cáscara común de los diálogos de composición (backdrop, título, cerrar).
 */
import { FiX } from "react-icons/fi";

export default function ComposeDialog({
  title,
  ariaLabel,
  onClose,
  children,
  footer = null,
  autoCloseOnBackdrop = true,
}) {
  return (
    <div
      className="confirm-dialog-backdrop"
      role="presentation"
      onClick={autoCloseOnBackdrop ? onClose : undefined}
    >
      <div
        className="confirm-dialog compose-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="new-chat-header">
          <h3>{title}</h3>
          <button
            type="button"
            className="field-edit-btn"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <FiX size={16} aria-hidden="true" />
          </button>
        </div>

        {children}

        {footer ? (
          <div className="confirm-dialog-actions">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
