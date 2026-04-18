import type { ReactNode } from "react";
import { ExpertDetails, type ExpertDetailRow } from "./ExpertDetails.js";

export type StatusPanelRow = {
  label: string;
  value: string;
};

type StatusPanelProps = {
  title: string;
  headline: string;
  badge: string;
  badgeTone?: "ready" | "partial" | "error";
  rows: StatusPanelRow[];
  safetyTitle: string;
  safetyText?: string;
  expertMode: boolean;
  expertRows?: ExpertDetailRow[];
  expertChildren?: ReactNode;
};

export function StatusPanel({
  title,
  headline,
  badge,
  badgeTone = "ready",
  rows,
  safetyTitle,
  safetyText,
  expertMode,
  expertRows = [],
  expertChildren,
}: StatusPanelProps) {
  return (
    <section className="status-panel-card" role="region" aria-label={title}>
      <div className="context-summary-header">
        <div>
          <span>{title}</span>
          <strong>{headline}</strong>
        </div>
        <span className={`status-pill status-${badgeTone}`}>{badge}</span>
      </div>

      <div className="status-panel-grid">
        {rows.map((row) => (
          <div key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>

      {safetyText && safetyText.trim().length > 0 ? (
        <div className="safety-tip-card">
          <p className="info-label">{safetyTitle}</p>
          <p>{safetyText}</p>
        </div>
      ) : null}

      <ExpertDetails expertMode={expertMode} rows={expertRows} className="status-panel-expert">
        {expertChildren}
      </ExpertDetails>
    </section>
  );
}
