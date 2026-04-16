import { useEffect, useState } from "react";
import { ChatWorkspace } from "./components/ChatWorkspace.js";
import {
  GitHubWorkspace,
  type GitHubWorkspaceStatus,
} from "./components/GitHubWorkspace.js";
import { MatrixWorkspace } from "./components/MatrixWorkspace.js";
import { fetchHealth, fetchModels } from "./lib/api.js";

type WorkspaceMode = "chat" | "matrix" | "github";

type TelemetryEntry = {
  id: string;
  kind: "info" | "warning" | "error";
  label: string;
  detail?: string;
};

type PersistedShellState = {
  activeTab?: WorkspaceMode;
  logsExpanded?: boolean;
  expertMode?: boolean;
};

const SHELL_STORAGE_KEY = "modelgate.console.shell.v2";
const MATRIX_STORAGE_KEY = "modelgate.console.matrix.v1";

const DEFAULT_GITHUB_CONTEXT: GitHubWorkspaceStatus = {
  repositoryLabel: "Noch kein GitHub-Repo ausgewählt",
  connectionLabel: "Nicht verbunden",
  accessLabel: "Nur Lesen",
  analysisLabel: "Noch nicht gestartet",
  approvalLabel: "Nicht erforderlich",
  requestId: null,
  planId: null,
  branchName: null,
  apiStatus: "Backend-Routen aktiv",
  sseEvents: ["Keine GitHub-Ereignisse erfasst."],
  rawDiffPreview: null,
  selectedRepoSlug: null,
  safetyTip:
    "Solange 'Nur Lesen' aktiv ist, kann die App keine Dateien ändern oder Commits erstellen.",
};

function createId() {
  return crypto.randomUUID();
}

function readPersistedShellState(): PersistedShellState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const shellState = window.localStorage.getItem(SHELL_STORAGE_KEY);
    const matrixState = window.localStorage.getItem(MATRIX_STORAGE_KEY);

    if (!shellState && !matrixState) {
      return null;
    }

    return shellState ? JSON.parse(shellState) as PersistedShellState : {};
  } catch {
    return null;
  }
}

function persistShellState(state: PersistedShellState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SHELL_STORAGE_KEY, JSON.stringify(state));
}

function kindClass(kind: TelemetryEntry["kind"]) {
  return kind === "error"
    ? "telemetry-item-error"
    : kind === "warning"
      ? "telemetry-item-warning"
      : "telemetry-item-info";
}

function tabLabel(mode: WorkspaceMode) {
  switch (mode) {
    case "matrix":
      return "Matrix Workspace";
    case "github":
      return "GitHub Workspace";
    default:
      return "Chat";
  }
}

function appendTelemetry(current: TelemetryEntry[], entry: TelemetryEntry) {
  return [...current, entry].slice(-8);
}

function WorkspaceIcon({ mode }: { mode: WorkspaceMode }) {
  switch (mode) {
    case "matrix":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <rect x="4" y="4" width="6" height="6" rx="1.5" />
          <rect x="14" y="4" width="6" height="6" rx="1.5" />
          <rect x="4" y="14" width="6" height="6" rx="1.5" />
          <rect x="14" y="14" width="6" height="6" rx="1.5" />
        </svg>
      );
    case "github":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M6 6.75A2.75 2.75 0 0 1 8.75 4H15l3 3v10.25A2.75 2.75 0 0 1 15.25 20H8.75A2.75 2.75 0 0 1 6 17.25V6.75Z" />
          <path d="M15 4v3h3" />
          <path d="M8.5 11.25h7" />
          <path d="M8.5 14.5h7" />
        </svg>
      );
    default:
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7A2.5 2.5 0 0 1 16.5 16H9l-4 4v-4.5A2.5 2.5 0 0 1 5 13V6.5Z" />
          <path d="M8 8.5h8" />
          <path d="M8 11.5h5.5" />
        </svg>
      );
  }
}

