import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.js";
import "./styles.css";
import { registerPwa } from "./pwa.js";
import { LocaleProvider } from "./lib/localization.js";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </React.StrictMode>
);

void registerPwa();
