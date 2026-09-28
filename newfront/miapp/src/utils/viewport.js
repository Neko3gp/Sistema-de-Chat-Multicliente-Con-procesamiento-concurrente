const APP_HEIGHT_VAR = "--app-height";
const APP_OFFSET_VAR = "--app-offset";

function readViewportHeight() {
  if (window.visualViewport?.height) {
    return Math.round(window.visualViewport.height);
  }
  return window.innerHeight;
}

function readViewportOffset() {
  return Math.round(window.visualViewport?.offsetTop || 0);
}

function syncAppHeight() {
  document.documentElement.style.setProperty(
    APP_HEIGHT_VAR,
    `${readViewportHeight()}px`,
  );
  // Only apply vertical offset while the soft keyboard is open.
  // Tracking visualViewport.offsetTop during page scroll breaks Chrome PWA.
  const height = readViewportHeight();
  const layoutHeight = window.innerHeight || height;
  const keyboardOpen = layoutHeight - height > 80;
  document.documentElement.style.setProperty(
    APP_OFFSET_VAR,
    `${keyboardOpen ? readViewportOffset() : 0}px`,
  );
}

export function startAppHeightSync() {
  syncAppHeight();

  const onResize = () => syncAppHeight();
  window.addEventListener("resize", onResize);
  window.visualViewport?.addEventListener("resize", onResize);
  // Intentionally skip visualViewport "scroll": it breaks overflow scrolling
  // on long pages when the app is installed to the Chrome home screen.

  return () => {
    window.removeEventListener("resize", onResize);
    window.visualViewport?.removeEventListener("resize", onResize);
  };
}
