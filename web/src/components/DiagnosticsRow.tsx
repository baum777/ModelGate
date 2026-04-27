import React from "react";
import type { ReactNode } from "react";

export type DiagnosticsRowState = "ok" | "degraded" | "missing" | "error";

const STATE_CLASS: Record<DiagnosticsRowState, string> = {
  ok: "ready",
  degraded: "partial",
  missing: "muted",
  error: "error",
};

type DiagnosticsRowProps = {
  label: string;
  caption: string;
  value: ReactNode;
  state: DiagnosticsRowState;
};

export function DiagnosticsRow({ label, caption, value, state }: DiagnosticsRowProps) {
  return (
    <div className="diagnostics-status-row">
      <div>
        <strong>{label}</strong>
        <p className="muted-copy">{caption}</p>
      </div>
      <span className={`status-pill status-${STATE_CLASS[state]}`} role="status">
        {value}
      </span>
    </div>
  );
}
