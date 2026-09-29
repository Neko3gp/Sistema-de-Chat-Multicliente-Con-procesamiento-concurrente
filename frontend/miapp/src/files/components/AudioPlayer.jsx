import { useEffect, useRef, useState } from "react";
import { FiMusic, FiPause, FiPlay } from "react-icons/fi";
import { buildFileBlobUrl, revokeBlobUrl } from "../lib/files";

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function waveHeights(seed = "audio", count = 28) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const heights = [];
  for (let i = 0; i < count; i += 1) {
    hash = (hash * 1103515245 + 12345) >>> 0;
    const n = (hash % 70) / 100;
    heights.push(0.28 + n);
  }
  return heights;
}

function pauseOtherAudios(current) {
  document.querySelectorAll("audio").forEach((el) => {
    if (el !== current && !el.paused) {
      el.pause();
    }
  });
}

export default function AudioPlayer({
  src,
  data,
  mimeType = "",
  filename = "audio",
  autoPlay = false,
  compact = false,
}) {
  const audioRef = useRef(null);
  const [objectUrl, setObjectUrl] = useState(src || null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");
  const bars = waveHeights(filename, compact ? 18 : 32);

  useEffect(() => {
    if (src) {
      setObjectUrl(src);
      return undefined;
    }
    if (!data) {
      setObjectUrl(null);
      return undefined;
    }
    const url = buildFileBlobUrl(data, filename, mimeType);
    setObjectUrl(url);
    return () => revokeBlobUrl(url);
  }, [src, data, filename, mimeType]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !objectUrl) return undefined;

    setError("");
    setCurrent(0);
    setDuration(0);
    setPlaying(false);
    audio.load();

    function onTime() {
      setCurrent(audio.currentTime || 0);
    }
    function onMeta() {
      if (Number.isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    }
    function onPlay() {
      pauseOtherAudios(audio);
      setPlaying(true);
      setError("");
    }
    function onPause() {
      setPlaying(false);
    }
    function onEnded() {
      setPlaying(false);
      setCurrent(0);
    }
    function onAudioError() {
      setPlaying(false);
      setError("No se pudo reproducir este audio en el dispositivo");
    }

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("durationchange", onMeta);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onAudioError);

    if (autoPlay) {
      pauseOtherAudios(audio);
      audio.play().catch(() => {
        setError("Toca play para escuchar");
      });
    }

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("durationchange", onMeta);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onAudioError);
    };
  }, [objectUrl, autoPlay]);

  const progress = duration > 0 ? Math.min(1, current / duration) : 0;

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      pauseOtherAudios(audio);
      audio.play().catch(() => {
        setError("No se pudo reproducir este audio en el dispositivo");
      });
    } else {
      audio.pause();
    }
  }

  function seek(event) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width),
    );
    audio.currentTime = ratio * duration;
    setCurrent(audio.currentTime);
  }

  return (
    <div
      className={
        compact ? "audio-player audio-player--compact" : "audio-player"
      }
    >
      <audio
        ref={audioRef}
        src={objectUrl || undefined}
        preload="metadata"
        playsInline
      />

      {!compact ? (
        <div className="audio-player-hero" aria-hidden="true">
          <span className={`audio-player-orb${playing ? " is-playing" : ""}`}>
            <FiMusic size={36} />
          </span>
          <div className="audio-player-glow" />
        </div>
      ) : null}

      {!compact ? (
        <div className="audio-player-meta">
          <strong title={filename}>{filename}</strong>
          <small>Nota de audio</small>
        </div>
      ) : null}

      <div className="audio-player-controls">
        <button
          type="button"
          className="audio-player-play"
          onClick={togglePlay}
          aria-label={playing ? "Pausar" : "Reproducir"}
          disabled={!objectUrl}
        >
          {playing ? (
            <FiPause size={compact ? 18 : 22} aria-hidden="true" />
          ) : (
            <FiPlay size={compact ? 18 : 22} aria-hidden="true" />
          )}
        </button>

        <div className="audio-player-track">
          <button
            type="button"
            className={`audio-player-wave${playing ? " is-playing" : ""}`}
            onClick={seek}
            aria-label="Barra de progreso"
          >
            {bars.map((h, i) => {
              const filled = i / bars.length <= progress;
              return (
                <span
                  key={`${h}-${i}`}
                  className={filled ? "is-filled" : undefined}
                  style={{
                    "--bar-h": `${Math.round(h * 100)}%`,
                    animationDelay: `${i * 40}ms`,
                  }}
                />
              );
            })}
          </button>
          <div className="audio-player-times">
            <span>{formatTime(current)}</span>
            <span>{formatTime(duration)}</span>
          </div>
          {error ? <p className="audio-player-error">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
