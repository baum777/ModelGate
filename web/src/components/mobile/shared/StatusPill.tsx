import type { ReactNode } from "react";

export type StatusPillTone = "ready" | "checking" | "error" | "loading" | "pending";

export function StatusPill({ tone, children }: { tone: StatusPillTone; children: ReactNode }) {
  return (
    <span className={`mobile-status-pill mobile-status-pill-${tone}`}>
      <span className="mobile-status-pill-dot" aria-hidden="true" />
      {children}
    </span>
  );
}
