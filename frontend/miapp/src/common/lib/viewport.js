const APP_HEIGHT_VAR = "--app-height";
const APP_OFFSET_VAR = "--app-offset";

function readViewport() {
  const vv = window.visualViewport;
  if (vv && vv.height) {
    return {
      height: Math.round(vv.height),
      offset: Math.round(vv.offsetTop || 0),
    };
  }
  return {
    height: Math.round(window.innerHeight || 0),
    offset: 0,
  };
}

export function syncAppHeight() {
  const { height, offset } = readViewport();
  document.documentElement.style.setProperty(APP_HEIGHT_VAR, `${height}px`);
  document.documentElement.style.setProperty(APP_OFFSET_VAR, `${offset}px`);

  // Evita que el teclado desplace toda la página y “esconda” el contacto.
  if (window.scrollY !== 0 || window.scrollX !== 0) {
    window.scrollTo(0, 0);
  }
  if (document.documentElement.scrollTop || document.body.scrollTop) {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }
}

export function startAppHeightSync() {
  syncAppHeight();

  const onResize = () => syncAppHeight();
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);
  window.visualViewport?.addEventListener("resize", onResize);
  window.visualViewport?.addEventListener("scroll", onResize);

  return () => {
    window.removeEventListener("resize", onResize);
    window.removeEventListener("orientationchange", onResize);
    window.visualViewport?.removeEventListener("resize", onResize);
    window.visualViewport?.removeEventListener("scroll", onResize);
  };
}
