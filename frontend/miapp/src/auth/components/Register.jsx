import AuthLayout from "./AuthLayout";
import BrandMark from "../../common/components/BrandMark";

export default function Register({ onSubmit, onGoLogin, error, success }) {
  function handleSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit(
      data.get("username").trim(),
      data.get("email").trim(),
      data.get("password"),
    );
  }

  return (
    <AuthLayout title="Crea tu cuenta y únete a la conversación en tiempo real">
      <form className="auth-card" onSubmit={handleSubmit}>
        <BrandMark className="auth-brand" as="p" />
        <h1>Registro</h1>
        <p className="auth-subtitle">Crea tu cuenta para chatear</p>

        <label>
          Usuario
          <input
            name="username"
            type="text"
            required
            autoComplete="username"
            placeholder="Tu nombre de usuario"
          />
        </label>

        <label>
          Correo
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="correo@ejemplo.com"
          />
        </label>

        <label>
          Contraseña
          <input
            name="password"
            type="password"
            required
            autoComplete="new-password"
            placeholder="Crea una contraseña"
          />
        </label>

        {error ? <p className="auth-error">{error}</p> : null}
        {success ? <p className="auth-success">{success}</p> : null}

        <button type="submit">Registrarme</button>
        <button type="button" className="linkish" onClick={onGoLogin}>
          Ya tengo cuenta
        </button>
      </form>
    </AuthLayout>
  );
}
