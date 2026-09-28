export default function SystemNotice({ message }) {
  const text = message?.message || "";
  if (!text) return null;

  return (
    <div className="system-notice" role="status">
      <span>{text}</span>
    </div>
  );
}
