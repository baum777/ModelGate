import React from "react";

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
  return (
    <section className="workspace-panel settings-workspace" data-testid="settings-workspace">
      <section className="workspace-hero">
        <div>
          <p className="status-pill status-partial">Settings</p>
          <h1>Einstellungen</h1>
          <p className="hero-copy">
            Disclosure wählen, Identität und Verbindung gegen Backendtruth prüfen und Diagnose im Expert Mode öffnen.
          </p>
        </div>
      </section>

      <div className="settings-grid">
        <article className="workspace-card">
          <header className="card-header">
            <div>
              <span>Ansicht</span>
              <strong>Beginner / Expert</strong>
            </div>
          </header>
          <div className="action-row">
            <button type="button" className={expertMode ? "secondary-button" : ""} onClick={() => onExpertModeChange(false)}>
              Beginner
            </button>
            <button type="button" className={expertMode ? "" : "secondary-button"} onClick={() => onExpertModeChange(true)}>
              Expert
            </button>
          </div>
        </article>

        <article className="workspace-card">
          <header className="card-header">
            <div>
              <span>Identität und Verbindung</span>
              <strong>Backend-, GitHub- und Matrixtruth</strong>
            </div>
          </header>
          <div className="detail-grid">
            <div>
              <span>Backend</span>
              <strong>{truthSnapshot.backend.label}</strong>
            </div>
            <div>
              <span>GitHub acting identity</span>
              <strong>{truthSnapshot.github.sessionLabel}</strong>
            </div>
            <div>
              <span>GitHub Verbindung</span>
              <strong>{truthSnapshot.github.connectionLabel}</strong>
            </div>
            <div>
              <span>GitHub authority domain</span>
              <strong>{truthSnapshot.github.accessLabel}</strong>
            </div>
            <div>
              <span>GitHub active scope</span>
              <strong>{truthSnapshot.github.repositoryLabel}</strong>
            </div>
            <div>
              <span>Matrix acting identity</span>
              <strong>{truthSnapshot.matrix.identityLabel}</strong>
            </div>
            <div>
              <span>Matrix Verbindung</span>
              <strong>{truthSnapshot.matrix.connectionLabel}</strong>
            </div>
            <div>
              <span>Homeserver</span>
              <strong>{truthSnapshot.matrix.homeserverLabel}</strong>
            </div>
            <div>
              <span>Matrix active scope</span>
              <strong>{truthSnapshot.matrix.scopeLabel}</strong>
            </div>
            <div>
              <span>Chat acting identity</span>
              <strong>not exposed by backend</strong>
            </div>
            <div>
              <span>Chat active scope</span>
              <strong>session-local chat thread (browser)</strong>
            </div>
            <div>
              <span>Chat authority domain</span>
              <strong>chat backend route (/chat)</strong>
            </div>
          </div>
          <p className="muted-copy">{truthSnapshot.backend.detail}</p>
          <p className="muted-copy">
            Gemeinsame Infrastruktur bedeutet nicht gemeinsame Autorität. Der Browser spiegelt nur Wahrheit wider, die der Backend-Server bereits belegen kann.
          </p>
        </article>

        <article className="workspace-card">
          <header className="card-header">
            <div>
              <span>Modelle</span>
              <strong>Backend-Policy und Auswahl</strong>
            </div>
          </header>
          <div className="detail-grid">
            <div>
              <span>Aktiver Alias</span>
              <strong>{truthSnapshot.models.activeAlias}</strong>
            </div>
            <div>
              <span>Verfügbare Modelle</span>
              <strong>{String(truthSnapshot.models.availableCount)}</strong>
            </div>
            <div>
              <span>Quelle</span>
              <strong>{truthSnapshot.models.registrySourceLabel}</strong>
            </div>
          </div>
          <p className="muted-copy">
            Modellwahl bleibt alias-basiert. Provider-Zuordnung und Backend-Pfade bleiben serverowned und werden nicht im Browser als Wahrheit behandelt.
          </p>
        </article>

        <article className="workspace-card">
          <header className="card-header">
            <div>
              <span>Diagnose</span>
              <strong>Expert-only Kontext</strong>
            </div>
          </header>
          <p className="muted-copy">
            Diagnose bleibt im Expert Mode verborgen.
          </p>
          {expertMode ? (
            <div className="diagnostic-feed" aria-live="polite">
              {diagnostics.length === 0 ? (
                <p className="empty-state">Noch keine lokalen Diagnoseereignisse.</p>
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
                  Diagnose leeren
                </button>
              </div>
            </div>
          ) : null}
        </article>
      </div>

    </section>
  );
}
