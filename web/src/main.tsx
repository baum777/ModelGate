import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.js";
import "./critical.css";
import { registerPwa } from "./pwa.js";
import { LocaleProvider } from "./lib/localization.js";

const DESKTOP_DEFERRED_CSS_QUERY = "(min-width: 761px)";
let deferredCssLoaded = false;

function loadStylesheetOnce(id: string, href: string) {
  if (typeof document === "undefined" || document.getElementById(id)) {
    return;
  }

  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function loadDeferredCssOnce() {
  if (deferredCssLoaded) {
    return;
  }

  deferredCssLoaded = true;
  void import("./deferred.css");
}

function loadDeferredCssForViewport() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    loadDeferredCssOnce();
    return;
  }

  const desktopQuery = window.matchMedia(DESKTOP_DEFERRED_CSS_QUERY);
  if (desktopQuery.matches) {
    loadDeferredCssOnce();
    return;
  }

  const loadWhenDesktop = (event: MediaQueryListEvent) => {
    if (!event.matches) {
      return;
    }

    loadDeferredCssOnce();
    if (typeof desktopQuery.removeEventListener === "function") {
      desktopQuery.removeEventListener("change", loadWhenDesktop);
    } else {
      desktopQuery.removeListener(loadWhenDesktop);
    }
  };

  if (typeof desktopQuery.addEventListener === "function") {
    desktopQuery.addEventListener("change", loadWhenDesktop);
  } else {
    desktopQuery.addListener(loadWhenDesktop);
  }
}

function scheduleNonCriticalWork(callback: () => void, timeout = 15_000) {
  if (typeof window === "undefined") {
    return;
  }

  let didRun = false;
  const run = () => {
    if (didRun) {
      return;
    }

    didRun = true;
    globalThis.clearTimeout(timer);
    window.removeEventListener("pointerdown", run);
    window.removeEventListener("keydown", run);
    callback();
  };

  const timer = globalThis.setTimeout(run, timeout);
  window.addEventListener("pointerdown", run, { once: true, passive: true });
  window.addEventListener("keydown", run, { once: true });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </React.StrictMode>
);

loadStylesheetOnce("mosaicstacked-local-fonts", "/local-fonts.css");
loadDeferredCssForViewport();

scheduleNonCriticalWork(() => {
  void registerPwa();
});
