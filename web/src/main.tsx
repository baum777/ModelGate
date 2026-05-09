import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.js";
import "./critical.css";
import { registerPwa } from "./pwa.js";
import { LocaleProvider } from "./lib/localization.js";

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

scheduleNonCriticalWork(() => {
  loadStylesheetOnce("mosaicstacked-local-fonts", "/local-fonts.css");
  void import("./deferred.css");
  void registerPwa();
});
