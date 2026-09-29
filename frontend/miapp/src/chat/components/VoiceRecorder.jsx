import { useEffect, useRef, useState } from "react";
import { FiMic, FiSend, FiSquare, FiTrash2 } from "react-icons/fi";
import { MAX_FILE_BYTES } from "../../files/lib/files";

const MAX_SECONDS = 120;
const FORMATS = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"];

export default function VoiceRecorder({ onSend, onClose }) {
  const [phase, setPhase] = useState("idle");
  const [seconds, setSeconds] = useState(0);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const resources = useRef({ alive: false, busy: false, stream: null, recorder: null, timer: null, url: null });

  function releaseCapture() {
    const current = resources.current;
    clearInterval(current.timer);
    current.stream?.getTracks().forEach((track) => track.stop());
    current.stream = null;
  }

  useEffect(() => {
    const current = resources.current;
    current.alive = true;
    return () => {
      current.alive = false;
      if (current.recorder) {
        current.recorder.onstop = null;
        current.recorder.ondataavailable = null;
        current.recorder.onerror = null;
        if (current.recorder.state !== "inactive") current.recorder.stop();
      }
      clearInterval(current.timer);
      current.stream?.getTracks().forEach((track) => track.stop());
      if (current.url) URL.revokeObjectURL(current.url);
    };
  }, []);

  function stop() {
    const recorder = resources.current.recorder;
    if (recorder?.state === "recording") {
      setPhase("finishing");
      recorder.stop();
      releaseCapture();
    }
  }

  async function start() {
    const current = resources.current;
    if (current.busy) return;
    setError("");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("El micrófono necesita HTTPS o localhost. Si entras desde otro equipo por una IP con HTTP, puedes adjuntar un audio existente.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setError("Este navegador no permite grabar audio. Puedes adjuntar una grabación existente.");
      return;
    }
    current.busy = true;
    setPhase("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!current.alive) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      current.stream = stream;
      const mimeType = FORMATS.find((format) => MediaRecorder.isTypeSupported(format));
      const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64000 });
      current.recorder = recorder;
      const chunks = [];
      let size = 0;
      recorder.ondataavailable = (event) => {
        if (!current.alive || !event.data.size) return;
        size += event.data.size;
        if (size <= MAX_FILE_BYTES) chunks.push(event.data);
        else stop();
      };
      recorder.onstop = () => {
        releaseCapture();
        current.busy = false;
        if (!current.alive) return;
        if (size > MAX_FILE_BYTES || !size) {
          setError(size ? "La grabación superó 5 MiB. Graba una nota más corta." : "No se capturó audio. Intenta de nuevo.");
          setPhase("idle");
          return;
        }
        const type = recorder.mimeType || chunks[0]?.type || "audio/webm";
        const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const file = new File(chunks, `nota-de-voz-${Date.now()}.${extension}`, { type });
        current.url = URL.createObjectURL(file);
        setPreview({ file, url: current.url });
        setPhase("preview");
      };
      recorder.onerror = () => {
        recorder.onstop = null;
        if (recorder.state !== "inactive") recorder.stop();
        releaseCapture();
        current.busy = false;
        if (current.alive) {
          setError("Se interrumpió la grabación. Revisa el micrófono e intenta de nuevo.");
          setPhase("idle");
        }
      };
      stream.getAudioTracks().forEach((track) => { track.onended = stop; });
      recorder.start(500);
      setSeconds(0);
      setPhase("recording");
      const started = Date.now();
      current.timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000);
        setSeconds(Math.min(elapsed, MAX_SECONDS));
        if (elapsed >= MAX_SECONDS) stop();
      }, 250);
    } catch (err) {
      releaseCapture();
      current.busy = false;
      if (!current.alive) return;
      setPhase("idle");
      setError(err.name === "NotAllowedError" ? "Permiso de micrófono denegado. Puedes habilitarlo en los permisos del navegador." : err.name === "NotFoundError" ? "No se encontró un micrófono conectado." : "No se pudo abrir el micrófono. Revisa que esté disponible.");
    }
  }

  async function send() {
    if (!preview || resources.current.busy) return;
    resources.current.busy = true;
    setPhase("sending");
    setError("");
    try {
      await onSend(preview.file);
      if (resources.current.alive) onClose();
    } catch {
      if (resources.current.alive) {
        setError("No se pudo enviar la nota. Revisa la conexión e intenta de nuevo.");
        setPhase("preview");
      }
    } finally {
      resources.current.busy = false;
    }
  }

  return <section className="message-input voice-recorder" aria-label="Grabar nota de voz">
    <div className="voice-recorder-heading"><FiMic aria-hidden="true" /><strong>Nota de voz</strong><span>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")} / 2:00</span></div>
    <p role="status">{phase === "recording" ? "Grabando… Detén la grabación para escucharla antes de enviarla." : phase === "requesting" ? "Esperando permiso para usar el micrófono…" : phase === "finishing" ? "Preparando audio…" : phase === "sending" ? "Enviando nota…" : preview ? "Escucha tu nota y decide si quieres enviarla." : "Graba hasta 2 minutos. El audio se envía solo al pulsar Enviar."}</p>
    {preview ? <audio controls src={preview.url} preload="metadata" /> : null}
    {error ? <p className="input-error" role="alert">{error}</p> : null}
    <div className="voice-recorder-actions">
      <button type="button" onClick={onClose} disabled={phase === "sending"}><FiTrash2 aria-hidden="true" />Descartar</button>
      {phase === "idle" ? <button type="button" onClick={start}><FiMic aria-hidden="true" />Grabar</button> : null}
      {phase === "recording" ? <button type="button" onClick={stop}><FiSquare aria-hidden="true" />Detener</button> : null}
      {preview ? <button type="button" onClick={send} disabled={phase === "sending"}><FiSend aria-hidden="true" />{phase === "sending" ? "Enviando…" : "Enviar"}</button> : null}
    </div>
  </section>;
}
