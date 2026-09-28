import { getInitials, getNameColor } from "../utils/avatar";

export default function TypingBubble({
  from,
  avatarUrl = "",
  showAuthor = false,
}) {
  const author = from || "alguien";
  const authorColor = getNameColor(author);

  return (
    <div className="bubble-row typing-row" aria-live="polite" aria-label={`${author} está escribiendo`}>
      {avatarUrl ? (
        <img className="bubble-avatar photo" src={avatarUrl} alt="" />
      ) : (
        <span
          className="bubble-avatar"
          style={{ background: authorColor }}
          aria-hidden="true"
        >
          {getInitials(author)}
        </span>
      )}

      <article className="bubble typing-bubble">
        {showAuthor ? (
          <header className="bubble-head">
            <span className="bubble-author group" style={{ color: authorColor }}>
              {author}
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
