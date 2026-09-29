/**
 * Marca visual compartida: logo de chat + texto opcional.
 */
export default function BrandMark({
  label = "Chat paralelo",
  className = "",
  logoClassName = "",
  labelClassName = "",
  as: Tag = "span",
}) {
  return (
    <Tag className={`brand-mark ${className}`.trim()}>
      <img
        className={`brand-mark-logo ${logoClassName}`.trim()}
        src="/favicon.svg"
        alt=""
        width={28}
        height={28}
        decoding="async"
      />
      {label != null && label !== false ? (
        <span className={`brand-mark-label ${labelClassName}`.trim()}>{label}</span>
      ) : null}
    </Tag>
  );
}
