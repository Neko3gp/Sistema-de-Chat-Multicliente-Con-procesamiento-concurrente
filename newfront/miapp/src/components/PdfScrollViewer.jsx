import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

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

export default function PdfScrollViewer({ data, filename = "documento.pdf" }) {
  const outerRef = useRef(null);
  const hostRef = useRef(null);
  const pdfDocRef = useRef(null);
  const zoomRef = useRef(1);
  const pinchRef = useRef(null);
  const renderTokenRef = useRef(0);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pinching, setPinching] = useState(false);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Zoom instantáneo vía CSS (sin volver a rasterizar el PDF).
  const applyZoomStyles = useCallback((scaleZoom) => {
    const host = hostRef.current;
    if (!host) return;
    host.querySelectorAll("canvas.pdf-page-canvas").forEach((canvas) => {
      const baseW = Number(canvas.dataset.baseW) || 0;
      const baseH = Number(canvas.dataset.baseH) || 0;
      if (!baseW || !baseH) return;
      canvas.style.width = `${Math.round(baseW * scaleZoom)}px`;
      canvas.style.height = `${Math.round(baseH * scaleZoom)}px`;
    });
  }, []);

  useEffect(() => {
    applyZoomStyles(zoom);
  }, [zoom, applyZoomStyles]);

  const renderPages = useCallback(async () => {
    const pdfDoc = pdfDocRef.current;
    const host = hostRef.current;
    const outer = outerRef.current;
    if (!pdfDoc || !host || !outer) return;

    const token = ++renderTokenRef.current;
    const displayWidth = Math.max(
      280,
      Math.floor((outer.clientWidth || window.innerWidth) - 24),
    );
    // Bitmap más denso para que el pellizco se vea nítido hasta ~2–3×.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const bitmapScale = dpr * 2;

    host.innerHTML = "";

    for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber += 1) {
      if (token !== renderTokenRef.current) return;
      const page = await pdfDoc.getPage(pageNumber);
      const unscaled = page.getViewport({ scale: 1 });
      const cssScale = displayWidth / unscaled.width;
      const viewport = page.getViewport({ scale: cssScale * bitmapScale });

      const cssW = displayWidth;
      const cssH = Math.round(unscaled.height * cssScale);

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { alpha: false });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.dataset.baseW = String(cssW);
      canvas.dataset.baseH = String(cssH);
      canvas.style.width = `${Math.round(cssW * zoomRef.current)}px`;
      canvas.style.height = `${Math.round(cssH * zoomRef.current)}px`;
      canvas.className = "pdf-page-canvas";
      canvas.setAttribute("aria-label", `${filename} · página ${pageNumber}`);
      host.appendChild(canvas);

      await page.render({
        canvasContext: context,
        viewport,
      }).promise;
    }
  }, [filename]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!data || !hostRef.current || !outerRef.current) return;
      setLoading(true);
      setError("");
      setZoom(1);
      hostRef.current.innerHTML = "";

      try {
        pdfDocRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      pdfDocRef.current = null;

      try {
        const binary = atob(data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }

        const pdfDoc = await pdfjs.getDocument({ data: bytes }).promise;
        if (cancelled) {
          pdfDoc.destroy();
          return;
        }
        pdfDocRef.current = pdfDoc;
        setPageCount(pdfDoc.numPages);
        await renderPages();
        if (!cancelled) setLoading(false);
      } catch {
        if (!cancelled) {
          setError("No se pudo mostrar el PDF en este dispositivo.");
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
      renderTokenRef.current += 1;
      try {
        pdfDocRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      pdfDocRef.current = null;
    };
  }, [data, renderPages]);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return undefined;

    function onTouchStart(event) {
      if (event.touches.length === 2) {
        pinchRef.current = {
          startDistance: touchDistance(event.touches),
          startZoom: zoomRef.current,
        };
        setPinching(true);
      }
    }

    function onTouchMove(event) {
      if (event.touches.length === 2 && pinchRef.current?.startDistance) {
        event.preventDefault();
        const next = clampZoom(
          pinchRef.current.startZoom *
            (touchDistance(event.touches) / pinchRef.current.startDistance),
        );
        zoomRef.current = next;
        applyZoomStyles(next);
        setZoom(next);
      }
    }

    function onTouchEnd(event) {
      if (event.touches.length < 2) {
        pinchRef.current = null;
        setPinching(false);
        if (zoomRef.current <= 1.02) {
          zoomRef.current = 1;
          applyZoomStyles(1);
          setZoom(1);
        }
      }
    }

    function onWheel(event) {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      const factor = event.deltaY > 0 ? 0.9 : 1.1;
      const next = clampZoom(zoomRef.current * factor);
      zoomRef.current = next;
      applyZoomStyles(next);
      setZoom(next);
      if (next <= 1) setPinching(false);
      else setPinching(true);
    }

    function onDoubleClick() {
      const next = zoomRef.current > 1 ? 1 : 2;
      zoomRef.current = next;
      applyZoomStyles(next);
      setZoom(next);
      setPinching(next > 1);
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("dblclick", onDoubleClick);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("dblclick", onDoubleClick);
    };
  }, [applyZoomStyles]);

  return (
    <div className="pdf-scroll-viewer" ref={outerRef}>
      {loading ? <p className="pdf-scroll-status">Cargando PDF…</p> : null}
      {error ? <p className="pdf-scroll-status error">{error}</p> : null}
      {!loading && !error && pageCount > 0 ? (
        <p className="pdf-scroll-status subtle">
          {pageCount} página{pageCount === 1 ? "" : "s"} · pellizca para zoom
        </p>
      ) : null}

      {!loading && !error ? (
        <div
          className={`pdf-zoom-badge${pinching || zoom > 1 ? " is-visible" : ""}`}
          aria-live="polite"
        >
          {Math.round(zoom * 100)}%
        </div>
      ) : null}

      <div className="pdf-scroll-pages" ref={hostRef} />
    </div>
  );
}
