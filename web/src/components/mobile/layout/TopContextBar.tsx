import type { PointerEventHandler, ReactNode } from "react";

export type MobileHealthTone = "ready" | "partial" | "error";

export function TopContextBar({
  brandIcon,
  title,
  modelAlias,
  healthTone,
  locale,
  brandAriaLabel,
  modelAriaLabel,
  languageAriaLabel,
  languageOptionEnglish,
  languageOptionGerman,
  onBrandClick,
  onBrandPointerCancel,
  onBrandPointerDown,
  onBrandPointerLeave,
  onBrandPointerUp,
  onModelPress,
  onLocaleChange,
}: {
  brandIcon: ReactNode;
  title: string;
  modelAlias: string;
  healthTone: MobileHealthTone;
  locale: "en" | "de";
  brandAriaLabel: string;
  modelAriaLabel: string;
  languageAriaLabel: string;
  languageOptionEnglish: string;
  languageOptionGerman: string;
  onBrandClick: () => void;
  onBrandPointerCancel: PointerEventHandler<HTMLButtonElement>;
  onBrandPointerDown: PointerEventHandler<HTMLButtonElement>;
  onBrandPointerLeave: PointerEventHandler<HTMLButtonElement>;
  onBrandPointerUp: PointerEventHandler<HTMLButtonElement>;
  onModelPress: () => void;
  onLocaleChange: (locale: "en" | "de") => void;
}) {
  return (
    <header className="mobile-topbar">
      <button
        type="button"
        className="mobile-brand-button"
        onPointerDown={onBrandPointerDown}
        onPointerUp={onBrandPointerUp}
        onPointerCancel={onBrandPointerCancel}
        onPointerLeave={onBrandPointerLeave}
        onClick={onBrandClick}
        aria-label={brandAriaLabel}
      >
        <span className="mosaicstacked-mark" aria-hidden="true">
          {brandIcon}
        </span>
        <span>{title}</span>
      </button>

      <div className="mobile-topbar-actions">
        <button
          type="button"
          className="secondary-button mobile-model-badge"
          onClick={onModelPress}
          aria-label={modelAriaLabel}
        >
          {modelAlias}
        </button>
        <div className="shell-language-toggle" role="group" aria-label={languageAriaLabel}>
          <button
            type="button"
            className={locale === "en" ? "secondary-button shell-language-button shell-language-button-active" : "secondary-button shell-language-button"}
            onClick={() => onLocaleChange("en")}
            aria-pressed={locale === "en"}
            aria-label={locale === "de" ? "Sprache: Englisch" : "Language: English"}
            data-testid="locale-en"
          >
            {languageOptionEnglish}
          </button>
          <button
            type="button"
            className={locale === "de" ? "secondary-button shell-language-button shell-language-button-active" : "secondary-button shell-language-button"}
            onClick={() => onLocaleChange("de")}
            aria-pressed={locale === "de"}
            aria-label={locale === "de" ? "Sprache: Deutsch" : "Language: German"}
            data-testid="locale-de"
          >
            {languageOptionGerman}
          </button>
        </div>
        <span className={`mobile-live-indicator mobile-live-indicator-${healthTone}`} aria-hidden="true" />
      </div>
    </header>
  );
}
