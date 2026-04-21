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
import { SessionList } from "./components/SessionList.js";
import {
  type StatusPanelRow,
} from "./components/StatusPanel.js";
import { DiagnosticsDrawer } from "./components/ExpertDetails.js";
import {
  MutedSystemCopy,
  SectionLabel,
  ShellCard,
  StatusBadge,
  TruthRailSection,
} from "./components/ShellPrimitives.js";
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
import {
  appendSession,
  createChatSessionMetadata,
  createGitHubSessionMetadata,
  createMatrixSessionMetadata,
  createSession,
  deleteSession,
  loadWorkspaceState,
  saveWorkspaceState,
  selectSession,
  updateSession,
  type WorkspaceKind,
  type WorkspaceSession,
  type ChatSession,
  type GitHubSession,
  type MatrixSession
} from "./lib/workspace-state.js";
import {
  deriveShellHealthState,
  summarizePendingApprovals,
} from "./lib/shell-view-model.js";

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
  identityLabel: "Identität wird geprüft",
  connectionLabel: "Wird geprüft",
  homeserverLabel: "n/a",
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
    composerMode: "post",
    composerRoomId: null,
    composerEventId: null,
    composerThreadRootId: null,
    composerTargetLabel: "Neuer Post",
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

function tabDescription(mode: WorkspaceMode) {
  switch (mode) {
    case "github":
      return "Repo lesen und Vorschläge prüfen";
    case "matrix":
      return "Scope, Provenienz und Topic Updates";
    case "review":
      return "Freigaben prüfen";
    case "settings":
      return "Ansicht und Diagnose";
    default:
      return "Fragen und Antworten";
  }
}

const WORKSPACE_MODES: WorkspaceMode[] = ["chat", "github", "matrix", "review", "settings"];

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

function isSessionWorkspace(mode: WorkspaceMode): mode is WorkspaceKind {
  return mode === "chat" || mode === "github" || mode === "matrix";
}

function nowIso() {
  return new Date().toISOString();
}

function sessionStatusCopy(status: WorkspaceSession<unknown>["status"]) {
  switch (status) {
    case "in_progress":
      return "In Arbeit";
    case "review_required":
      return "Freigabe nötig";
    case "done":
      return "Bereit";
    case "failed":
      return "Fehler";
    default:
      return "Entwurf";
  }
}

