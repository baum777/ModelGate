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
            Disclosure wählen, Verbindungstruth prüfen und Diagnose im Expert Mode öffnen.
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
              <span>Autorität</span>
              <strong>Identitäts- und Verbindungstruth</strong>
            </div>
          </header>
          <p className="muted-copy">
            Gemeinsame Infrastruktur bedeutet nicht gemeinsame Autorität. GitHub-Ausführung bleibt pro Nutzer, Matrix ist eine gemeinsame Kollaborationsfläche mit pro-Nutzer-Identität, und die AI-Provider-Zugangsdaten bleiben privat.
          </p>
          <p className="muted-copy">
            Der Browser spiegelt nur Wahrheit wider, die der Backend-Server bereits belegen kann. Er verwaltet keine Zugangsdaten und leitet keine Account-Zugehörigkeit ab.
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
