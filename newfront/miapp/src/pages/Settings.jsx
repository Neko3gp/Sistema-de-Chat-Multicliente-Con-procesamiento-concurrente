export default function Settings({
  themePreference,
  resolvedTheme,
  onThemeChange,
  onOpenProfile,
  onBack,
}) {
  const options = [
    {
      id: "system",
      title: "Automático",
      subtitle: "Sigue el tema del celular",
      preview: "system",
    },
    {
      id: "dark",
      title: "Oscuro",
      subtitle: "Estilo chat clásico",
      preview: "dark",
    },
    {
      id: "light",
      title: "Claro",
      subtitle: "Fondos claros y buen contraste",
      preview: "light",
    },
    {
      id: "uach-light",
      title: "UACH claro",
      subtitle: "Morado y oro sobre blanco",
      preview: "uach-light",
    },
    {
      id: "uach-dark",
      title: "UACH oscuro",
      subtitle: "Morado y oro sobre negro",
      preview: "uach-dark",
    },
  ];

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
          Por defecto Automático sigue el modo del celular. También puedes fijar
          uno manual.
          {themePreference === "system"
            ? ` Ahora: ${resolvedTheme === "light" ? "claro" : "oscuro"}.`
            : ""}
        </p>

        <div className="theme-options">
          {options.map((option) => (
            <label
              key={option.id}
              className={
                themePreference === option.id ? "theme-card active" : "theme-card"
              }
            >
              <input
                type="radio"
                name="theme"
                value={option.id}
                checked={themePreference === option.id}
                onChange={() => onThemeChange(option.id)}
              />
              <span
                className={`theme-preview ${option.preview}`}
                aria-hidden="true"
              />
              <span className="theme-card-text">
                <strong>{option.title}</strong>
                <small>{option.subtitle}</small>
              </span>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
