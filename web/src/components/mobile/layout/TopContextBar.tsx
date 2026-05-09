import type { PointerEventHandler, ReactNode } from "react";

export type MobileHealthTone = "ready" | "partial" | "error";

export function TopContextBar({
  brandIcon,
  title,
  modelAlias,
  healthTone,
  brandAriaLabel,
  modelAriaLabel,
  onBrandClick,
  onBrandPointerCancel,
  onBrandPointerDown,
  onBrandPointerLeave,
  onBrandPointerUp,
  onModelPress,
}: {
  brandIcon: ReactNode;
  title: string;
  modelAlias: string;
  healthTone: MobileHealthTone;
  brandAriaLabel: string;
  modelAriaLabel: string;
  onBrandClick: () => void;
  onBrandPointerCancel: PointerEventHandler<HTMLButtonElement>;
  onBrandPointerDown: PointerEventHandler<HTMLButtonElement>;
  onBrandPointerLeave: PointerEventHandler<HTMLButtonElement>;
  onBrandPointerUp: PointerEventHandler<HTMLButtonElement>;
  onModelPress: () => void;
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
        <span className={`mobile-live-indicator mobile-live-indicator-${healthTone}`} aria-hidden="true" />
      </div>
    </header>
  );
}
