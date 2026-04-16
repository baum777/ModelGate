import { StatusPanel } from "./StatusPanel.js";

export type DiagnosticEntry = {
  kind: "info" | "warning" | "error";
  label: string;
  detail?: string;
};

type SettingsWorkspaceProps = {
  expertMode: boolean;
  onExpertModeChange: (value: boolean) => void;
  diagnostics: DiagnosticEntry[];
  onClearDiagnostics: () => void;
};

function modeCopy(expertMode: boolean) {
  return expertMode ? "Expert Mode aktiv" : "Beginner Mode aktiv";
}

export function SettingsWorkspace({
  expertMode,
  onExpertModeChange,
  diagnostics,
  onClearDiagnostics,
}: SettingsWorkspaceProps) {
  return (
    <section className="workspace-panel settings-workspace" data-testid="settings-workspace">
      <section className="workspace-hero">
        <div>
          <p className="status-pill status-partial">Settings</p>
          <h1>Einstellungen</h1>
          <p className="hero-copy">
            Ansicht wählen, Sicherheit prüfen und Diagnose im Expert Mode öffnen.
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
          <p>{modeCopy(expertMode)}</p>
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

      <StatusPanel
        title="Systemstatus"
        headline="Einstellungen"
        badge={expertMode ? "Expert Mode" : "Beginner Mode"}
        badgeTone="partial"
        rows={[
          { label: "Ansicht", value: expertMode ? "Expert" : "Beginner" },
          { label: "Diagnose", value: expertMode ? "Sichtbar" : "Verborgen" },
          { label: "Freigabe", value: "Nicht erforderlich" },
          { label: "Sicherheit", value: "Keine Schreibrechte" },
        ]}
        safetyTitle="Sicherheit"
        safetyText=""
        expertMode={expertMode}
        expertRows={[
          { label: "Route", value: "Settings / Diagnose" },
          { label: "Backend route status", value: expertMode ? "sichtbar" : "verborgen" },
        ]}
      />
    </section>
  );
}
