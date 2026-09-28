import { statusLabel } from "../utils/messageStatus";

export default function MessageStatus({ status, mine }) {
  if (!mine) return null;

  const label = statusLabel(status);
  let ticks = "✓";
  let className = "ticks sent";

  if (status === "delivered") {
    ticks = "✓✓";
    className = "ticks delivered";
  } else if (status === "seen") {
    ticks = "✓✓";
    className = "ticks seen";
  } else if (status === "failed") {
    ticks = "!";
    className = "ticks failed";
  } else if (status === "pending") {
    ticks = "○";
    className = "ticks pending";
  } else if (status === "sent") {
    ticks = "✓";
    className = "ticks sent";
  }

  return (
    <span className={className} title={label} aria-label={label}>
      {ticks}
    </span>
  );
}
