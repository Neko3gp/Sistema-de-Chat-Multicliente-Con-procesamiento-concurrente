import AuthLayout from "../components/AuthLayout";

export default function Login({ onSubmit, onGoRegister, error }) {
  function handleSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit(data.get("identifier").trim(), data.get("password"));
  }

  return (
    <AuthLayout title="Entra y conversa al instante con quien esté conectado">
      <form className="auth-card" onSubmit={handleSubmit}>
        <p className="auth-brand">Chat paralelo</p>
        <h1>Iniciar sesión</h1>
        <p className="auth-subtitle">Entra al chat multicliente</p>

        <label>
          Usuario o correo
          <input
            name="identifier"
            type="text"
            required
            autoComplete="username"
            placeholder="Nombre o correo@uach.mx"
          />
        </label>

        <label>
          Contraseña
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Tu contraseña"
          />
        </label>

        {error ? <p className="auth-error">{error}</p> : null}

        <button type="submit">Entrar</button>
        <button type="button" className="linkish" onClick={onGoRegister}>
          Crear cuenta
        </button>
      </form>
    </AuthLayout>
  );
}
