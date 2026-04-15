import { useEffect, useState } from "react";
import { ChatWorkspace } from "./components/ChatWorkspace.js";
import { MatrixWorkspace } from "./components/MatrixWorkspace.js";
import { fetchHealth, fetchModels } from "./lib/api.js";

type WorkspaceMode = "chat" | "matrix";

type TelemetryEntry = {
  id: string;
  kind: "info" | "warning" | "error";
  label: string;
  detail?: string;
};

type PersistedShellState = {
  activeTab?: WorkspaceMode;
  logsExpanded?: boolean;
};

const SHELL_STORAGE_KEY = "modelgate.console.shell.v1";
const MATRIX_STORAGE_KEY = "modelgate.console.matrix.v1";

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
  return kind === "error" ? "telemetry-item-error" : kind === "warning" ? "telemetry-item-warning" : "telemetry-item-info";
}

function tabLabel(mode: WorkspaceMode) {
  return mode === "chat" ? "Chat" : "Matrix Workspace";
}

function appendTelemetry(current: TelemetryEntry[], entry: TelemetryEntry) {
  return [...current, entry].slice(-8);
}

export default function App() {
  const persisted = readPersistedShellState();
  const [mode, setMode] = useState<WorkspaceMode>(persisted?.activeTab ?? "chat");
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null);
  const [backendHealthLabel, setBackendHealthLabel] = useState<string | null>(null);
  const [activeModelAlias, setActiveModelAlias] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [logsExpanded, setLogsExpanded] = useState(persisted?.logsExpanded ?? false);
  const [restoredSession] = useState(Boolean(persisted));
  const [telemetry, setTelemetry] = useState<TelemetryEntry[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadConsoleState() {
      const [healthResult, modelsResult] = await Promise.allSettled([
        fetchHealth(),
        fetchModels()
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
            detail: `${health.service} reports ${health.mode} mode with ${health.allowedModelCount} public model(s).`
          })
        );
      } else {
        setBackendHealthy(false);
        setBackendHealthLabel(healthResult.reason instanceof Error ? healthResult.reason.message : "Backend health unavailable");
        setTelemetry((current) =>
          appendTelemetry(current, {
            id: createId(),
            kind: "error",
            label: "Backend health failed",
            detail: healthResult.reason instanceof Error ? healthResult.reason.message : "Unable to reach /health"
          })
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
            detail: `Selected alias ${modelsResult.value.defaultModel}; provider targets remain backend-owned.`
          })
        );
      } else {
        setTelemetry((current) =>
          appendTelemetry(current, {
            id: createId(),
            kind: "error",
            label: "Model list failed",
            detail: modelsResult.reason instanceof Error ? modelsResult.reason.message : "Unable to reach /models"
          })
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
      logsExpanded
    });
  }, [logsExpanded, mode]);

  function recordTelemetry(kind: TelemetryEntry["kind"], label: string, detail?: string) {
    setTelemetry((current) =>
      appendTelemetry(current, {
        id: createId(),
        kind,
        label,
        detail
      })
    );
  }

  const backendStatusLabel = backendHealthy === null ? "Backend pending" : backendHealthy ? "Backend healthy" : "Backend error";

  return (
    <main className="app-shell" data-testid="app-shell">
      <header className="global-header">
        <div className="brand-block">
          <p className="app-kicker">SOVEREIGN CONSOLE</p>
          <h1>Thin consumer overlay for ModelGate</h1>
          <p className="app-deck">
            The backend owns provider calls, routing, Matrix writes, and stream framing. The browser only renders, consumes, and submits intent.
          </p>
        </div>

        <div className="header-status">
          <div className="status-row">
            <span className={`status-pill status-${backendHealthy === false ? "error" : backendHealthy === true ? "ready" : "partial"}`}>
              {backendStatusLabel}
            </span>
            {restoredSession ? <span className="status-pill status-restored">RESTORED_SESSION</span> : null}
          </div>

          <div className="status-stack">
            <span>Active tab: {tabLabel(mode)}</span>
            <span>Public model alias: {activeModelAlias ?? "unresolved"}</span>
            <span>Backend context: {backendHealthLabel ?? "loading"}</span>
          </div>
        </div>
      </header>

      <nav className="top-tab-nav" role="tablist" aria-label="Primary console tabs">
        <button
          type="button"
          className={mode === "chat" ? "workspace-tab workspace-tab-active" : "workspace-tab"}
          onClick={() => {
            setMode("chat");
            recordTelemetry("info", "Switched tab", "Chat tab activated.");
          }}
          role="tab"
          aria-selected={mode === "chat"}
          data-testid="tab-chat"
        >
          Chat
        </button>
        <button
          type="button"
          className={mode === "matrix" ? "workspace-tab workspace-tab-active" : "workspace-tab"}
          onClick={() => {
            setMode("matrix");
            recordTelemetry("info", "Switched tab", "Matrix Workspace activated.");
          }}
          role="tab"
          aria-selected={mode === "matrix"}
          data-testid="tab-matrix"
        >
          Matrix Workspace
        </button>
        <button
          type="button"
          className="workspace-tab workspace-tab-secondary"
          onClick={() => setLogsExpanded((current) => !current)}
        >
          {logsExpanded ? "Hide logs" : "Show logs"}
        </button>
      </nav>

      <section className="console-layout">
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
          ) : (
            <MatrixWorkspace
              restoredSession={restoredSession}
              onTelemetry={recordTelemetry}
            />
          )}
        </section>

        <aside className={logsExpanded ? "telemetry-dock telemetry-dock-expanded" : "telemetry-dock"}>
          <header className="telemetry-header">
            <div>
              <span>System context</span>
              <strong>Bounded telemetry</strong>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setTelemetry([])}
            >
              Clear
            </button>
          </header>

          <div className="telemetry-feed" aria-live="polite">
            {telemetry.length === 0 ? <p className="empty-state">No local events captured yet.</p> : null}
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
