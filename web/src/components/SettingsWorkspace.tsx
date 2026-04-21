import React from "react";
import { useLocalization } from "../lib/localization.js";

export type DiagnosticEntry = {
  kind: "info" | "warning" | "error";
  label: string;
  detail?: string;
};

export type SettingsTruthSnapshot = {
  backend: {
    label: string;
    detail: string;
  };
  github: {
    sessionLabel: string;
    connectionLabel: string;
    repositoryLabel: string;
    accessLabel: string;
  };
  matrix: {
    identityLabel: string;
    connectionLabel: string;
    homeserverLabel: string;
    scopeLabel: string;
  };
  models: {
    activeAlias: string;
    availableCount: number;
    registrySourceLabel: string;
  };
};

type SettingsWorkspaceProps = {
  expertMode: boolean;
  onExpertModeChange: (value: boolean) => void;
  diagnostics: DiagnosticEntry[];
  onClearDiagnostics: () => void;
  truthSnapshot: SettingsTruthSnapshot;
};

export function SettingsWorkspace({
  expertMode,
  onExpertModeChange,
  diagnostics,
  onClearDiagnostics,
  truthSnapshot,
}: SettingsWorkspaceProps) {
  const { copy: ui } = useLocalization();

  return (
    <section className="workspace-panel settings-workspace" data-testid="settings-workspace">
      <section className="workspace-hero">
        <div>
          <p className="status-pill status-partial">{ui.settings.heroStatus}</p>
          <h1>{ui.settings.title}</h1>
          <p className="hero-copy">{ui.settings.intro}</p>
        </div>
      </section>

      <div className="settings-grid">
        <article className="workspace-card">
          <header className="card-header">
            <div>
              <span>{ui.settings.viewCardTitle}</span>
              <strong>{ui.settings.beginner} / {ui.settings.expert}</strong>
            </div>
          </header>
          <div className="action-row">
            <button type="button" className={expertMode ? "secondary-button" : ""} onClick={() => onExpertModeChange(false)}>
              {ui.settings.beginner}
            </button>
            <button type="button" className={expertMode ? "" : "secondary-button"} onClick={() => onExpertModeChange(true)}>
              {ui.settings.expert}
            </button>
          </div>
        </article>

        <article className="workspace-card">
          <header className="card-header">
            <div>
              <span>{ui.settings.identityCardTitle}</span>
              <strong>{ui.settings.backendTruth}</strong>
            </div>
          </header>
          <div className="detail-grid">
            <div>
              <span>{ui.settings.backend}</span>
              <strong>{truthSnapshot.backend.label}</strong>
            </div>
            <div>
              <span>{ui.settings.githubIdentity}</span>
              <strong>{truthSnapshot.github.sessionLabel}</strong>
            </div>
            <div>
              <span>{ui.settings.githubConnection}</span>
              <strong>{truthSnapshot.github.connectionLabel}</strong>
            </div>
            <div>
              <span>{ui.settings.githubAuthority}</span>
              <strong>{truthSnapshot.github.accessLabel}</strong>
            </div>
            <div>
              <span>{ui.settings.githubScope}</span>
              <strong>{truthSnapshot.github.repositoryLabel}</strong>
            </div>
            <div>
              <span>{ui.settings.matrixIdentity}</span>
              <strong>{truthSnapshot.matrix.identityLabel}</strong>
            </div>
            <div>
              <span>{ui.settings.matrixConnection}</span>
              <strong>{truthSnapshot.matrix.connectionLabel}</strong>
            </div>
            <div>
              <span>{ui.settings.matrixHomeserver}</span>
              <strong>{truthSnapshot.matrix.homeserverLabel}</strong>
            </div>
            <div>
              <span>{ui.settings.matrixScope}</span>
              <strong>{truthSnapshot.matrix.scopeLabel}</strong>
            </div>
            <div>
              <span>{ui.settings.chatIdentity}</span>
              <strong>{ui.settings.chatIdentity}</strong>
            </div>
            <div>
              <span>{ui.settings.chatScope}</span>
              <strong>{ui.settings.chatScope}</strong>
            </div>
            <div>
              <span>{ui.settings.chatAuthority}</span>
              <strong>{ui.settings.chatAuthority}</strong>
            </div>
          </div>
          <p className="muted-copy">{truthSnapshot.backend.detail}</p>
          <p className="muted-copy">{ui.settings.backendTruth}</p>
        </article>

        <article className="workspace-card">
          <header className="card-header">
            <div>
              <span>{ui.settings.modelCardTitle}</span>
              <strong>{ui.settings.backendPolicy}</strong>
            </div>
          </header>
          <div className="detail-grid">
            <div>
              <span>{ui.settings.modelCardTitle}</span>
              <strong>{truthSnapshot.models.activeAlias}</strong>
            </div>
            <div>
              <span>{ui.settings.modelSourceLabel}</span>
              <strong>{String(truthSnapshot.models.availableCount)}</strong>
            </div>
            <div>
              <span>{ui.settings.modelSourceLabel}</span>
              <strong>{truthSnapshot.models.registrySourceLabel}</strong>
            </div>
          </div>
          <p className="muted-copy">{ui.settings.modelChoiceNote}</p>
        </article>

        <article className="workspace-card">
          <header className="card-header">
            <div>
              <span>{ui.settings.diagnosticsCardTitle}</span>
              <strong>{ui.settings.diagnosticsHidden}</strong>
            </div>
          </header>
          <p className="muted-copy">{ui.settings.diagnosticsHidden}</p>
          {expertMode ? (
            <div className="diagnostic-feed" aria-live="polite">
              {diagnostics.length === 0 ? (
                <p className="empty-state">{ui.settings.diagnosticsEmpty}</p>
              ) : (
                diagnostics.map((entry) => (
                  <article key={`${entry.kind}-${entry.label}-${entry.detail ?? ""}`} className={`telemetry-item telemetry-item-${entry.kind}`}>
                    <strong>{entry.label}</strong>
                    {entry.detail ? <p>{entry.detail}</p> : null}
                  </article>
                ))
              )}
              <div className="action-row">
                <button type="button" className="secondary-button" onClick={onClearDiagnostics}>
                  {ui.settings.clearDiagnostics}
                </button>
              </div>
            </div>
          ) : null}
        </article>
      </div>

    </section>
  );
}