function HeaderToggle({
  expertMode,
  setExpertMode,
}: {
  expertMode: boolean;
  setExpertMode: (value: boolean) => void;
}) {
  return (
    <div className="mode-toggle" role="group" aria-label="Beginner und Expert Modus">
      <button
        type="button"
        className={expertMode ? "mode-toggle-button" : "mode-toggle-button mode-toggle-button-active"}
        onClick={() => setExpertMode(false)}
        aria-pressed={!expertMode}
      >
        Beginner
      </button>
      <button
        type="button"
        className={expertMode ? "mode-toggle-button mode-toggle-button-active" : "mode-toggle-button"}
        onClick={() => setExpertMode(true)}
        aria-pressed={expertMode}
      >
        Expert
      </button>
    </div>
  );
}

export default function App() {
  const persisted = readPersistedShellState();
  const [mode, setMode] = useState<WorkspaceMode>(persisted?.activeTab ?? "chat");
  const [expertMode, setExpertMode] = useState(persisted?.expertMode ?? false);
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null);
  const [backendHealthLabel, setBackendHealthLabel] = useState<string | null>(null);
  const [activeModelAlias, setActiveModelAlias] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [logsExpanded, setLogsExpanded] = useState(persisted?.logsExpanded ?? false);
  const [restoredSession] = useState(Boolean(persisted));
  const [telemetry, setTelemetry] = useState<TelemetryEntry[]>([]);
  const [githubContext, setGitHubContext] = useState<GitHubWorkspaceStatus>(DEFAULT_GITHUB_CONTEXT);

  useEffect(() => {
    let cancelled = false;

    async function loadConsoleState() {
      const [healthResult, modelsResult] = await Promise.allSettled([
        fetchHealth(),
        fetchModels(),
      ]);

      if (cancelled) {
        return;
      }

      if (healthResult.status === "fulfilled") {
        const health = healthResult.value;
        setBackendHealthy(true);
        setBackendHealthLabel(`${health.service} · ${health.mode} · ${health.upstream}`);
        setTelemetry((current) =>
          appendTelemetry(current, {
            id: createId(),
            kind: "info",
            label: "Backend health loaded",
            detail: `${health.service} reports ${health.mode} mode with ${health.allowedModelCount} public model(s).`,
          }),
        );
      } else {
        setBackendHealthy(false);
        setBackendHealthLabel(
          healthResult.reason instanceof Error
            ? healthResult.reason.message
            : "Backend health unavailable",
        );
        setTelemetry((current) =>
          appendTelemetry(current, {
            id: createId(),
            kind: "error",
            label: "Backend health failed",
            detail:
              healthResult.reason instanceof Error
                ? healthResult.reason.message
                : "Unable to reach /health",
          }),
        );
      }

      if (modelsResult.status === "fulfilled") {
        const models = modelsResult.value.models;
        setAvailableModels(models);
        setActiveModelAlias(modelsResult.value.defaultModel);
        setTelemetry((current) =>
          appendTelemetry(current, {
            id: createId(),
            kind: "info",
            label: "Public model alias loaded",
            detail: `Selected alias ${modelsResult.value.defaultModel}; provider targets remain backend-owned.`,
          }),
        );
      } else {
        setTelemetry((current) =>
          appendTelemetry(current, {
            id: createId(),
            kind: "error",
            label: "Model list failed",
            detail:
              modelsResult.reason instanceof Error
                ? modelsResult.reason.message
                : "Unable to reach /models",
          }),
        );
      }
    }

    void loadConsoleState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    persistShellState({
      activeTab: mode,
      logsExpanded,
      expertMode,
    });
  }, [expertMode, logsExpanded, mode]);

  function recordTelemetry(
    kind: TelemetryEntry["kind"],
    label: string,
    detail?: string,
  ) {
    setTelemetry((current) =>
      appendTelemetry(current, {
        id: createId(),
        kind,
        label,
        detail,
      }),
    );
  }

  const backendStatusLabel =
    backendHealthy === null
      ? "Backend pending"
      : backendHealthy
        ? "Backend stable"
        : "Backend error";

  const systemContextPanel = (
    <div className="context-summary-card">
      <div className="context-summary-header">
        <div>
          <span>{mode === "github" ? "Projektstatus" : "Systemstatus"}</span>
          <strong>
            {mode === "github"
              ? githubContext.accessLabel
              : "Bounded telemetry"}
          </strong>
        </div>
        <span className={`status-pill ${backendHealthy === false ? "status-error" : backendHealthy === true ? "status-ready" : "status-partial"}`}>
          {mode === "github" ? githubContext.connectionLabel : backendStatusLabel}
        </span>
      </div>

      {mode === "github" ? (
        <div className="github-context-grid">
          <div>
            <span>Verbindung</span>
            <strong>{githubContext.connectionLabel}</strong>
          </div>
          <div>
            <span>Zugriff</span>
            <strong>{githubContext.accessLabel}</strong>
          </div>
          <div>
            <span>Analyse</span>
            <strong>{githubContext.analysisLabel}</strong>
          </div>
          <div>
            <span>Freigabe</span>
            <strong>{githubContext.approvalLabel}</strong>
          </div>
        </div>
      ) : (
        <div className="context-summary-copy">
          <p>Backend-Kontext und lokale Telemetrie bleiben sichtbar, solange du in Chat oder Matrix arbeitest.</p>
        </div>
      )}

      <div className="safety-tip-card">
        <p className="info-label">Sicherheitstipp</p>
        <p>
          {mode === "github"
            ? githubContext.safetyTip
            : "Die Browseroberfläche sendet nur Bedienabsicht. Alle Autorität bleibt im Backend."}
        </p>
      </div>

      {mode === "github" && expertMode ? (
        <details className="github-expert-details" open>
          <summary>Technische Details</summary>
          <div className="github-expert-grid">
            <div>
              <span>Erlaubtes Repo</span>
              <strong>{githubContext.selectedRepoSlug ?? "n/a"}</strong>
            </div>
            <div>
              <span>Anfrage-ID</span>
              <strong>{githubContext.requestId ?? "n/a"}</strong>
            </div>
            <div>
              <span>Plan-ID</span>
              <strong>{githubContext.planId ?? "n/a"}</strong>
            </div>
            <div>
              <span>Branch</span>
              <strong>{githubContext.branchName ?? "n/a"}</strong>
            </div>
            <div>
              <span>GitHub API Status</span>
              <strong>{githubContext.apiStatus}</strong>
            </div>
            <div>
              <span>Laufzeit-Ereignisse</span>
              <strong>{githubContext.sseEvents.join(" · ")}</strong>
            </div>
          </div>
          {githubContext.rawDiffPreview ? (
            <pre className="github-diff-preview">{githubContext.rawDiffPreview}</pre>
          ) : (
            <p className="muted-copy">Raw diff preview erscheint erst nach einem vorbereiteten Vorschlag.</p>
          )}
        </details>
      ) : null}

      {mode === "github" ? (
        <div className="context-summary-meta">
          <span>Repo: {githubContext.repositoryLabel}</span>
          <span>Anfrage: {githubContext.requestId ?? "n/a"}</span>
          <span>Plan: {githubContext.planId ?? "n/a"}</span>
        </div>
      ) : (
        <div className="context-summary-meta">
          <span>Active tab: {tabLabel(mode)}</span>
          <span>Public model alias: {activeModelAlias ?? "unresolved"}</span>
          <span>Backend context: {backendHealthLabel ?? "loading"}</span>
        </div>
      )}
    </div>
  );

  return (
    <main className="app-shell app-shell-console" data-testid="app-shell">
      <header className="global-header">
        <div className="brand-block">
          <p className="app-kicker">SOVEREIGN CONSOLE</p>
          <h1>ModelGate guided workspace</h1>
          <p className="app-deck">
            Beginner-friendly shell with backend-owned authority, read-only guidance, and explicit approval gates.
          </p>
        </div>

        <div className="header-status">
          <div className="status-row">
            <span className={`status-pill status-${backendHealthy === false ? "error" : backendHealthy === true ? "ready" : "partial"}`}>
              {backendStatusLabel}
            </span>
            {restoredSession ? (
              <span className="status-pill status-restored">RESTORED_SESSION</span>
            ) : null}
            <HeaderToggle expertMode={expertMode} setExpertMode={setExpertMode} />
          </div>

          <div className="status-stack">
            <span>Active tab: {tabLabel(mode)}</span>
            <span>Public model alias: {activeModelAlias ?? "unresolved"}</span>
            <span>Backend context: {backendHealthLabel ?? "loading"}</span>
          </div>
        </div>
      </header>

      <section className="console-layout">
        <aside className="workspace-sidebar">
          <div className="sidebar-card sidebar-card-brand">
            <p className="app-kicker">GUIDED WORKSPACE</p>
            <strong>Arbeitsbereich wählen</strong>
            <p>Beginner first. Technik bleibt im Hintergrund, bis du Expert Mode aktivierst.</p>
          </div>

          <nav className="sidebar-nav" role="tablist" aria-label="Primary console tabs">
            <button
              type="button"
              className={mode === "chat" ? "workspace-tab workspace-tab-active workspace-tab-vertical" : "workspace-tab workspace-tab-vertical"}
              onClick={() => {
                setMode("chat");
                recordTelemetry("info", "Switched tab", "Chat tab activated.");
              }}
              role="tab"
              aria-selected={mode === "chat"}
              data-testid="tab-chat"
            >
              <WorkspaceIcon mode="chat" />
              <span>
                <strong>Chat</strong>
                <small>Fragen und Antworten</small>
              </span>
            </button>

            <button
              type="button"
              className={mode === "matrix" ? "workspace-tab workspace-tab-active workspace-tab-vertical" : "workspace-tab workspace-tab-vertical"}
              onClick={() => {
                setMode("matrix");
                recordTelemetry("info", "Switched tab", "Matrix Workspace activated.");
              }}
              role="tab"
              aria-selected={mode === "matrix"}
              data-testid="tab-matrix"
            >
              <WorkspaceIcon mode="matrix" />
              <span>
                <strong>Matrix Workspace</strong>
                <small>Governance und Freigabe</small>
              </span>
            </button>

            <button
              type="button"
              className={mode === "github" ? "workspace-tab workspace-tab-active workspace-tab-vertical" : "workspace-tab workspace-tab-vertical"}
              onClick={() => {
                setMode("github");
                recordTelemetry("info", "Switched tab", "GitHub Workspace activated.");
              }}
              role="tab"
              aria-selected={mode === "github"}
              data-testid="tab-github"
            >
              <WorkspaceIcon mode="github" />
              <span>
                <strong>GitHub Workspace</strong>
                <small>Repo lesen und Vorschläge prüfen</small>
              </span>
            </button>
          </nav>

          <div className="sidebar-card sidebar-card-safety">
            <span className="info-label">Safety</span>
            <strong>{mode === "github" ? "Nur Lesen aktiv" : "Backend Stable"}</strong>
            <p>
              {mode === "github"
                ? "Änderungen bleiben gesperrt, bis du die Freigabe bewusst auslöst."
                : "Der Browser zeigt nur Zustand und Intention; Ausführung bleibt im Backend."}
            </p>
          </div>
        </aside>

        <section className="console-main">
          {mode === "chat" ? (
            <ChatWorkspace
              backendHealthy={backendHealthy}
              backendHealthLabel={backendHealthLabel}
              activeModelAlias={activeModelAlias}
              availableModels={availableModels}
              onActiveModelAliasChange={setActiveModelAlias}
              onTelemetry={recordTelemetry}
            />
          ) : mode === "matrix" ? (
            <MatrixWorkspace
              restoredSession={restoredSession}
              onTelemetry={recordTelemetry}
            />
          ) : (
            <GitHubWorkspace
              backendHealthy={backendHealthy}
              backendHealthLabel={backendHealthLabel}
              expertMode={expertMode}
              onTelemetry={recordTelemetry}
              onContextChange={setGitHubContext}
            />
          )}
        </section>

        <aside className={logsExpanded ? "telemetry-dock telemetry-dock-expanded" : "telemetry-dock"}>
          <header className="telemetry-header">
            <div>
              <span>{mode === "github" ? "Projektstatus" : "System context"}</span>
              <strong>{mode === "github" ? "Projektstatus" : "Bounded telemetry"}</strong>
            </div>
            <div className="telemetry-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setLogsExpanded((current) => !current)}
              >
                {logsExpanded ? "Hide logs" : "Show logs"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setTelemetry([])}
              >
                Clear
              </button>
            </div>
          </header>

          {systemContextPanel}

          <div className="telemetry-feed" aria-live="polite">
            {telemetry.length === 0 ? (
              <p className="empty-state">No local events captured yet.</p>
            ) : null}
            {telemetry.map((entry) => (
              <article key={entry.id} className={`telemetry-item ${kindClass(entry.kind)}`}>
                <strong>{entry.label}</strong>
                {entry.detail ? <p>{entry.detail}</p> : null}
              </article>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
