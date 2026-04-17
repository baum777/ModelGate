import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { ChatWorkspace } from "./components/ChatWorkspace.js";
import { GitHubAdminLogin } from "./components/GitHubAdminLogin.js";
import {
  GitHubWorkspace,
  type GitHubWorkspaceStatus,
} from "./components/GitHubWorkspace.js";
import {
  MatrixWorkspace,
  type MatrixWorkspaceStatus,
} from "./components/MatrixWorkspace.js";
import {
  ReviewWorkspace,
  type ReviewItem,
} from "./components/ReviewWorkspace.js";
import {
  SettingsWorkspace,
  type DiagnosticEntry,
} from "./components/SettingsWorkspace.js";
import { StatusPanel, type StatusPanelRow } from "./components/StatusPanel.js";
import {
  fetchAuthSession,
  fetchHealth,
  fetchModels,
  loginAdmin,
  logoutAdmin
} from "./lib/api.js";
import {
  createInitialGitHubAuthState,
  describeGitHubAuthError,
  githubAuthReducer,
  type GitHubAuthState
} from "./lib/github-auth.js";

type WorkspaceMode = "chat" | "github" | "matrix" | "review" | "settings";

type TelemetryEntry = {
  id: string;
  kind: "info" | "warning" | "error";
  label: string;
  detail?: string;
};

type PersistedShellState = {
  activeTab?: WorkspaceMode;
  expertMode?: boolean;
};

const SHELL_STORAGE_KEY = "modelgate.console.shell.v2";

const DEFAULT_GITHUB_CONTEXT: GitHubWorkspaceStatus = {
  repositoryLabel: "Noch kein GitHub-Repo ausgewählt",
  connectionLabel: "Nicht verbunden",
  accessLabel: "Nur Lesen",
  analysisLabel: "Noch nicht gestartet",
  proposalLabel: "Noch nicht erstellt",
  approvalLabel: "Nicht erforderlich",
  resultLabel: "Noch nicht gestartet",
  safetyText: "Die App kann Informationen ansehen, aber nichts verändern.",
  expertDetails: {
    requestId: null,
    planId: null,
    branchName: null,
    apiStatus: "Backend-Routen aktiv",
    sseEvents: [],
    rawDiffPreview: null,
    selectedRepoSlug: null,
  },
};

const DEFAULT_MATRIX_CONTEXT: MatrixWorkspaceStatus = {
  scopeLabel: "Noch kein Bereich gewählt",
  summaryLabel: "Noch keine Zusammenfassung",
  approvalLabel: "Nicht erforderlich",
  safetyText: "Die App kann Informationen ansehen, aber nichts verändern.",
  expertDetails: {
    route: "Backend-Routen aktiv",
    requestId: null,
    planId: null,
    roomId: null,
    spaceId: null,
    eventId: null,
    httpStatus: null,
    latency: null,
    backendRouteStatus: "Bereit",
    runtimeEventTrail: [],
    sseLifecycle: "idle",
    rawPayload: null,
  },
  reviewItems: [],
};

function createId() {
  return crypto.randomUUID();
}

function readPersistedShellState(): PersistedShellState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(SHELL_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedShellState) : null;
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

function appendTelemetry(current: TelemetryEntry[], entry: TelemetryEntry) {
  return [...current, entry].slice(-8);
}

function tabLabel(mode: WorkspaceMode) {
  switch (mode) {
    case "github":
      return "GitHub Workspace";
    case "matrix":
      return "Matrix Workspace";
    case "review":
      return "Review";
    case "settings":
      return "Settings";
    default:
      return "Chat";
  }
}

