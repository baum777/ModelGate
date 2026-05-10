import React from "react";
import type { ReactNode } from "react";

export interface SettingsRowProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "ready" | "partial" | "error" | "muted";
  testId?: string;
  action?: () => void;
}

export type SettingsRowTone = NonNullable<SettingsRowProps["tone"]>;

export function SettingsRow({
  label,
  value,
  detail,
  tone = "muted",
  testId,
  action,
}: SettingsRowProps) {
  const content = (
    <>
      <span className="mobile-settings-row-label">{label}</span>
      <strong className="mobile-settings-row-value">{value}</strong>
      {detail ? <span className="mobile-settings-row-detail">{detail}</span> : null}
      <span className="mobile-settings-row-chevron" aria-hidden="true">⌄</span>
    </>
  );

  if (action) {
    return (
      <button
        type="button"
        className={`mobile-settings-row mobile-settings-row-${tone}`}
        onClick={action}
        data-testid={testId}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={`mobile-settings-row mobile-settings-row-${tone}`} data-testid={testId}>
      {content}
    </div>
  );
}
