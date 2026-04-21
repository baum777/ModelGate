import React from "react";
import type { ReactNode } from "react";
import { DiagnosticsDrawer, type DiagnosticsDetailRow } from "./ExpertDetails.js";
import { SectionLabel, StatusBadge } from "./ShellPrimitives.js";
import { useLocalization } from "../lib/localization.js";

export type StatusPanelRow = {
  label: string;
  value: string;
};

export type GlobalStatusTone = "blocker" | "warning" | "info" | "hidden";

type SystemSummaryCardProps = {
  title: string;
  headline: string;
  badge: string;
  badgeTone?: "ready" | "partial" | "error";
  rows: StatusPanelRow[];
  helperText?: string;
  detailsLabel?: string;
  onOpenDiagnostics?: () => void;
  diagnosticsDisabled?: boolean;
  testId?: string;
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
  expertRows?: DiagnosticsDetailRow[];
  expertChildren?: ReactNode;
  testId?: string;
};

export function SystemSummaryCard({
  title,
  headline,
  badge,
  badgeTone = "ready",
  rows,
  helperText,
  detailsLabel = "Diagnostics",
  onOpenDiagnostics,
  diagnosticsDisabled = false,
  testId,
}: SystemSummaryCardProps) {
  const { copy: ui } = useLocalization();

  return (
    <section className="status-panel-card system-summary-card" role="region" aria-label={title} data-testid={testId}>
      <div className="context-summary-header">
        <div>
          <SectionLabel>{title}</SectionLabel>
          <strong>{headline}</strong>
        </div>
        <StatusBadge tone={badgeTone} className={`status-pill status-${badgeTone}`}>{badge}</StatusBadge>
      </div>

      <div className="status-panel-grid">
        {rows.map((row) => (
          <div key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>

      {helperText ? <p className="system-summary-helper">{helperText}</p> : null}

      {onOpenDiagnostics ? (
        <div className="system-summary-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onOpenDiagnostics}
            disabled={diagnosticsDisabled}
          >
            {detailsLabel ?? ui.shell.diagnosticsLabel}
          </button>
        </div>
      ) : null}
    </section>
  );
}

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
  testId,
}: StatusPanelProps) {
  const { copy: ui } = useLocalization();

  return (
    <section className="status-panel-card status-panel-compact" role="region" aria-label={title} data-testid={testId}>
      <div className="context-summary-header">
        <div>
          <SectionLabel>{title}</SectionLabel>
          <strong>{headline}</strong>
        </div>
        <StatusBadge tone={badgeTone} className={`status-pill status-${badgeTone}`}>{badge}</StatusBadge>
      </div>

      <div className="status-panel-grid status-panel-grid-compact">
        {rows.map((row) => (
          <div key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>

      {safetyText && safetyText.trim().length > 0 ? (
        <p className="status-panel-note">
          <span className="info-label">{safetyTitle}</span>
          <span>{safetyText}</span>
        </p>
      ) : null}

      <DiagnosticsDrawer expertMode={expertMode} rows={expertRows} className="status-panel-expert" title={ui.shell.diagnosticsLabel}>
        {expertChildren}
      </DiagnosticsDrawer>
    </section>
  );
}
