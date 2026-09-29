import BrandMark from "../../common/components/BrandMark";

export default function AuthLayout({ children, title }) {
  return (
    <div className="auth-screen">
      <div className="auth-panel">{children}</div>
      <aside className="auth-visual" aria-hidden="true">
        <img
          className="auth-visual-image"
          src="/auth-hero.png"
          alt=""
        />
        <div className="auth-visual-overlay">
          <BrandMark className="auth-visual-brand" />
          <p className="auth-visual-copy">
            {title || "Mensajes en tiempo real entre múltiples usuarios"}
          </p>
        </div>
      </aside>
    </div>
  );
}
