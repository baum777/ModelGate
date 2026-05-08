import React from "react";

type GuideCTAInlineVariant = "default" | "github" | "matrix" | "warning";

export interface GuideCTAInlineProps {
  id: string;
  icon?: string;
  title: string;
  body: string;
  primaryLabel: string;
  primaryAction: () => void;
  secondaryLabel?: string;
  secondaryAction?: () => void;
  onDismiss: () => void;
  variant?: GuideCTAInlineVariant;
}

export function GuideCTAInline({
  id,
  icon = "💡",
  title,
  body,
  primaryLabel,
  primaryAction,
  secondaryLabel = "Verstanden",
  secondaryAction,
  onDismiss,
  variant = "default",
}: GuideCTAInlineProps) {
  return (
    <aside
      className={`guide-cta-inline guide-cta-inline-${variant}`}
      role="status"
      aria-live="polite"
      data-guide-id={id}
    >
      <header className="guide-cta-inline-header">
        <span className="guide-cta-inline-title">{`${icon} ${title}`}</span>
        <button
          type="button"
          className="ghost-button guide-cta-inline-dismiss"
          aria-label="Hinweis schließen"
          onClick={onDismiss}
        >
          ✕
        </button>
      </header>
      <p className="guide-cta-inline-body">{body}</p>
      <div className="guide-cta-inline-actions">
        <button type="button" className="secondary-button" onClick={primaryAction}>
          {primaryLabel}
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={secondaryAction ?? onDismiss}
        >
          {secondaryLabel}
        </button>
      </div>
    </aside>
  );
}