function WorkspaceIcon({ mode }: { mode: WorkspaceMode }) {
  switch (mode) {
    case "github":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M6 6.75A2.75 2.75 0 0 1 8.75 4H15l3 3v10.25A2.75 2.75 0 0 1 15.25 20H8.75A2.75 2.75 0 0 1 6 17.25V6.75Z" />
          <path d="M15 4v3h3" />
          <path d="M8.5 11.25h7" />
          <path d="M8.5 14.5h7" />
        </svg>
      );
    case "matrix":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <rect x="4" y="4" width="6" height="6" rx="1.5" />
          <rect x="14" y="4" width="6" height="6" rx="1.5" />
          <rect x="4" y="14" width="6" height="6" rx="1.5" />
          <rect x="14" y="14" width="6" height="6" rx="1.5" />
        </svg>
      );
    case "review":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M6 5.5A1.5 1.5 0 0 1 7.5 4h9A1.5 1.5 0 0 1 18 5.5v11A1.5 1.5 0 0 1 16.5 18H10l-4 4v-3.5A1.5 1.5 0 0 1 4.5 17V5.5Z" />
          <path d="M8 8.5h8" />
          <path d="M8 11.5h8" />
          <path d="M8 14.5h5" />
        </svg>
      );
    case "settings":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 8.5A3.5 3.5 0 1 1 12 15.5A3.5 3.5 0 0 1 12 8.5Z" />
          <path d="M4.5 12a7.5 7.5 0 0 1 .2-1.7l2-.4a6.7 6.7 0 0 1 .8-1.3l-1.2-1.7a8 8 0 0 1 2.4-2.4l1.7 1.2c.4-.3.9-.6 1.3-.8l.4-2A7.5 7.5 0 0 1 12 4.5c.6 0 1.1.1 1.7.2l.4 2c.5.2 1 .5 1.3.8l1.7-1.2a8 8 0 0 1 2.4 2.4l-1.2 1.7c.3.4.6.9.8 1.3l2 .4a7.5 7.5 0 0 1 0 3.4l-2 .4c-.2.5-.5 1-.8 1.3l1.2 1.7a8 8 0 0 1-2.4 2.4l-1.7-1.2c-.4.3-.9.6-1.3.8l-.4 2a7.5 7.5 0 0 1-3.4 0l-.4-2c-.5-.2-1-.5-1.3-.8l-1.7 1.2a8 8 0 0 1-2.4-2.4l1.2-1.7c-.3-.4-.6-.9-.8-1.3l-2-.4A7.5 7.5 0 0 1 4.5 12Z" />
        </svg>
      );
    case "chat":
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

