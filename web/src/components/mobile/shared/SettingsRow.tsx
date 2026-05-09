import React from "react";
import type { ReactNode } from "react";

export function SettingsRow({
  label,
  value,
  action,
}: {
  label: string;
  value: ReactNode;
  action?: () => void;
}) {
  const content = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
      <span className="mobile-settings-row-chevron" aria-hidden="true">⌄</span>
    </>
  );

  if (action) {
    return (
      <button type="button" className="mobile-settings-row" onClick={action}>
        {content}
      </button>
    );
  }

  return <div className="mobile-settings-row">{content}</div>;
}
