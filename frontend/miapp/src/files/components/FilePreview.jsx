import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiDownload, FiFile, FiX } from "react-icons/fi";
import {
  buildFileBlobUrl,
  isPdfFile,
  revokeBlobUrl,
} from "../lib/files";
import AudioPlayer from "./AudioPlayer";
import PdfScrollViewer from "./PdfScrollViewer";

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function touchDistance(touches) {
  if (!touches || touches.length < 2) return 0;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

export default function FilePreview({
  open,
  href,
  data,
  filename = "archivo",
  mimeType = "",
  kind = "document",
  onClose,
}) {
  const pdf = kind === "document" && isPdfFile(filename, mimeType);
  const [blobUrl, setBlobUrl] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const stageRef = useRef(null);
  const zoomRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const pinchRef = useRef(null);
  const panRef = useRef(null);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(() => {
    if (!open) {
      setBlobUrl(null);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      return undefined;
    }
    const url = data
      ? buildFileBlobUrl(data, filename, mimeType)
      : href || null;
    setBlobUrl(url);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    return () => {
      if (url && url !== href) revokeBlobUrl(url);
    };
  }, [open, data, filename, mimeType, href]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Listeners nativos no-passive: necesarios para pellizco en iOS/PWA.
  useEffect(() => {
    if (!open || kind !== "image") return undefined;
    const el = stageRef.current;
    if (!el) return undefined;

    function onTouchStart(event) {
      if (event.touches.length === 2) {
        pinchRef.current = {
          startDistance: touchDistance(event.touches),
          startZoom: zoomRef.current,
        };
        panRef.current = null;
        return;
      }
      if (event.touches.length === 1 && zoomRef.current > 1) {
        panRef.current = {
          startX: event.touches[0].clientX,
          startY: event.touches[0].clientY,
          originX: offsetRef.current.x,
          originY: offsetRef.current.y,
        };
      }
    }

    function onTouchMove(event) {
      if (event.touches.length === 2 && pinchRef.current?.startDistance) {
        event.preventDefault();
        const ratio =
          touchDistance(event.touches) / pinchRef.current.startDistance;
        setZoom(clampZoom(pinchRef.current.startZoom * ratio));
        return;
      }
      if (event.touches.length === 1 && panRef.current && zoomRef.current > 1) {
        event.preventDefault();
        const touch = event.touches[0];
        setOffset({
          x: panRef.current.originX + (touch.clientX - panRef.current.startX),
          y: panRef.current.originY + (touch.clientY - panRef.current.startY),
        });
      }
    }

    function onTouchEnd(event) {
      if (event.touches.length < 2) pinchRef.current = null;
      if (event.touches.length === 0) {
        panRef.current = null;
        if (zoomRef.current <= 1.02) {
          setZoom(1);
          setOffset({ x: 0, y: 0 });
        }
      }
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [open, kind]);

  const downloadUrl = blobUrl || href;

  function onWheel(event) {
    if (kind !== "image") return;
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.12 : -0.12;
    setZoom((current) => {
      const next = clampZoom(current + delta);
      if (next <= 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  }

  function onDoubleClick() {
    if (kind !== "image") return;
    if (zoom > 1) {
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    } else {
      setZoom(2);
    }
  }

  if (!open || (!downloadUrl && !data)) return null;

  return createPortal(
    <div
      className="file-preview-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="file-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Vista previa de ${filename}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="file-preview-topbar">
          <div className="file-preview-title">
            <strong title={filename}>{filename}</strong>
            <small>
              {kind === "image"
                ? "Imagen · pellizca para zoom"
                : kind === "audio"
                  ? "Audio · reproducir"
                  : pdf
                    ? "PDF · pellizca para zoom"
                    : "Documento"}
            </small>
          </div>
          <div className="file-preview-actions">
            {downloadUrl ? (
              <a
                className="btn-primary file-preview-download"
                href={downloadUrl}
                download={filename || "archivo"}
              >
                <FiDownload size={16} aria-hidden="true" />
                Descargar
              </a>
            ) : null}
            <button
              type="button"
              className="field-edit-btn"
              onClick={onClose}
              aria-label="Cerrar vista previa"
            >
              <FiX size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div
          className={
            kind === "image"
              ? "file-preview-body file-preview-body--image"
              : pdf
                ? "file-preview-body file-preview-body--pdf"
                : kind === "audio"
                  ? "file-preview-body file-preview-body--audio"
                  : "file-preview-body"
          }
        >
          {kind === "image" && downloadUrl ? (
            <div
              ref={stageRef}
              className="file-preview-image-stage"
              onWheel={onWheel}
              onDoubleClick={onDoubleClick}
            >
              <img
                className="file-preview-image"
                src={downloadUrl}
                alt={filename}
                style={{
                  transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`,
                }}
                draggable={false}
              />
            </div>
          ) : null}

          {kind === "audio" && downloadUrl ? (
            <div className="file-preview-audio-wrap">
              <AudioPlayer
                src={downloadUrl}
                data={data}
                mimeType={mimeType}
                filename={filename}
                autoPlay
              />
            </div>
          ) : null}

          {pdf && data ? (
            <PdfScrollViewer data={data} filename={filename} />
          ) : null}

          {kind === "document" && !pdf ? (
            <div className="file-preview-fallback">
              <span className="file-preview-fallback-icon" aria-hidden="true">
                <FiFile size={42} />
              </span>
              <p>{filename}</p>
              <small>No hay vista previa para este tipo de archivo.</small>
              {downloadUrl ? (
                <a
                  className="btn-primary"
                  href={downloadUrl}
                  download={filename || "archivo"}
                >
                  <FiDownload size={16} aria-hidden="true" />
                  Descargar
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
