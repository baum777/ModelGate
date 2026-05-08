import React from "react";

type EmptyStateVariant = "default" | "github" | "matrix";
type EmptyStateSecondaryVariant = "ghost" | "text-link";

export interface EmptyStateCTAProps {
  icon: string;
  iconColor?: string;
  title: string;
  description: string;
  primaryLabel: string;
  primaryAction: () => void;
  primaryVariant?: EmptyStateVariant;
  secondaryLabel?: string;
  secondaryAction?: () => void;
  secondaryVariant?: EmptyStateSecondaryVariant;
  footnote?: string;
}

export function EmptyStateCTA({
  icon,
  iconColor,
  title,
  description,
  primaryLabel,
  primaryAction,
  primaryVariant = "default",
  secondaryLabel,
  secondaryAction,
  secondaryVariant = "ghost",
  footnote,
}: EmptyStateCTAProps) {
  return (
    <article className="empty-state-cta">
      <div className="empty-state-cta-icon" style={iconColor ? { color: iconColor } : undefined} aria-hidden="true">
        {icon}
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="empty-state-cta-actions">
        <button
          type="button"
          className={`empty-state-cta-primary empty-state-cta-primary-${primaryVariant}`}
          onClick={primaryAction}
        >
          {primaryLabel}
        </button>
        {secondaryLabel && secondaryAction ? (
          <button
            type="button"
            className={secondaryVariant === "text-link" ? "empty-state-cta-link" : "ghost-button"}
            onClick={secondaryAction}
          >
            {secondaryLabel}
          </button>
        ) : null}
      </div>
      {footnote ? <p className="empty-state-cta-footnote">{footnote}</p> : null}
    </article>
  );
}