export default function App() {
  const persisted = readPersistedShellState();
  const [mode, setMode] = useState<WorkspaceMode>(persisted?.activeTab ?? "chat");
  const [expertMode, setExpertMode] = useState(persisted?.expertMode ?? false);
  const [workspaceState, setWorkspaceState] = useState(() => loadWorkspaceState());
  const [githubAuthState, dispatchGitHubAuth] = useReducer(githubAuthReducer, undefined, createInitialGitHubAuthState);
  const [githubPassword, setGitHubPassword] = useState("");
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null);
  const [activeModelAlias, setActiveModelAlias] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelRegistry, setModelRegistry] = useState<Array<{
    alias: string;
    label: string;
    description: string;
    capabilities: string[];
    tier: "core" | "specialized" | "fallback";
    streaming: boolean;
    recommendedFor: string[];
    default?: boolean;
    available?: boolean;
  }>>([]);
  const [restoredSession] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem("modelgate.console.workspaces.v1") !== null;
  });
  const [telemetry, setTelemetry] = useState<TelemetryEntry[]>([]);
  const [githubContext, setGitHubContext] = useState<GitHubWorkspaceStatus>(DEFAULT_GITHUB_CONTEXT);
  const [matrixContext, setMatrixContext] = useState<MatrixWorkspaceStatus>(DEFAULT_MATRIX_CONTEXT);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
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
        setModelRegistry(modelsResult.value.registry ?? []);
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
    saveWorkspaceState(workspaceState);
  }, [workspaceState]);

  useEffect(() => {
    if (!expertMode) {
      setDiagnosticsOpen(false);
    }
  }, [expertMode]);

  useEffect(() => {
    setDiagnosticsOpen(false);
  }, [mode]);

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

  const handleWorkspaceTabSelect = useCallback((nextMode: WorkspaceMode) => {
    setMode(nextMode);

    if (isSessionWorkspace(nextMode)) {
      setWorkspaceState((current) => {
        const activeSessionId = current.activeSessionIdByWorkspace[nextMode];
        return selectSession(current, nextMode, activeSessionId);
      });
    }
  }, []);

  const handleWorkspaceSessionCreate = useCallback((workspace: WorkspaceKind) => {
    const now = nowIso();

    setMode(workspace);
    setWorkspaceState((current) => {
      switch (workspace) {
        case "github":
          return appendSession(
            current,
            "github",
            createSession("github", createGitHubSessionMetadata(), {
              createdAt: now,
              updatedAt: now,
              lastOpenedAt: now,
            }),
          );
        case "matrix":
          return appendSession(
            current,
            "matrix",
            createSession("matrix", createMatrixSessionMetadata(), {
              createdAt: now,
              updatedAt: now,
              lastOpenedAt: now,
            }),
          );
        case "chat":
        default:
          return appendSession(
            current,
            "chat",
            createSession(
              "chat",
              {
                ...createChatSessionMetadata(),
                selectedModelAlias: activeModelAlias,
              },
              {
                createdAt: now,
                updatedAt: now,
                lastOpenedAt: now,
              },
            ),
          );
      }
    });
  }, [activeModelAlias]);

  const handleWorkspaceSessionSelect = useCallback((workspace: WorkspaceKind, sessionId: string) => {
    setMode(workspace);
    setWorkspaceState((current) => selectSession(current, workspace, sessionId));
  }, []);

  const handleWorkspaceSessionArchive = useCallback((workspace: WorkspaceKind, sessionId: string) => {
    setWorkspaceState((current) =>
      updateSession(current, workspace, sessionId, (session) => ({
        ...session,
        archived: true,
        resumable: false,
        updatedAt: nowIso(),
        lastOpenedAt: nowIso(),
      })),
    );
  }, []);

  const handleWorkspaceSessionDelete = useCallback((workspace: WorkspaceKind, sessionId: string) => {
    setWorkspaceState((current) => deleteSession(current, workspace, sessionId));
  }, []);

  const handleChatSessionChange = useCallback((session: ChatSession) => {
    setWorkspaceState((current) => updateSession(current, "chat", session.id, () => session));
  }, []);

  const handleGitHubSessionChange = useCallback((session: GitHubSession) => {
    setWorkspaceState((current) => updateSession(current, "github", session.id, () => session));
  }, []);

  const handleMatrixSessionChange = useCallback((session: MatrixSession) => {
    setWorkspaceState((current) => updateSession(current, "matrix", session.id, () => session));
  }, []);

  const sessionWorkspace = isSessionWorkspace(mode) ? mode : workspaceState.activeWorkspace;
  const sessionWorkspaceSessions = workspaceState.sessionsByWorkspace[sessionWorkspace] as WorkspaceSession<unknown>[];
  const sessionWorkspaceActiveId = workspaceState.activeSessionIdByWorkspace[sessionWorkspace];
  const activeSession = sessionWorkspaceSessions.find((session) => session.id === sessionWorkspaceActiveId) ?? sessionWorkspaceSessions[0] ?? null;
  const chatSession = (workspaceState.sessionsByWorkspace.chat.find((session) => session.id === workspaceState.activeSessionIdByWorkspace.chat) ?? workspaceState.sessionsByWorkspace.chat[0]) as ChatSession;
  const githubSession = (workspaceState.sessionsByWorkspace.github.find((session) => session.id === workspaceState.activeSessionIdByWorkspace.github) ?? workspaceState.sessionsByWorkspace.github[0]) as GitHubSession;
  const matrixSession = (workspaceState.sessionsByWorkspace.matrix.find((session) => session.id === workspaceState.activeSessionIdByWorkspace.matrix) ?? workspaceState.sessionsByWorkspace.matrix[0]) as MatrixSession;

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

  const chatPendingProposal = chatSession?.metadata.chatState.pendingProposal ?? null;
  const chatLatestReceipt = chatSession?.metadata.chatState.receipts.at(-1) ?? null;
  const chatGovernanceState = chatPendingProposal
    ? chatPendingProposal.status === "pending"
      ? "Freigabe ausstehend"
      : "Ausführung läuft"
    : chatLatestReceipt
      ? chatLatestReceipt.outcome === "executed"
        ? "Letzte Ausführung bestätigt"
        : chatLatestReceipt.outcome === "rejected"
          ? "Vorschlag verworfen"
          : "Letzte Ausführung fehlgeschlagen"
      : "Kein offener Vorschlag";

  const chatRows: StatusPanelRow[] = [
    { label: "Modell", value: activeModelAlias ?? "Noch nicht gewählt" },
    { label: "Governance", value: chatGovernanceState },
    {
      label: "Verfügbarkeit",
      value:
        backendHealthy === true
          ? "Bereit"
          : backendHealthy === false
            ? "Nicht verfügbar"
            : "Wird geprüft",
    },
  ];

  const githubRows: StatusPanelRow[] = [
    { label: "Repository", value: githubContext.repositoryLabel },
    { label: "Verbindung", value: githubContext.connectionLabel },
    { label: "Zugriff", value: githubUnlocked ? githubContext.accessLabel : "Nicht angemeldet" },
    ...(githubUnlocked && githubContext.approvalLabel !== "Nicht erforderlich"
      ? [{ label: "Freigabe", value: githubContext.approvalLabel }]
      : []),
  ];

  const matrixRows: StatusPanelRow[] = [
    { label: "Identität", value: matrixContext.identityLabel },
    { label: "Verbindung", value: matrixContext.connectionLabel },
    { label: "Bereich", value: matrixContext.scopeLabel },
    { label: "Zusammenfassung", value: matrixContext.summaryLabel },
    ...(matrixContext.approvalLabel !== "Nicht erforderlich"
      ? [{ label: "Freigabe", value: matrixContext.approvalLabel }]
      : []),
  ];

  const reviewRows: StatusPanelRow[] = [
    { label: "Offene Prüfungen", value: String(reviewItems.length) },
    {
      label: "Einordnung",
      value:
        reviewItems.length === 0
          ? "Keine offenen Prüfungen"
          : reviewItems.some((item) => item.status === "stale")
            ? "Blockiert"
            : reviewItems.some((item) => item.status === "pending_review")
              ? "Freigabe nötig"
              : "Bereit",
    },
  ];

  const settingsTruthSnapshot = {
    backend: {
      label:
        backendHealthy === false
          ? "Nicht verfügbar"
          : backendHealthy === true
            ? "Bereit"
            : "Wird geprüft",
      detail:
        backendHealthy === false
          ? "Backend health is unavailable; the shell remains fail-closed."
          : backendHealthy === true
            ? "Backend health is available."
            : "Backend health is being checked.",
    },
    github: {
      sessionLabel:
        githubAuthState.status === "authenticated"
          ? "Angemeldet"
          : githubAuthState.status === "loading"
            ? "Session wird geprüft"
            : githubAuthState.error
              ? "Fehler"
              : "Nicht angemeldet",
      connectionLabel: githubContext.connectionLabel,
      repositoryLabel: githubContext.repositoryLabel,
      accessLabel: githubUnlocked ? githubContext.accessLabel : "Nicht angemeldet",
    },
    matrix: {
      identityLabel: matrixContext.identityLabel,
      connectionLabel: matrixContext.connectionLabel,
      homeserverLabel: matrixContext.homeserverLabel,
      scopeLabel: matrixContext.scopeLabel,
    },
    models: {
      activeAlias: activeModelAlias ?? "Noch nicht gewählt",
      availableCount: availableModels.length,
      registrySourceLabel: modelRegistry.length > 0 ? "backend-policy" : "n/a",
    },
  };

  const settingsRows: StatusPanelRow[] = [
    { label: "Backend", value: settingsTruthSnapshot.backend.label },
    { label: "GitHub", value: `${settingsTruthSnapshot.github.sessionLabel} · ${settingsTruthSnapshot.github.accessLabel}` },
    { label: "Matrix", value: `${settingsTruthSnapshot.matrix.identityLabel} · ${settingsTruthSnapshot.matrix.connectionLabel}` },
    { label: "Modell", value: settingsTruthSnapshot.models.activeAlias },
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
        if (!githubUnlocked) {
          return githubAuthState.error ? "Verbindung prüfen" : "Nicht angemeldet";
        }

        if (githubContext.connectionLabel !== "Bereit") {
          return githubContext.connectionLabel;
        }

        if (githubContext.approvalLabel !== "Nicht erforderlich") {
          return "Freigabe nötig";
        }

        if (githubContext.repositoryLabel.startsWith("Noch kein")) {
          return "Repo wählen";
        }

        return githubContext.connectionLabel;
      case "matrix":
        if (matrixContext.connectionLabel !== "Verbunden") {
          return matrixContext.connectionLabel;
        }

        if (matrixContext.approvalLabel !== "Nicht erforderlich") {
          return "Freigabe nötig";
        }

        if (matrixContext.scopeLabel.startsWith("Noch kein")) {
          return "Bereich wählen";
        }

        if (matrixContext.summaryLabel.startsWith("Noch keine")) {
          return "Zusammenfassung fehlt";
        }

        return "Bereit";
      case "review":
        if (reviewItems.length === 0) {
          return "Leer";
        }

        if (reviewItems.some((item) => item.status === "stale")) {
          return "Blockiert";
        }

        if (reviewItems.some((item) => item.status === "pending_review")) {
          return "Freigabe nötig";
        }

        return "Aktiv";
      case "settings":
        if (backendHealthy === false) {
          return "Backend prüfen";
        }

        if (githubAuthState.error) {
          return "GitHub prüfen";
        }

        if (githubAuthState.status === "loading") {
          return "Session prüfen";
        }

        if (!githubUnlocked) {
          return "GitHub gesperrt";
        }

        if (matrixContext.connectionLabel === "Nicht verbunden") {
          return "Matrix prüfen";
        }

        if (!activeModelAlias) {
          return "Modell wählen";
        }

        return "Kontrollzentrum";
      default:
        if (chatPendingProposal?.status === "pending") {
          return "Freigabe nötig";
        }

        if (chatPendingProposal?.status === "executing") {
          return "Ausführung";
        }

        if (chatLatestReceipt?.outcome === "failed" || chatLatestReceipt?.outcome === "unverifiable") {
          return "Fehlgeschlagen";
        }

        return backendHealthy === false ? "Nicht verfügbar" : backendHealthy === true ? "Bereit" : "Wird geprüft";
    }
  }, [
    backendHealthy,
    chatLatestReceipt?.outcome,
    chatPendingProposal?.status,
    expertMode,
    githubAuthState.error,
    githubAuthState.status,
    githubContext.approvalLabel,
    githubContext.connectionLabel,
    githubContext.repositoryLabel,
    githubUnlocked,
    backendHealthy,
    activeModelAlias,
    matrixContext.approvalLabel,
    matrixContext.connectionLabel,
    matrixContext.scopeLabel,
    matrixContext.summaryLabel,
    mode,
    reviewItems,
  ]);

  const healthState = useMemo(() => deriveShellHealthState(backendHealthy), [backendHealthy]);
  const approvalSummary = useMemo(() => {
    const base = summarizePendingApprovals(reviewItems);
    const chatPending = chatPendingProposal?.status === "pending" ? 1 : 0;
    return {
      ...base,
      pending: base.pending + chatPending,
      hasApprovals: base.hasApprovals || chatPending > 0,
      chatPending,
    };
  }, [chatPendingProposal?.status, reviewItems]);
  const workspaceName = tabLabel(mode);
  const workspaceContextTitle = `${workspaceName} Kontext`;
  const diagnosticsTitle = mode === "github"
    ? "GitHub diagnostics"
    : mode === "matrix"
      ? "Matrix diagnostics"
      : mode === "review"
        ? "Review diagnostics"
        : mode === "settings"
          ? "Settings diagnostics"
          : "Chat diagnostics";
  const showBeginnerDiagnostics = !expertMode && healthState.tone === "error";
  const diagnosticsAccessible = expertMode || showBeginnerDiagnostics;

  const currentStatusTone = useMemo(() => {
    switch (mode) {
      case "github":
        if (!githubUnlocked) {
          return githubAuthState.error ? "error" : "partial";
        }

        if (githubContext.connectionLabel !== "Bereit") {
          return githubContext.connectionLabel === "Nicht verbunden" ? "error" : "partial";
        }

        return githubContext.approvalLabel !== "Nicht erforderlich" || githubContext.repositoryLabel.startsWith("Noch kein")
          ? "partial"
          : "ready";
      case "matrix":
        if (matrixContext.connectionLabel === "Nicht verbunden") {
          return "error";
        }

        if (matrixContext.connectionLabel !== "Verbunden") {
          return "partial";
        }

        return matrixContext.approvalLabel !== "Nicht erforderlich" || matrixContext.scopeLabel.startsWith("Noch kein") || matrixContext.summaryLabel.startsWith("Noch keine")
          ? "partial"
          : "ready";
      case "review":
        if (reviewItems.length === 0) {
          return "partial";
        }

        if (reviewItems.some((item) => item.status === "stale")) {
          return "error";
        }

        return reviewItems.some((item) => item.status === "pending_review") ? "partial" : "ready";
      case "settings":
        if (backendHealthy === false) {
          return "error";
        }

        if (githubAuthState.error) {
          return "error";
        }

        if (githubAuthState.status === "loading" || !githubUnlocked || matrixContext.connectionLabel === "Wird geprüft") {
          return "partial";
        }

        if (matrixContext.connectionLabel === "Nicht verbunden") {
          return "error";
        }

        if (!activeModelAlias) {
          return "partial";
        }

        return "ready";
      default:
        if (chatPendingProposal?.status === "pending" || chatPendingProposal?.status === "executing") {
          return "partial";
        }

        if (chatLatestReceipt?.outcome === "failed" || chatLatestReceipt?.outcome === "unverifiable") {
          return "error";
        }

        return backendHealthy === false ? "error" : backendHealthy === true ? "ready" : "partial";
    }
  }, [
    backendHealthy,
    chatLatestReceipt?.outcome,
    chatPendingProposal?.status,
    githubAuthState.error,
    githubAuthState.status,
    githubContext.approvalLabel,
    githubContext.connectionLabel,
    githubContext.repositoryLabel,
    githubUnlocked,
    backendHealthy,
    activeModelAlias,
    matrixContext.connectionLabel,
    matrixContext.approvalLabel,
    matrixContext.scopeLabel,
    matrixContext.summaryLabel,
    mode,
    reviewItems,
  ]);

  const currentStatusHeadline = useMemo(() => {
    switch (mode) {
      case "github":
        if (!githubUnlocked) {
          return githubAuthState.error ? "GitHub-Sessionprüfung fehlgeschlagen." : "Admin-Anmeldung erforderlich.";
        }

        if (githubContext.connectionLabel !== "Bereit") {
          return githubContext.connectionLabel === "Nicht verbunden"
            ? "GitHub-Verbindung ist nicht verfügbar."
            : "GitHub-Verbindung wird geprüft.";
        }

        if (githubContext.approvalLabel !== "Nicht erforderlich") {
          return "Vorschlag wartet auf Freigabe.";
        }

        if (githubContext.repositoryLabel.startsWith("Noch kein")) {
          return "Repo auswählen, dann kann gelesen werden.";
        }

        return "Repo lesen und Vorschläge vorbereiten.";
      case "matrix":
        if (matrixContext.connectionLabel !== "Verbunden") {
          return matrixContext.connectionLabel === "Nicht verbunden"
            ? "Matrix-Identität oder Verbindung ist nicht verfügbar."
            : "Matrix-Verbindung wird geprüft.";
        }

        if (matrixContext.scopeLabel.startsWith("Noch kein")) {
          return "Wähle einen Bereich, um das Topic-Update zu starten.";
        }

        if (matrixContext.approvalLabel !== "Nicht erforderlich") {
          return "Topic-Update wartet auf deine Freigabe.";
        }

        if (matrixContext.summaryLabel.startsWith("Noch keine")) {
          return "Zusammenfassung wird gerade geladen.";
        }

        return "Backend-owned Topic-Update bereit.";
      case "review":
        if (reviewItems.length === 0) {
          return "Noch keine offenen Prüfungen.";
        }

        if (reviewItems.some((item) => item.status === "stale")) {
          return "Eine Prüfung ist veraltet.";
        }

        if (reviewItems.some((item) => item.status === "pending_review")) {
          return "Prüfungen warten auf Freigabe.";
        }

        return "Prüfungen sind bereit.";
      case "settings":
        if (backendHealthy === false) {
          return "Backendtruth ist nicht verfügbar; Settings bleiben fail-closed.";
        }

        if (githubAuthState.error) {
          return "GitHub-Sessionprüfung ist fehlgeschlagen.";
        }

        if (githubAuthState.status === "loading") {
          return "GitHub-Sitzung wird geprüft.";
        }

        if (!githubUnlocked) {
          return "GitHub-Ausführung bleibt gesperrt, bis die Sitzung authentifiziert ist.";
        }

        if (matrixContext.connectionLabel === "Nicht verbunden") {
          return "Matrix-Identität ist noch nicht aufgelöst.";
        }

        if (!activeModelAlias) {
          return "Der Backend-Modellalias ist noch nicht gewählt.";
        }

        return "Identitäts-, Verbindungs- und Modelltruth sind sichtbar.";
      default:
        if (chatPendingProposal?.status === "pending") {
          return "Chat-Vorschlag wartet auf Freigabe.";
        }

        if (chatPendingProposal?.status === "executing") {
          return "Freigegebene Chat-Ausführung läuft.";
        }

        if (chatLatestReceipt?.outcome === "failed" || chatLatestReceipt?.outcome === "unverifiable") {
          return "Letzte Chat-Ausführung war nicht erfolgreich.";
        }

        return backendHealthy === false ? "Backend nicht verfügbar." : backendHealthy === true ? "Chat bereit." : "Backend wird geprüft.";
    }
  }, [
    backendHealthy,
    chatLatestReceipt?.outcome,
    chatPendingProposal?.status,
    githubAuthState.error,
    githubAuthState.status,
    githubContext.approvalLabel,
    githubContext.connectionLabel,
    githubContext.repositoryLabel,
    githubUnlocked,
    activeModelAlias,
    matrixContext.connectionLabel,
    matrixContext.approvalLabel,
    matrixContext.scopeLabel,
    matrixContext.summaryLabel,
    mode,
    reviewItems,
  ]);

  const currentHelperText = useMemo(() => {
    switch (mode) {
      case "github":
        if (!githubUnlocked) {
          return githubAuthState.error
            ? "Die Sessionprüfung konnte nicht abgeschlossen werden. Prüfe den Login oder lade die Seite neu."
            : "Melde dich als Admin an, wenn du GitHub lesen und Vorschläge vorbereiten willst.";
        }

        if (githubContext.approvalLabel !== "Nicht erforderlich") {
          return "Prüfe den Vorschlag und gib ihn erst frei, wenn du die Änderungen verstanden hast.";
        }

        if (githubContext.repositoryLabel.startsWith("Noch kein")) {
          return "Wähle zuerst ein erlaubtes Repo und starte danach die Analyse.";
        }

        return "Die Analyse bleibt lesend, bis du einen Vorschlag freigibst.";
      case "matrix":
        if (matrixContext.scopeLabel.startsWith("Noch kein")) {
          return "Wähle zuerst einen Bereich, dann kann das Backend die aktuelle Zusammenfassung laden.";
        }

        if (matrixContext.approvalLabel !== "Nicht erforderlich") {
          return "Prüfe den Topic-Vorschlag und gib ihn erst frei, wenn du bereit bist.";
        }

        if (matrixContext.summaryLabel.startsWith("Noch keine")) {
          return "Die Zusammenfassung wird noch aus dem gewählten Scope geladen.";
        }

        return "Arbeite den Topic-Update-Fluss weiter über Analyse, Review, Execute und Verify.";
      case "review":
        if (reviewItems.length === 0) {
          return "Öffne GitHub oder Matrix, um prüfbare Änderungen zu erzeugen.";
        }

        if (reviewItems.some((item) => item.status === "stale")) {
          return "Bring die veraltete Prüfung wieder in Sync, bevor du weiterarbeitest.";
        }

        if (reviewItems.some((item) => item.status === "pending_review")) {
          return "Prüfe den Vorschlag und entscheide dann über die Freigabe.";
        }

        return "Arbeite die offenen Punkte der Reihe nach ab.";
      case "settings":
        if (backendHealthy === false) {
          return "Backendtruth ist nicht verfügbar; Settings bleiben fail-closed.";
        }

        if (githubAuthState.error) {
          return "GitHub-Sessionprüfung ist fehlgeschlagen.";
        }

        if (!githubUnlocked) {
          return "GitHub-Sitzung ist noch nicht authentifiziert.";
        }

        if (matrixContext.connectionLabel === "Nicht verbunden") {
          return "Matrix-Identität und Verbindung sind noch nicht aufgelöst.";
        }

        return expertMode
          ? "Technische Details zeigen reale Verbindungs- und Modelltruth."
          : "Expert zeigt technische Details nur auf explizite Anfrage.";
      default:
        if (chatPendingProposal?.status === "pending") {
          return "Freigabe oder Verwerfen entscheiden, bevor neue Chat-Eingaben vorbereitet werden.";
        }

        if (chatPendingProposal?.status === "executing") {
          return "Ausführung läuft. Composer bleibt bis zum terminalen Ergebnis gesperrt.";
        }

        if (chatLatestReceipt?.outcome === "failed" || chatLatestReceipt?.outcome === "unverifiable") {
          return "Prüfe den Receipt und starte erst danach einen neuen Vorschlag.";
        }

        return backendHealthy === false
          ? "Prüfe die Backend-Verbindung, bevor du den Chat weiter nutzt."
          : "Stell deine nächste Frage direkt im Chat.";
    }
  }, [
    backendHealthy,
    chatLatestReceipt?.outcome,
    chatPendingProposal?.status,
    expertMode,
    githubAuthState.error,
    githubContext.approvalLabel,
    githubContext.repositoryLabel,
    githubUnlocked,
    matrixContext.connectionLabel,
    matrixContext.approvalLabel,
    matrixContext.scopeLabel,
    matrixContext.summaryLabel,
    mode,
    reviewItems,
  ]);

  const currentExpertRows = useMemo(() => {
    switch (mode) {
      case "github":
        if (!githubUnlocked) {
          return [
            { label: "Anmeldung", value: githubAuthState.error ? "Fehler prüfen" : "Erforderlich" },
            { label: "Sessionstatus", value: githubAuthState.status === "loading" ? "Wird geprüft" : "Nicht angemeldet" }
          ];
        }

        return [
          { label: "Verbindung", value: githubContext.expertDetails.apiStatus },
          { label: "Auswahl", value: githubContext.expertDetails.selectedRepoSlug ?? "n/a" },
          { label: "Freigabe", value: githubContext.approvalLabel },
          { label: "Ereignisse", value: githubContext.expertDetails.sseEvents.length > 0 ? `${githubContext.expertDetails.sseEvents.length} Ereignis(se)` : "n/a" },
        ];
      case "matrix":
        return [
          { label: "Scope", value: matrixContext.scopeLabel },
          { label: "Zusammenfassung", value: matrixContext.summaryLabel },
          { label: "Freigabe", value: matrixContext.approvalLabel },
          { label: "Composer", value: matrixContext.expertDetails.composerTargetLabel },
        ];
      case "review":
        return [
          { label: "Offen", value: String(reviewItems.length) },
          {
            label: "Einordnung",
            value: reviewItems.length === 0
              ? "Keine offenen Prüfungen"
              : reviewItems.some((item) => item.status === "stale")
                ? "Veraltet"
                : reviewItems.some((item) => item.status === "pending_review")
                  ? "Freigabe nötig"
                  : "Bereit",
          },
        ];
      case "settings":
        return [
          { label: "Backend", value: settingsTruthSnapshot.backend.label },
          { label: "GitHub Session", value: settingsTruthSnapshot.github.sessionLabel },
          { label: "Matrix Identität", value: settingsTruthSnapshot.matrix.identityLabel },
          { label: "Modell", value: settingsTruthSnapshot.models.activeAlias },
        ];
      default:
        return [
          { label: "Proposal", value: chatPendingProposal?.status ?? "none" },
          { label: "Receipts", value: String(chatSession?.metadata.chatState.receipts.length ?? 0) },
          { label: "Route", value: chatSession?.metadata.chatState.activeRoute?.selectedAlias ?? "n/a" }
        ];
    }
  }, [
    chatPendingProposal?.status,
    chatSession?.metadata.chatState.activeRoute?.selectedAlias,
    chatSession?.metadata.chatState.receipts.length,
    expertMode,
    githubAuthState.error,
    githubAuthState.status,
    githubContext.approvalLabel,
    githubContext.expertDetails,
    githubUnlocked,
    matrixContext.approvalLabel,
    matrixContext.connectionLabel,
    matrixContext.expertDetails,
    matrixContext.scopeLabel,
    matrixContext.summaryLabel,
    mode,
    reviewItems,
    settingsTruthSnapshot.backend.label,
    settingsTruthSnapshot.github.sessionLabel,
    settingsTruthSnapshot.matrix.identityLabel,
    settingsTruthSnapshot.models.activeAlias,
  ]);

  const currentExpertChildren = useMemo(() => {
    if (mode === "github") {
      return (
        <div className="expert-detail-sections">
          <section className="expert-detail-section">
            <p className="info-label">Verbindung</p>
            <div className="expert-detail-section-grid">
              <div>
                <span>API-Status</span>
                <strong>{githubContext.expertDetails.apiStatus}</strong>
              </div>
              <div>
                <span>Auswahl</span>
                <strong>{githubContext.expertDetails.selectedRepoSlug ?? "n/a"}</strong>
              </div>
            </div>
          </section>

          <section className="expert-detail-section">
            <p className="info-label">Freigabe</p>
            <div className="expert-detail-section-grid">
              <div>
                <span>Anfrage-ID</span>
                <strong>{githubContext.expertDetails.requestId ?? "n/a"}</strong>
              </div>
              <div>
                <span>Plan-ID</span>
                <strong>{githubContext.expertDetails.planId ?? "n/a"}</strong>
              </div>
              <div>
                <span>Branch</span>
                <strong>{githubContext.expertDetails.branchName ?? "n/a"}</strong>
              </div>
            </div>
          </section>

          <section className="expert-detail-section">
            <p className="info-label">Laufzeit</p>
            <div className="expert-detail-section-grid">
              <div>
                <span>Ereignisse</span>
                <strong>{githubContext.expertDetails.sseEvents.length > 0 ? githubContext.expertDetails.sseEvents.join(" · ") : "n/a"}</strong>
              </div>
            </div>
          </section>

          <section className="expert-detail-section">
            <p className="info-label">Diff</p>
            {githubContext.expertDetails.rawDiffPreview ? (
              <pre className="github-diff-preview">{githubContext.expertDetails.rawDiffPreview}</pre>
            ) : (
              <p className="muted-copy">Diff erscheint erst, wenn ein Vorschlag vorbereitet wurde.</p>
            )}
          </section>
        </div>
      );
    }

    if (mode === "matrix") {
      return (
        <div className="expert-detail-sections">
          <section className="expert-detail-section">
            <p className="info-label">Scope</p>
            <div className="expert-detail-section-grid">
              <div>
                <span>Bereich</span>
                <strong>{matrixContext.scopeLabel}</strong>
              </div>
              <div>
                <span>Zusammenfassung</span>
                <strong>{matrixContext.summaryLabel}</strong>
              </div>
              <div>
                <span>Freigabe</span>
                <strong>{matrixContext.approvalLabel}</strong>
              </div>
            </div>
          </section>

          <section className="expert-detail-section">
            <p className="info-label">Topic Update</p>
            <div className="expert-detail-section-grid">
              <div>
                <span>Plan-ID</span>
                <strong>{matrixContext.expertDetails.planId ?? "n/a"}</strong>
              </div>
              <div>
                <span>Composer</span>
                <strong>{matrixContext.expertDetails.composerTargetLabel}</strong>
              </div>
              <div>
                <span>Composer mode</span>
                <strong>{matrixContext.expertDetails.composerMode}</strong>
              </div>
              <div>
                <span>Composer room</span>
                <strong>{matrixContext.expertDetails.composerRoomId ?? "n/a"}</strong>
              </div>
              <div>
                <span>Composer thread</span>
                <strong>{matrixContext.expertDetails.composerThreadRootId ?? "n/a"}</strong>
              </div>
            </div>
          </section>

          <section className="expert-detail-section">
            <p className="info-label">Laufzeit</p>
            <div className="expert-detail-section-grid">
              <div>
                <span>Backend route</span>
                <strong>{matrixContext.expertDetails.backendRouteStatus}</strong>
              </div>
              <div>
                <span>HTTP</span>
                <strong>{matrixContext.expertDetails.httpStatus ?? "n/a"}</strong>
              </div>
              <div>
                <span>Latenz</span>
                <strong>{matrixContext.expertDetails.latency ?? "n/a"}</strong>
              </div>
              <div>
                <span>SSE lifecycle</span>
                <strong>{matrixContext.expertDetails.sseLifecycle}</strong>
              </div>
            </div>
            <div className="expert-detail-section-grid">
              <div>
                <span>Runtime trail</span>
                <strong>{matrixContext.expertDetails.runtimeEventTrail.join(" · ") || "n/a"}</strong>
              </div>
            </div>
          </section>

          <section className="expert-detail-section">
            <p className="info-label">Payload</p>
            {matrixContext.expertDetails.rawPayload ? (
              <pre className="github-diff-preview">{matrixContext.expertDetails.rawPayload}</pre>
            ) : (
              <p className="muted-copy">Payload erscheint erst, wenn ein Topic-Update vorbereitet wurde.</p>
            )}
          </section>
        </div>
      );
    }

    return null;
  }, [
    githubContext.expertDetails,
    matrixContext.expertDetails,
    matrixContext.approvalLabel,
    matrixContext.scopeLabel,
    matrixContext.summaryLabel,
    settingsTruthSnapshot.backend.label,
    settingsTruthSnapshot.github.sessionLabel,
    settingsTruthSnapshot.matrix.identityLabel,
    settingsTruthSnapshot.models.activeAlias,
    mode,
  ]);

  const workspaceSurface = mode === "chat" ? (
    <ChatWorkspace
      key={chatSession?.id ?? "chat-session"}
      session={chatSession}
      backendHealthy={backendHealthy}
      activeModelAlias={activeModelAlias}
      availableModels={availableModels}
      modelRegistry={modelRegistry}
      onActiveModelAliasChange={setActiveModelAlias}
      onTelemetry={recordTelemetry}
      onSessionChange={handleChatSessionChange}
    />
  ) : mode === "github" && githubUnlocked ? (
    <GitHubWorkspace
      key={githubSession?.id ?? "github-session"}
      session={githubSession}
      backendHealthy={backendHealthy}
      expertMode={expertMode}
      onTelemetry={recordTelemetry}
      onContextChange={setGitHubContext}
      onReviewItemsChange={updateGitHubReviewItems}
      onSessionChange={handleGitHubSessionChange}
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
      key={matrixSession?.id ?? "matrix-session"}
      session={matrixSession}
      restoredSession={restoredSession}
      expertMode={expertMode}
      onTelemetry={recordTelemetry}
      onContextChange={setMatrixContext}
      onReviewItemsChange={updateMatrixReviewItems}
      onSessionChange={handleMatrixSessionChange}
    />
  ) : mode === "review" ? (
    <ReviewWorkspace items={reviewItems} expertMode={expertMode} />
  ) : (
    <SettingsWorkspace
      expertMode={expertMode}
      onExpertModeChange={setExpertMode}
      diagnostics={telemetry as DiagnosticEntry[]}
      onClearDiagnostics={() => setTelemetry([])}
      truthSnapshot={settingsTruthSnapshot}
    />
  );
  const statusToneForBadge = currentStatusTone === "error" ? "error" : currentStatusTone === "ready" ? "ready" : "partial";
  const accountTone = githubUnlocked ? "ready" : githubAuthState.error ? "error" : "partial";

  return (
    <main className="app-shell app-shell-console" data-testid="app-shell">
      <header className="global-header global-header-shell">
        <div className="brand-block">
          <p className="app-kicker">MODELGATE</p>
          <h1>ModelGate Console</h1>
          <p className="app-deck">
            Governance-first operator shell. Runtime truth stays backend-owned.
          </p>
        </div>

        <div className="header-actions">
          <StatusBadge tone={healthState.tone}>Backend {healthState.label}</StatusBadge>
        </div>
      </header>

      <section className="console-layout">
        <aside className="workspace-sidebar shell-left-rail">
          <ShellCard variant="rail" className="shell-left-brand">
            <p className="app-kicker">WORKSPACE CONSOLE</p>
            <strong>Arbeitsbereich wählen</strong>
            <MutedSystemCopy>Navigation, Sessionkontext und Disclosure bleiben links persistent.</MutedSystemCopy>
          </ShellCard>

          <ShellCard variant="rail" className="shell-nav-card">
            <SectionLabel>Workspaces</SectionLabel>
            <nav className="sidebar-nav" aria-label="Primary workspace navigation">
              {WORKSPACE_MODES.map((workspaceMode) => (
                <button
                  key={workspaceMode}
                  type="button"
                  className={mode === workspaceMode ? "workspace-tab workspace-tab-active workspace-tab-vertical workspace-tab-shell-active" : "workspace-tab workspace-tab-vertical"}
                  onClick={() => handleWorkspaceTabSelect(workspaceMode)}
                  aria-current={mode === workspaceMode ? "page" : undefined}
                  data-testid={`tab-${workspaceMode}`}
                >
                  <WorkspaceIcon mode={workspaceMode} />
                  <span>
                    <strong>{tabLabel(workspaceMode)}</strong>
                    <small>{tabDescription(workspaceMode)}</small>
                  </span>
                </button>
              ))}
            </nav>
          </ShellCard>

          <ShellCard variant="muted" className="shell-session-identity-card">
            <SectionLabel>Session</SectionLabel>
            <strong>{activeSession?.title ?? "Keine Session aktiv"}</strong>
            <MutedSystemCopy>{workspaceName}</MutedSystemCopy>
            <div className="shell-session-meta">
              <StatusBadge tone={statusToneForBadge}>{sessionStatusCopy(activeSession?.status ?? "draft")}</StatusBadge>
              {activeSession?.archived ? <StatusBadge tone="muted">Archiviert</StatusBadge> : null}
            </div>
            {expertMode && activeSession?.id ? (
              <MutedSystemCopy className="shell-session-id">ID: {activeSession.id}</MutedSystemCopy>
            ) : null}

            <div className="shell-disclosure-control">
              <SectionLabel>Disclosure</SectionLabel>
              <BeginnerExpertToggle expertMode={expertMode} setExpertMode={setExpertMode} />
            </div>

            <div className="shell-account-block">
              <SectionLabel>Account</SectionLabel>
              <div className="shell-account-row">
                <StatusBadge tone={accountTone}>
                  {githubUnlocked ? "GitHub Admin" : githubAuthState.status === "loading" ? "Session prüfen" : "Kein Admin-Login"}
                </StatusBadge>
                {githubUnlocked ? (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      void handleGitHubLogout();
                    }}
                    disabled={githubAuthState.busy}
                  >
                    {githubAuthState.busy ? "Abmelden…" : "Logout"}
                  </button>
                ) : null}
              </div>
              {githubAuthState.error ? <MutedSystemCopy>{githubAuthState.error}</MutedSystemCopy> : null}
            </div>
          </ShellCard>

          <SessionList
            workspace={sessionWorkspace}
            sessions={sessionWorkspaceSessions}
            activeSessionId={sessionWorkspaceActiveId}
            onCreate={() => handleWorkspaceSessionCreate(sessionWorkspace)}
            onSelect={(sessionId) => handleWorkspaceSessionSelect(sessionWorkspace, sessionId)}
            onArchive={(sessionId) => handleWorkspaceSessionArchive(sessionWorkspace, sessionId)}
            onDelete={(sessionId) => handleWorkspaceSessionDelete(sessionWorkspace, sessionId)}
            headerNote="Wiederaufnehmbare Sessions pro Workspace"
          />
        </aside>

        <section className="console-main shell-center-main">
          <ShellCard variant="base" className="workspace-frame-card">
            <header className="workspace-frame-header">
              <div>
                <SectionLabel>{workspaceName}</SectionLabel>
                <h2>{activeSession?.title ?? "Aktive Session"}</h2>
              </div>
              <StatusBadge tone={statusToneForBadge}>{currentStatusBadge}</StatusBadge>
            </header>
            <MutedSystemCopy className="workspace-frame-note">{currentStatusHeadline}</MutedSystemCopy>
            <div className="workspace-frame-body">{workspaceSurface}</div>
          </ShellCard>
        </section>

        <aside className="workspace-context truth-rail">
          <TruthRailSection
            title="Health"
            testId="truth-rail-health"
            badge={<StatusBadge tone={healthState.tone}>{healthState.label}</StatusBadge>}
          >
            <MutedSystemCopy>{healthState.detail}</MutedSystemCopy>
            {expertMode ? (
              <div className="truth-rail-pairs">
                <div>
                  <span>Mode</span>
                  <strong>{workspaceName}</strong>
                </div>
                <div>
                  <span>Public alias</span>
                  <strong>{activeModelAlias ?? "n/a"}</strong>
                </div>
              </div>
            ) : null}
          </TruthRailSection>

          <TruthRailSection
            title="Session"
            testId="truth-rail-session"
            badge={<StatusBadge tone={statusToneForBadge}>{sessionStatusCopy(activeSession?.status ?? "draft")}</StatusBadge>}
          >
            <p className="truth-rail-keyline">{activeSession?.title ?? "Keine aktive Session"}</p>
            <MutedSystemCopy>
              Workspace: {workspaceName}
              {activeSession?.updatedAt ? ` · aktualisiert ${new Date(activeSession.updatedAt).toLocaleString()}` : ""}
            </MutedSystemCopy>
            {expertMode && activeSession?.id ? <MutedSystemCopy>ID: {activeSession.id}</MutedSystemCopy> : null}
          </TruthRailSection>

          {approvalSummary.hasApprovals ? (
            <TruthRailSection
              title="Pending approvals"
              testId="truth-rail-approvals"
              badge={<StatusBadge tone={approvalSummary.stale > 0 ? "error" : "partial"}>{approvalSummary.pending}</StatusBadge>}
            >
              <p className="truth-rail-keyline">
                {approvalSummary.pending} zur Freigabe, {approvalSummary.stale} veraltet
              </p>
              <MutedSystemCopy>
                {approvalSummary.chatPending > 0
                  ? "Mindestens ein Chat-Vorschlag wartet auf Freigabe. Weitere Details im aktiven Workspace."
                  : "Freigaben bleiben getrennt von Ausführung. Prüfe Details im Review-Workspace."}
              </MutedSystemCopy>
            </TruthRailSection>
          ) : null}

          <TruthRailSection
            title={workspaceContextTitle}
            testId="truth-rail-workspace-context"
            badge={<StatusBadge tone={statusToneForBadge}>{currentStatusBadge}</StatusBadge>}
          >
            <div className="truth-rail-pairs">
              {currentRows.map((row) => (
                <div key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
              ))}
            </div>
            <MutedSystemCopy>{currentHelperText}</MutedSystemCopy>
          </TruthRailSection>

          <TruthRailSection title="Diagnostics" testId="truth-rail-diagnostics">
            <MutedSystemCopy>
              {diagnosticsAccessible
                ? "Diagnostik ist verfügbar. Nutzung bleibt read-only und kontextbezogen."
                : "Beginner blendet Diagnostik standardmäßig aus. Bei Störung wird sie sichtbar."}
            </MutedSystemCopy>
            {!diagnosticsAccessible ? (
              <button type="button" className="secondary-button" onClick={() => setExpertMode(true)}>
                Expert Mode aktivieren
              </button>
            ) : (
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDiagnosticsOpen((current) => !current)}
              >
                {diagnosticsOpen ? "Diagnostics schließen" : "Diagnostics öffnen"}
              </button>
            )}

            <DiagnosticsDrawer
              expertMode={diagnosticsAccessible}
              title={diagnosticsTitle}
              rows={currentExpertRows}
              className="shell-diagnostics-drawer"
              open={diagnosticsOpen}
              onToggle={setDiagnosticsOpen}
            >
              {currentExpertChildren}
            </DiagnosticsDrawer>
          </TruthRailSection>
        </aside>
      </section>
    </main>
  );
}
