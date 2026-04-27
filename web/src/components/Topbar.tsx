import React from "react";
import { useLocalization, type Locale } from "../lib/localization.js";
import { StatusBadge } from "./ShellPrimitives.js";

type TopbarProps = {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  health: {
    label: string;
    tone: "ready" | "partial" | "error" | "muted";
  };
};

export function Topbar({ locale, onLocaleChange, health }: TopbarProps) {
  const { copy: ui } = useLocalization();

  return (
    <header className="global-header global-header-shell">
      <div className="brand-block">
        <p className="app-kicker">{ui.shell.appKicker}</p>
        <h1>{ui.shell.appTitle}</h1>
        <p className="app-deck">{ui.shell.appDeck}</p>
      </div>

      <div className="header-actions">
        <div className="shell-language-toggle" role="group" aria-label={ui.shell.languageLabel}>
          <button
            type="button"
            className={locale === "en" ? "secondary-button shell-language-button shell-language-button-active" : "secondary-button shell-language-button"}
            onClick={() => onLocaleChange("en")}
            aria-pressed={locale === "en"}
          >
            {ui.shell.languageOptionEnglish}
          </button>
          <button
            type="button"
            className={locale === "de" ? "secondary-button shell-language-button shell-language-button-active" : "secondary-button shell-language-button"}
            onClick={() => onLocaleChange("de")}
            aria-pressed={locale === "de"}
          >
            {ui.shell.languageOptionGerman}
          </button>
        </div>
        <StatusBadge tone={health.tone}>{ui.shell.backendPrefix} {health.label}</StatusBadge>
      </div>
    </header>
  );
}