function BeginnerExpertToggle({
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

function mergeReviewItems(current: ReviewItem[], next: ReviewItem[]) {
  const remaining = current.filter(
    (item) => !next.some((candidate) => candidate.id === item.id && candidate.source === item.source),
  );
  return [...remaining, ...next];
}

export default function App() {
  const persisted = readPersistedShellState();
  const [mode, setMode] = useState<WorkspaceMode>(persisted?.activeTab ?? "chat");
  const [expertMode, setExpertMode] = useState(persisted?.expertMode ?? false);
  const [githubAuthState, dispatchGitHubAuth] = useReducer(githubAuthReducer, undefined, createInitialGitHubAuthState);
  const [githubPassword, setGitHubPassword] = useState("");
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null);
  const [backendHealthLabel, setBackendHealthLabel] = useState<string | null>(null);
  const [activeModelAlias, setActiveModelAlias] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [restoredSession] = useState(Boolean(persisted));
  const [telemetry, setTelemetry] = useState<TelemetryEntry[]>([]);
  const [githubContext, setGitHubContext] = useState<GitHubWorkspaceStatus>(DEFAULT_GITHUB_CONTEXT);
  const [matrixContext, setMatrixContext] = useState<MatrixWorkspaceStatus>(DEFAULT_MATRIX_CONTEXT);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const githubUnlocked = githubAuthState.status === "authenticated";

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
    let cancelled = false;

    async function loadGitHubSession() {
      dispatchGitHubAuth({
        type: "session_check_started"
      });

      try {
        const session = await fetchAuthSession();

        if (cancelled) {
          return;
        }

        dispatchGitHubAuth({
          type: "session_check_succeeded",
          authenticated: session.authenticated
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        dispatchGitHubAuth({
          type: "session_check_failed",
          error: error instanceof Error ? error.message : "GitHub-Session konnte nicht geprüft werden."
        });
      }
    }

    void loadGitHubSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    persistShellState({
      activeTab: mode,
      expertMode,
    });
  }, [expertMode, mode]);

  useEffect(() => {
    if (!githubUnlocked) {
      setGitHubContext(DEFAULT_GITHUB_CONTEXT);
      setReviewItems((current) => current.filter((item) => item.source !== "github"));
    }
  }, [githubUnlocked]);

  const recordTelemetry = useCallback(
    (kind: TelemetryEntry["kind"], label: string, detail?: string) => {
      setTelemetry((current) =>
        appendTelemetry(current, {
          id: createId(),
          kind,
          label,
          detail,
        }),
      );
    },
    [],
  );

  const updateGitHubReviewItems = useCallback((items: ReviewItem[]) => {
    setReviewItems((current) => mergeReviewItems(current.filter((item) => item.source !== "github"), items));
  }, []);

  const updateMatrixReviewItems = useCallback((items: ReviewItem[]) => {
    setReviewItems((current) => mergeReviewItems(current.filter((item) => item.source !== "matrix"), items));
  }, []);

  const removeModeReviewItems = useCallback((source: ReviewItem["source"]) => {
    setReviewItems((current) => current.filter((item) => item.source !== source));
  }, []);

  const handleGitHubLogin = useCallback(async () => {
    const password = githubPassword;

    if (password.trim().length === 0 || githubAuthState.busy) {
      return;
    }

    dispatchGitHubAuth({
      type: "login_started"
    });

    try {
      await loginAdmin(password);
      dispatchGitHubAuth({
        type: "login_succeeded"
      });
      setGitHubPassword("");
    } catch (error) {
      dispatchGitHubAuth({
        type: "login_failed",
        error: error instanceof Error ? describeGitHubAuthError(error.message) : "GitHub login failed."
      });
      setGitHubPassword("");
    }
  }, [githubAuthState.busy, githubPassword]);

  const handleGitHubLogout = useCallback(async () => {
    if (githubAuthState.busy) {
      return;
    }

    dispatchGitHubAuth({
      type: "logout_started"
    });

    try {
      await logoutAdmin();
      dispatchGitHubAuth({
        type: "logout_succeeded"
      });
      setGitHubPassword("");
      setGitHubContext(DEFAULT_GITHUB_CONTEXT);
      removeModeReviewItems("github");
    } catch (error) {
      dispatchGitHubAuth({
        type: "logout_failed",
        error: error instanceof Error ? describeGitHubAuthError(error.message) : "GitHub logout failed."
      });
    }
  }, [githubAuthState.busy, removeModeReviewItems]);

  const chatRows: StatusPanelRow[] = [
    { label: "Modell", value: activeModelAlias ?? "Noch nicht gewählt" },
    { label: "Kontext", value: availableModels.length > 0 ? "Modell verfügbar" : "Keine Auswahl" },
    { label: "Status", value: backendHealthy === true ? "Bereit" : backendHealthy === false ? "Nicht verfügbar" : "Wird geprüft" },
    { label: "Sicherheit", value: "Nur Lesen aktiv" },
  ];

  const githubRows: StatusPanelRow[] = [
    { label: "Repository", value: githubContext.repositoryLabel },
    { label: "Lesestatus", value: githubContext.analysisLabel },
    { label: "Vorschlag", value: githubContext.proposalLabel },
    { label: "Freigabe", value: githubUnlocked ? githubContext.approvalLabel : "Admin-Login erforderlich" },
    { label: "Ergebnis", value: githubContext.resultLabel },
    { label: "Sicherheit", value: githubUnlocked ? githubContext.accessLabel : "Gesperrt" },
  ];

  const matrixRows: StatusPanelRow[] = [
    { label: "Bereich", value: matrixContext.scopeLabel },
    { label: "Zusammenfassung", value: matrixContext.summaryLabel },
    { label: "Freigabe", value: matrixContext.approvalLabel },
    { label: "Sicherheit", value: "Nur Lesen aktiv" },
  ];

  const reviewRows: StatusPanelRow[] = [
    { label: "Offen", value: String(reviewItems.length) },
    { label: "Stand", value: reviewItems.length === 0 ? "Keine offenen Prüfungen" : reviewItems[0]?.status === "stale" ? "Veraltet" : "Offen" },
    { label: "Freigabe", value: reviewItems.some((item) => item.status === "pending_review") ? "Erforderlich" : "Nicht erforderlich" },
    { label: "Ausführung", value: reviewItems.some((item) => item.status === "stale") ? "Blockiert" : "Nicht gestartet" },
  ];

  const settingsRows: StatusPanelRow[] = [
    { label: "Ansicht", value: expertMode ? "Expert" : "Beginner" },
    { label: "Diagnose", value: expertMode ? "Sichtbar" : "Verborgen" },
    { label: "Freigabe", value: "Nicht erforderlich" },
    { label: "Sicherheit", value: "Keine Schreibrechte" },
  ];

  const currentRows = useMemo(() => {
    switch (mode) {
      case "github":
        return githubRows;
      case "matrix":
        return matrixRows;
      case "review":
        return reviewRows;
      case "settings":
        return settingsRows;
      default:
        return chatRows;
    }
  }, [chatRows, githubRows, matrixRows, mode, reviewRows, settingsRows]);

  const currentStatusBadge = useMemo(() => {
    switch (mode) {
      case "github":
        return githubUnlocked ? githubContext.connectionLabel : "Gesperrt";
      case "matrix":
        return matrixContext.expertDetails.backendRouteStatus ?? "Bereit";
      case "review":
        return reviewItems.length === 0 ? "Leer" : "Aktiv";
      case "settings":
        return expertMode ? "Expert Mode" : "Beginner Mode";
      default:
        return backendHealthy === false ? "Nicht verfügbar" : backendHealthy === true ? "Bereit" : "Wird geprüft";
    }
  }, [backendHealthy, expertMode, githubContext.connectionLabel, githubUnlocked, matrixContext.expertDetails.backendRouteStatus, mode, reviewItems.length]);

  const currentStatusTone = useMemo(() => {
    switch (mode) {
      case "github":
        return githubUnlocked ? "partial" : "error";
      case "matrix":
        return "ready";
      case "review":
        return reviewItems.length === 0 ? "partial" : "ready";
      case "settings":
        return "partial";
      default:
        return backendHealthy === false ? "error" : backendHealthy === true ? "ready" : "partial";
    }
  }, [backendHealthy, githubUnlocked, mode, reviewItems.length]);

  const currentExpertRows = useMemo(() => {
    switch (mode) {
      case "github":
        if (!githubUnlocked) {
          return [
            { label: "Route", value: "/api/auth/me" },
            { label: "Anmeldung", value: "Erforderlich" },
            { label: "GitHub API Status", value: githubAuthState.status === "loading" ? "Wird geprüft" : "Gesperrt" }
          ];
        }

        return [
          { label: "Route", value: "/api/github/actions/propose" },
          { label: "Anfrage-ID", value: githubContext.expertDetails.requestId ?? "n/a" },
          { label: "Plan-ID", value: githubContext.expertDetails.planId ?? "n/a" },
          { label: "Branch", value: githubContext.expertDetails.branchName ?? "n/a" },
          { label: "GitHub API Status", value: githubContext.expertDetails.apiStatus },
          { label: "Laufzeit-Ereignisse", value: githubContext.expertDetails.sseEvents.join(" · ") || "n/a" },
        ];
      case "matrix":
        return [
          { label: "Route", value: matrixContext.expertDetails.route },
          { label: "Request ID", value: matrixContext.expertDetails.requestId ?? "n/a" },
          { label: "Plan ID", value: matrixContext.expertDetails.planId ?? "n/a" },
          { label: "Room ID", value: matrixContext.expertDetails.roomId ?? "n/a" },
          { label: "Space ID", value: matrixContext.expertDetails.spaceId ?? "n/a" },
          { label: "Event ID", value: matrixContext.expertDetails.eventId ?? "n/a" },
          { label: "HTTP Status", value: matrixContext.expertDetails.httpStatus ?? "n/a" },
          { label: "Latenz", value: matrixContext.expertDetails.latency ?? "n/a" },
          { label: "Backend route status", value: matrixContext.expertDetails.backendRouteStatus },
          { label: "SSE lifecycle", value: matrixContext.expertDetails.sseLifecycle },
        ];
      case "review":
        return [
          { label: "Runtime event trail", value: reviewItems.map((item) => `${item.source}:${item.id}`).join(" · ") || "n/a" },
          { label: "Backend route status", value: reviewItems.length === 0 ? "keine offenen Routen" : "offene Vorschläge vorhanden" },
        ];
      case "settings":
        return [
          { label: "Route", value: "Settings / Diagnose" },
          { label: "Backend route status", value: expertMode ? "sichtbar" : "verborgen" },
        ];
      default:
        return [];
    }
  }, [expertMode, githubAuthState.status, githubContext.expertDetails, githubUnlocked, matrixContext.expertDetails, mode, reviewItems]);

  const currentExpertChildren = useMemo(() => {
    if (mode === "github") {
      return githubContext.expertDetails.rawDiffPreview ? (
        <pre className="github-diff-preview">{githubContext.expertDetails.rawDiffPreview}</pre>
      ) : (
        <p className="muted-copy">Diff erscheint erst, wenn ein Vorschlag vorbereitet wurde.</p>
      );
    }

    if (mode === "matrix" && matrixContext.expertDetails.rawPayload) {
      return <pre className="github-diff-preview">{matrixContext.expertDetails.rawPayload}</pre>;
    }

    return null;
  }, [githubContext.expertDetails.rawDiffPreview, matrixContext.expertDetails.rawPayload, mode]);

  const globalSafety = "Die App kann Informationen ansehen, aber nichts verändern.";

  return (
    <main className="app-shell app-shell-console" data-testid="app-shell">
      <header className="global-header">
        <div className="brand-block">
          <p className="app-kicker">MODELGATE</p>
          <h1>ModelGate Console</h1>
          <p className="app-deck">
            Beginner-friendly shell with backend-owned authority, read-only guidance, and explicit approval gates.
          </p>
        </div>

        <div className="header-status">
          <div className="status-row">
            <span className={`status-pill status-${backendHealthy === false ? "error" : backendHealthy === true ? "ready" : "partial"}`}>
              {backendHealthy === true ? "Backend healthy" : backendHealthy === false ? "Backend error" : "Backend pending"}
            </span>
            <span className={`status-pill status-${githubAuthState.status === "authenticated" ? "ready" : githubAuthState.status === "loading" ? "partial" : "error"}`}>
              {githubAuthState.status === "authenticated" ? "GitHub unlocked" : githubAuthState.status === "loading" ? "GitHub session" : "GitHub locked"}
            </span>
            {restoredSession ? <span className="status-pill status-restored">RESTORED_SESSION</span> : null}
            {githubUnlocked ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  void handleGitHubLogout();
                }}
                disabled={githubAuthState.busy}
              >
                {githubAuthState.busy ? "Abmelden…" : "Logout"}
              </button>
            ) : null}
            <BeginnerExpertToggle expertMode={expertMode} setExpertMode={setExpertMode} />
          </div>

          <div className="status-stack">
            <span>Active tab: {tabLabel(mode)}</span>
            <span>Public model alias: {activeModelAlias ?? "unresolved"}</span>
            <span>Backend context: {backendHealthLabel ?? "loading"}</span>
          </div>
        </div>
      </header>

      <section className="global-safety-bar" aria-label="Sicherheitsstatus">
        <div>
          <p className="info-label">Nur Lesen aktiv</p>
          <p>{globalSafety}</p>
        </div>
      </section>

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
              onClick={() => setMode("chat")}
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
              className={mode === "github" ? "workspace-tab workspace-tab-active workspace-tab-vertical" : "workspace-tab workspace-tab-vertical"}
              onClick={() => setMode("github")}
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

            <button
              type="button"
              className={mode === "matrix" ? "workspace-tab workspace-tab-active workspace-tab-vertical" : "workspace-tab workspace-tab-vertical"}
              onClick={() => setMode("matrix")}
              role="tab"
              aria-selected={mode === "matrix"}
              data-testid="tab-matrix"
            >
              <WorkspaceIcon mode="matrix" />
              <span>
                <strong>Matrix Workspace</strong>
                <small>Scope, Provenienz und Topic Updates</small>
              </span>
            </button>

            <button
              type="button"
              className={mode === "review" ? "workspace-tab workspace-tab-active workspace-tab-vertical" : "workspace-tab workspace-tab-vertical"}
              onClick={() => setMode("review")}
              role="tab"
              aria-selected={mode === "review"}
              data-testid="tab-review"
            >
              <WorkspaceIcon mode="review" />
              <span>
                <strong>Review</strong>
                <small>Freigaben prüfen</small>
              </span>
            </button>

            <button
              type="button"
              className={mode === "settings" ? "workspace-tab workspace-tab-active workspace-tab-vertical" : "workspace-tab workspace-tab-vertical"}
              onClick={() => setMode("settings")}
              role="tab"
              aria-selected={mode === "settings"}
              data-testid="tab-settings"
            >
              <WorkspaceIcon mode="settings" />
              <span>
                <strong>Settings</strong>
                <small>Ansicht und Diagnose</small>
              </span>
            </button>
          </nav>

          <div className="sidebar-card sidebar-card-safety">
            <span className="info-label">Safety</span>
            <strong>Nur Lesen aktiv</strong>
            <p>Änderungen bleiben gesperrt, bis du sie bewusst über Review freigibst.</p>
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
          ) : mode === "github" && githubUnlocked ? (
            <GitHubWorkspace
              backendHealthy={backendHealthy}
              backendHealthLabel={backendHealthLabel}
              expertMode={expertMode}
              onTelemetry={recordTelemetry}
              onContextChange={setGitHubContext}
              onReviewItemsChange={updateGitHubReviewItems}
            />
          ) : mode === "github" ? (
            <GitHubAdminLogin
              authState={githubAuthState}
              password={githubPassword}
              onPasswordChange={setGitHubPassword}
              onSubmit={() => {
                void handleGitHubLogin();
              }}
            />
          ) : mode === "matrix" ? (
            <MatrixWorkspace
              restoredSession={restoredSession}
              expertMode={expertMode}
              onTelemetry={recordTelemetry}
              onContextChange={setMatrixContext}
              onReviewItemsChange={updateMatrixReviewItems}
            />
          ) : mode === "review" ? (
            <ReviewWorkspace items={reviewItems} expertMode={expertMode} />
          ) : (
            <SettingsWorkspace
              expertMode={expertMode}
              onExpertModeChange={setExpertMode}
              diagnostics={telemetry as DiagnosticEntry[]}
              onClearDiagnostics={() => setTelemetry([])}
            />
          )}
        </section>

        <aside className="workspace-context">
          <StatusPanel
            title={
              mode === "github"
                ? "Projektstatus"
                : mode === "matrix"
                  ? "Matrixstatus"
                  : mode === "review"
                    ? "Reviewstatus"
                    : mode === "settings"
                      ? "Systemstatus"
                      : "Chatstatus"
            }
            headline={
              mode === "github"
                ? githubUnlocked
                  ? githubContext.accessLabel
                  : "Anmeldung erforderlich"
                : mode === "matrix"
                  ? matrixContext.approvalLabel
                  : mode === "review"
                    ? reviewItems.length === 0
                      ? "Noch nichts offen"
                      : "Prüfung offen"
                    : mode === "settings"
                      ? expertMode
                        ? "Expert Mode"
                        : "Beginner Mode"
                      : "Bereit"
            }
            badge={currentStatusBadge}
            badgeTone={currentStatusTone}
            rows={currentRows}
            safetyTitle="Sicherheit"
            safetyText=""
            expertMode={expertMode}
            expertRows={currentExpertRows}
            expertChildren={currentExpertChildren}
          />
        </aside>
      </section>
    </main>
  );
}
