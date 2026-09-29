import { getInitials, getNameColor } from "../../common/lib/avatar";

const MAX_VISIBLE_AVATARS = 3;

function TypingAvatar({ name, avatarUrl = "", index = 0 }) {
  const authorColor = getNameColor(name || "?");
  return avatarUrl ? (
    <img
      className="bubble-avatar photo typing-stack-avatar"
      src={avatarUrl}
      alt=""
      style={{ zIndex: MAX_VISIBLE_AVATARS - index }}
    />
  ) : (
    <span
      className="bubble-avatar typing-stack-avatar"
      style={{ background: authorColor, zIndex: MAX_VISIBLE_AVATARS - index }}
      aria-hidden="true"
    >
      {getInitials(name || "?")}
    </span>
  );
}

export default function TypingBubble({
  names = [],
  contacts = {},
  showAuthor = false,
}) {
  const people = (Array.isArray(names) ? names : []).filter(Boolean);
  if (people.length === 0) return null;

  const visible = people.slice(0, MAX_VISIBLE_AVATARS);
  const extra = people.length - visible.length;
  const label =
    people.length === 1
      ? `${people[0]} está escribiendo`
      : `${people.join(", ")} están escribiendo`;
  const authorColor = getNameColor(people[0]);

  return (
    <div className="bubble-row typing-row" aria-live="polite" aria-label={label}>
      <div
        className={
          people.length > 1 ? "typing-avatar-stack is-multi" : "typing-avatar-stack"
        }
      >
        {visible.map((name, index) => (
          <TypingAvatar
            key={name}
            name={name}
            avatarUrl={contacts[name]?.avatarUrl || ""}
            index={index}
          />
        ))}
        {extra > 0 ? (
          <span
            className="bubble-avatar typing-stack-avatar typing-stack-extra"
            style={{ zIndex: 0 }}
            aria-hidden="true"
          >
            +{extra}
          </span>
        ) : null}
      </div>

      <article className="bubble typing-bubble">
        {showAuthor ? (
          <header className="bubble-head">
            <span className="bubble-author group" style={{ color: authorColor }}>
              {people.length === 1
                ? people[0]
                : people.length === 2
                  ? `${people[0]} y ${people[1]}`
                  : `${people[0]} y ${people.length - 1} más`}
            </span>
          </header>
        ) : null}
        <div className="typing-bubble-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </article>
    </div>
  );
}
