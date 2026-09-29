/**
 * Barra superior compartida: botón atrás + título.
 * variant "profile" | "settings" conserva las clases CSS actuales.
 */
export default function PageTopBar({ title, onBack, variant = "profile" }) {
  const className =
    variant === "settings" ? "settings-topbar" : "profile-topbar";

  return (
    <header className={className}>
      <button
        type="button"
        className="back-btn"
        onClick={onBack}
        aria-label="Volver"
      >
        ←
      </button>
      <h1>{title}</h1>
    </header>
  );
}
