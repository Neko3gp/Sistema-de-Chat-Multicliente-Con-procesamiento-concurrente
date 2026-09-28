export default function Settings({
  theme,
  onThemeChange,
  onOpenProfile,
  onBack,
}) {
  return (
    <div className="settings-page">
      <header className="settings-topbar">
        <button type="button" className="back-btn" onClick={onBack} aria-label="Volver">
          ←
        </button>
        <h1>Configuración</h1>
      </header>

      <section className="settings-section">
        <h2>Perfil</h2>
        <p className="settings-section-desc">
          Edita tu foto, nombre, correo y descripción
        </p>
        <button type="button" className="settings-row" onClick={onOpenProfile}>
          <span className="settings-row-icon">👤</span>
          <span className="settings-row-text">
            <strong>Mi perfil</strong>
            <small>Nombre, foto, correo y contraseña</small>
          </span>
          <span className="settings-row-chevron">›</span>
        </button>
      </section>

      <section className="settings-section">
        <h2>Temas</h2>
        <p className="settings-section-desc">
          Elige la apariencia de la aplicación
        </p>

        <div className="theme-options">
          <label className={theme === "dark" ? "theme-card active" : "theme-card"}>
            <input
              type="radio"
              name="theme"
              value="dark"
              checked={theme === "dark"}
              onChange={() => onThemeChange("dark")}
            />
            <span className="theme-preview dark" aria-hidden="true" />
            <span className="theme-card-text">
              <strong>Oscuro</strong>
              <small>Estilo chat clásico</small>
            </span>
          </label>

          <label className={theme === "light" ? "theme-card active" : "theme-card"}>
            <input
              type="radio"
              name="theme"
              value="light"
              checked={theme === "light"}
              onChange={() => onThemeChange("light")}
            />
            <span className="theme-preview light" aria-hidden="true" />
            <span className="theme-card-text">
              <strong>Claro</strong>
              <small>Fondos claros y contraste suave</small>
            </span>
          </label>

          <label className={theme === "midnight" ? "theme-card active" : "theme-card"}>
            <input
              type="radio"
              name="theme"
              value="midnight"
              checked={theme === "midnight"}
              onChange={() => onThemeChange("midnight")}
            />
            <span className="theme-preview midnight" aria-hidden="true" />
            <span className="theme-card-text">
              <strong>Medianoche</strong>
              <small>Azul profundo con acentos</small>
            </span>
          </label>
        </div>
      </section>
    </div>
  );
}
