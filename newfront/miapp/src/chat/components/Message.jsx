import { getInitials, getNameColor } from "../../common/lib/avatar";
import MessageStatus from "./MessageStatus.jsx";

function isEmojiHeavy(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  const withoutEmoji = value
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\uFE0F\u200D]/g, "")
    .trim();
  return withoutEmoji.length === 0 && [...value].length <= 8;
}

export default function Message({ message, currentUser, avatarUrl = "" }) {
  const mine = message.from === currentUser;
  const isPrivate = message.type === "private_message";
  const isGroup =
    message.type === "broadcast" || message.type === "group_message";
  const author = message.from || "sistema";
  const authorColor = getNameColor(author);
  const emojiHeavy = isEmojiHeavy(message.message);
  const time = new Date(message.at || Date.now()).toLocaleTimeString("es-MX", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className={mine ? "bubble-row mine" : "bubble-row"}>
      {!mine ? (
        avatarUrl ? (
          <img className="bubble-avatar photo" src={avatarUrl} alt="" />
        ) : (
          <span
            className="bubble-avatar"
            style={{ background: authorColor }}
            aria-hidden="true"
          >
            {getInitials(author)}
          </span>
        )
      ) : null}

      <article className={mine ? "bubble mine" : "bubble"}>
        {!mine ? (
          <header className="bubble-head">
            <span
              className={isGroup ? "bubble-author group" : "bubble-author"}
              style={{ color: authorColor }}
            >
              {author}
            </span>
            {isPrivate ? <span className="bubble-tag">privado</span> : null}
          </header>
        ) : null}

        <p className={emojiHeavy ? "bubble-text emoji-heavy" : "bubble-text"}>
          {message.message}
        </p>
        <footer className="bubble-meta">
          <time>{time}</time>
          <MessageStatus status={message.status} mine={mine} />
        </footer>
      </article>
    </div>
  );
}
