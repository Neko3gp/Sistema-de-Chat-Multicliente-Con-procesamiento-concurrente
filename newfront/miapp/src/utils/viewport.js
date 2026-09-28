const APP_HEIGHT_VAR = "--app-height";
const APP_OFFSET_VAR = "--app-offset";

function syncAppHeight() {
  // Use the layout viewport only. The page meta has
  // interactive-widget=resizes-content, so the keyboard already shrinks
  // innerHeight. Syncing visualViewport height/offset on top of that
  // double-shifts the composer upward in Chrome PWA.
  const height = Math.round(window.innerHeight || window.visualViewport?.height || 0);
  document.documentElement.style.setProperty(
    APP_HEIGHT_VAR,
    `${height || 0}px`,
  );
  document.documentElement.style.setProperty(APP_OFFSET_VAR, "0px");
}

export function startAppHeightSync() {
  syncAppHeight();

  const onResize = () => syncAppHeight();
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);

  return () => {
    window.removeEventListener("resize", onResize);
    window.removeEventListener("orientationchange", onResize);
  };
}
