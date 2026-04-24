import React, { useCallback, useEffect, useMemo, useReducer, useState } from "react";
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
  getShellHealthCopy,
  getSessionStatusLabel,
  useLocalization,
} from "./lib/localization.js";
import {
  fetchDiagnostics,
  fetchAuthSession,
  fetchHealth,
  fetchJournalRecent,
  fetchModels,
  loginAdmin,
  logoutAdmin,
  type DiagnosticsResponse,
  type JournalEntry
} from "./lib/api.js";
import {
  createInitialGitHubAuthState,
  describeGitHubAuthError,
  githubAuthReducer,
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
  const { copy: ui } = useLocalization();

  return (
    <div className="mode-toggle" role="group" aria-label={`${ui.settings.beginner} / ${ui.settings.expert}`}>
      <button
        type="button"
        className={expertMode ? "mode-toggle-button" : "mode-toggle-button mode-toggle-button-active"}
        onClick={() => setExpertMode(false)}
        aria-pressed={!expertMode}
      >
        {ui.settings.beginner}
      </button>
      <button
        type="button"
        className={expertMode ? "mode-toggle-button mode-toggle-button-active" : "mode-toggle-button"}
        onClick={() => setExpertMode(true)}
        aria-pressed={expertMode}
      >
        {ui.settings.expert}
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

export default function App() {
  const persisted = readPersistedShellState();
  const { locale, setLocale, copy: ui } = useLocalization();
  const appText = useMemo(
    () => locale === "de"
      ? {
          telemetryHealthLoaded: "Backend-Health geladen",
          telemetryHealthLoadedDetail: (service: string, modeLabel: string, allowedModelCount: number) =>
            `${service} meldet ${modeLabel} mit ${allowedModelCount} öffentlichen Modellen.`,
          telemetryHealthFailed: "Backend-Health fehlgeschlagen",
          telemetryHealthFailedDetail: "Kein Zugriff auf /health",
          telemetryModelAliasLoaded: "Öffentlicher Modellalias geladen",
          telemetryModelAliasLoadedDetail: (alias: string) =>
            `Alias ${alias} ausgewählt; Provider-Ziele bleiben backend-seitig.`,
          telemetryModelListFailed: "Modellliste fehlgeschlagen",
          telemetryModelListFailedDetail: "Kein Zugriff auf /models",
          telemetryDiagnosticsFailed: "Diagnostik nicht verfügbar",
          telemetryDiagnosticsFailedDetail: "Kein Zugriff auf /diagnostics",
          chatGovernancePendingApproval: "Freigabe ausstehend",
          chatGovernanceExecutionRunning: "Ausführung läuft",
          chatGovernanceLastExecutionConfirmed: "Letzte Ausführung bestätigt",
          chatGovernanceProposalRejected: "Vorschlag verworfen",
          chatGovernanceLastExecutionFailed: "Letzte Ausführung fehlgeschlagen",
          chatGovernanceNoOpenProposal: "Kein offener Vorschlag",
          sessionHeaderNote: "Wiederaufnehmbare Sessions pro Arbeitsbereich",
        }
      : {
          telemetryHealthLoaded: "Backend health loaded",
          telemetryHealthLoadedDetail: (service: string, modeLabel: string, allowedModelCount: number) =>
            `${service} reports ${modeLabel} mode with ${allowedModelCount} public model(s).`,
          telemetryHealthFailed: "Backend health failed",
          telemetryHealthFailedDetail: "Unable to reach /health",
          telemetryModelAliasLoaded: "Public model alias loaded",
          telemetryModelAliasLoadedDetail: (alias: string) =>
            `Selected alias ${alias}; provider targets remain backend-owned.`,
          telemetryModelListFailed: "Model list failed",
          telemetryModelListFailedDetail: "Unable to reach /models",
          telemetryDiagnosticsFailed: "Diagnostics unavailable",
          telemetryDiagnosticsFailedDetail: "Unable to reach /diagnostics",
          chatGovernancePendingApproval: "Approval pending",
          chatGovernanceExecutionRunning: "Execution running",
          chatGovernanceLastExecutionConfirmed: "Last execution confirmed",
          chatGovernanceProposalRejected: "Proposal rejected",
          chatGovernanceLastExecutionFailed: "Last execution failed",
          chatGovernanceNoOpenProposal: "No open proposal",
          sessionHeaderNote: "Resumable sessions per workspace",
        },
    [locale],
  );
  const createDefaultGitHubContext = useCallback(
    (): GitHubWorkspaceStatus => ({
      repositoryLabel: ui.github.noRepoSelected,
      connectionLabel: ui.shell.healthChecking,
      accessLabel: ui.github.readOnly,
      analysisLabel: ui.github.nextStepAnalysis,
      proposalLabel: ui.github.proposalEmpty,
      approvalLabel: ui.common.none,
      resultLabel: ui.github.verifyResult,
      safetyText: ui.github.actionReadBody,
      expertDetails: {
        requestId: null,
        planId: null,
        branchName: null,
        apiStatus: ui.shell.healthChecking,
        sseEvents: [],
        rawDiffPreview: null,
        selectedRepoSlug: null,
      },
    }),
    [ui],
  );
  const createDefaultMatrixContext = useCallback(
    (): MatrixWorkspaceStatus => ({
      identityLabel: ui.shell.healthChecking,
      connectionLabel: ui.shell.healthChecking,
      homeserverLabel: ui.common.na,
      scopeLabel: ui.matrix.scopeUnresolved,
      summaryLabel: ui.matrix.scopeSummaryUnavailable,
      approvalLabel: ui.common.none,
      safetyText: ui.matrix.scopeNotice,
      expertDetails: {
        route: "/api/matrix/*",
        requestId: null,
        planId: null,
        roomId: null,
        spaceId: null,
        eventId: null,
        httpStatus: null,
        latency: null,
        backendRouteStatus: ui.shell.healthChecking,
        runtimeEventTrail: [],
        sseLifecycle: ui.common.loading,
        rawPayload: null,
        composerMode: "post",
        composerRoomId: null,
        composerEventId: null,
        composerThreadRootId: null,
        composerTargetLabel: ui.matrix.newPost,
      },
      reviewItems: [],
    }),
    [ui],
  );
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
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<DiagnosticsResponse | null>(null);
  const [runtimeJournalEntries, setRuntimeJournalEntries] = useState<JournalEntry[]>([]);
  const [restoredSession] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem("modelgate.console.workspaces.v1") !== null;
  });
  const [telemetry, setTelemetry] = useState<TelemetryEntry[]>([]);
  const [githubContext, setGitHubContext] = useState<GitHubWorkspaceStatus>(() => createDefaultGitHubContext());
  const [matrixContext, setMatrixContext] = useState<MatrixWorkspaceStatus>(() => createDefaultMatrixContext());
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const githubUnlocked = githubAuthState.status === "authenticated";

  useEffect(() => {
    let cancelled = false;

    async function loadConsoleState() {
      const [healthResult, modelsResult, diagnosticsResult, journalResult] = await Promise.allSettled([
        fetchHealth(),
        fetchModels(),
        fetchDiagnostics(),
        fetchJournalRecent(),
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
            label: appText.telemetryHealthLoaded,
            detail: appText.telemetryHealthLoadedDetail(health.service, health.mode, health.allowedModelCount),
          }),
        );
      } else {
        setBackendHealthy(false);
        setTelemetry((current) =>
          appendTelemetry(current, {
            id: createId(),
            kind: "error",
            label: appText.telemetryHealthFailed,
            detail:
              healthResult.reason instanceof Error
                ? healthResult.reason.message
                : appText.telemetryHealthFailedDetail,
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
            label: appText.telemetryModelAliasLoaded,
            detail: appText.telemetryModelAliasLoadedDetail(modelsResult.value.defaultModel),
          }),
        );
      } else {
        setTelemetry((current) =>
          appendTelemetry(current, {
            id: createId(),
            kind: "error",
            label: appText.telemetryModelListFailed,
            detail:
              modelsResult.reason instanceof Error
                ? modelsResult.reason.message
                : appText.telemetryModelListFailedDetail,
          }),
        );
      }

      if (diagnosticsResult.status === "fulfilled") {
        setRuntimeDiagnostics(diagnosticsResult.value);
      } else {
        setRuntimeDiagnostics(null);
        setTelemetry((current) =>
          appendTelemetry(current, {
            id: createId(),
            kind: "warning",
            label: appText.telemetryDiagnosticsFailed,
            detail:
              diagnosticsResult.reason instanceof Error
                ? diagnosticsResult.reason.message
                : appText.telemetryDiagnosticsFailedDetail,
          }),
        );
      }

      if (journalResult.status === "fulfilled") {
        setRuntimeJournalEntries(journalResult.value.entries);
      } else {
        setRuntimeJournalEntries([]);
      }
    }

    void loadConsoleState();

    return () => {
      cancelled = true;
    };
  }, [appText]);

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
          error: error instanceof Error ? error.message : ui.shell.statusError
        });
      }
    }

    void loadGitHubSession();

    return () => {
      cancelled = true;
    };
  }, [ui.shell.statusError]);

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
      setGitHubContext(createDefaultGitHubContext());
      setReviewItems((current) => current.filter((item) => item.source !== "github"));
    }
  }, [createDefaultGitHubContext, githubUnlocked]);

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
        error: error instanceof Error ? describeGitHubAuthError(error.message) : ui.shell.statusError
      });
      setGitHubPassword("");
    }
  }, [githubAuthState.busy, githubPassword, ui.shell.statusError]);

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
      setGitHubContext(createDefaultGitHubContext());
      removeModeReviewItems("github");
    } catch (error) {
      dispatchGitHubAuth({
        type: "logout_failed",
        error: error instanceof Error ? describeGitHubAuthError(error.message) : ui.shell.statusError
      });
    }
  }, [createDefaultGitHubContext, githubAuthState.busy, removeModeReviewItems, ui.shell.statusError]);

  const chatPendingProposal = chatSession?.metadata.chatState.pendingProposal ?? null;
  const chatLatestReceipt = chatSession?.metadata.chatState.receipts.at(-1) ?? null;
  const chatGovernanceState = chatPendingProposal
    ? chatPendingProposal.status === "pending"
      ? appText.chatGovernancePendingApproval
      : appText.chatGovernanceExecutionRunning
    : chatLatestReceipt
      ? chatLatestReceipt.outcome === "executed"
        ? appText.chatGovernanceLastExecutionConfirmed
        : chatLatestReceipt.outcome === "rejected"
          ? appText.chatGovernanceProposalRejected
          : appText.chatGovernanceLastExecutionFailed
      : appText.chatGovernanceNoOpenProposal;

  const chatRows: StatusPanelRow[] = [
    { label: ui.github.modelLabel, value: activeModelAlias ?? ui.common.none },
    { label: ui.review.rowClassification, value: chatGovernanceState },
    {
      label: ui.shell.healthTitle,
      value:
        backendHealthy === true
          ? ui.shell.healthReady
          : backendHealthy === false
            ? ui.shell.healthUnavailable
            : ui.shell.healthChecking,
    },
  ];

  const githubRows: StatusPanelRow[] = [
    { label: ui.github.connectedRepo, value: githubContext.repositoryLabel },
    { label: ui.settings.githubConnection, value: githubContext.connectionLabel },
    { label: ui.github.readOnly, value: githubUnlocked ? githubContext.accessLabel : ui.auth.statusLocked },
    ...(githubUnlocked && githubContext.approvalLabel !== ui.common.none
      ? [{ label: ui.review.approvalNeeded, value: githubContext.approvalLabel }]
      : []),
  ];

  const matrixRows: StatusPanelRow[] = [
    { label: ui.settings.matrixIdentity, value: matrixContext.identityLabel },
    { label: ui.settings.matrixConnection, value: matrixContext.connectionLabel },
    { label: ui.matrix.scopeSelectedLabel, value: matrixContext.scopeLabel },
    { label: ui.matrix.scopeSummaryTitle, value: matrixContext.summaryLabel },
    ...(matrixContext.approvalLabel !== ui.common.none
      ? [{ label: ui.review.approvalNeeded, value: matrixContext.approvalLabel }]
      : []),
  ];
  const reviewHasStale = reviewItems.some((item) => item.status === "stale");
  const reviewHasPending = reviewItems.some((item) => item.status === "pending_review");
  const reviewHasExecuting = reviewItems.some((item) => item.status === "approved");
  const reviewHasTerminal = reviewItems.some((item) => item.status === "rejected" || item.status === "failed");

  const reviewRows: StatusPanelRow[] = [
    { label: ui.review.openReviews, value: String(reviewItems.length) },
    {
      label: ui.review.rowClassification,
      value:
        reviewItems.length === 0
          ? ui.review.emptyTitle
          : reviewHasStale
            ? ui.review.blocked
            : reviewHasPending
              ? ui.review.approvalNeeded
              : reviewHasExecuting
                ? ui.review.executing
                : reviewHasTerminal
                  ? ui.review.terminalDeviation
                  : ui.review.ready,
    },
  ];

  const settingsTruthSnapshot = {
    backend: {
      label:
        backendHealthy === false
          ? ui.shell.healthUnavailable
          : backendHealthy === true
            ? ui.shell.healthReady
            : ui.shell.healthChecking,
      detail:
        backendHealthy === false
          ? ui.shell.healthUnavailableDetail
          : backendHealthy === true
            ? ui.shell.healthReadyDetail
            : ui.shell.healthCheckingDetail,
    },
    github: {
      sessionLabel:
        githubAuthState.status === "authenticated"
          ? ui.auth.statusAuthenticated
          : githubAuthState.status === "loading"
            ? ui.auth.statusChecking
            : githubAuthState.error
              ? ui.common.error
              : ui.auth.statusLocked,
      connectionLabel: githubContext.connectionLabel,
      repositoryLabel: githubContext.repositoryLabel,
      accessLabel: githubUnlocked ? githubContext.accessLabel : ui.auth.statusLocked,
    },
    matrix: {
      identityLabel: matrixContext.identityLabel,
      connectionLabel: matrixContext.connectionLabel,
      homeserverLabel: matrixContext.homeserverLabel,
      scopeLabel: matrixContext.scopeLabel,
    },
    models: {
      activeAlias: activeModelAlias ?? ui.common.none,
      availableCount: availableModels.length,
      registrySourceLabel: modelRegistry.length > 0 ? "backend-policy" : ui.common.na,
    },
    diagnostics: {
      runtimeMode: runtimeDiagnostics?.runtimeMode ?? ui.settings.unavailable,
      defaultPublicAlias: runtimeDiagnostics?.models.defaultPublicAlias ?? ui.settings.unavailable,
      publicAliases: runtimeDiagnostics?.models.publicAliases.join(", ") || ui.settings.unavailable,
      routingMode: runtimeDiagnostics?.routing.mode ?? ui.settings.unavailable,
      fallbackEnabled: runtimeDiagnostics
        ? (runtimeDiagnostics.routing.allowFallback ? ui.common.active : ui.common.inactive)
        : ui.settings.unavailable,
      failClosed: runtimeDiagnostics
        ? (runtimeDiagnostics.routing.failClosed ? ui.common.active : ui.common.inactive)
        : ui.settings.unavailable,
      rateLimitEnabled: runtimeDiagnostics
        ? (runtimeDiagnostics.rateLimit.enabled ? ui.common.active : ui.common.inactive)
        : ui.settings.unavailable,
      actionStoreMode: runtimeDiagnostics?.actionStore.mode ?? ui.settings.unavailable,
      githubConfigured: runtimeDiagnostics
        ? (runtimeDiagnostics.github.configured ? ui.settings.configured : ui.settings.notConfigured)
        : ui.settings.unavailable,
      matrixConfigured: runtimeDiagnostics
        ? (runtimeDiagnostics.matrix.configured ? ui.settings.configured : ui.settings.notConfigured)
        : ui.settings.unavailable,
      generatedAt: runtimeDiagnostics?.diagnosticsGeneratedAt ?? ui.settings.unavailable,
      uptimeMs: runtimeDiagnostics ? String(runtimeDiagnostics.uptimeMs) : ui.settings.unavailable,
      chatRequests: runtimeDiagnostics ? String(runtimeDiagnostics.counters.chatRequests) : ui.settings.unavailable,
      chatStreamStarted: runtimeDiagnostics ? String(runtimeDiagnostics.counters.chatStreamStarted) : ui.settings.unavailable,
      chatStreamCompleted: runtimeDiagnostics ? String(runtimeDiagnostics.counters.chatStreamCompleted) : ui.settings.unavailable,
      chatStreamError: runtimeDiagnostics ? String(runtimeDiagnostics.counters.chatStreamError) : ui.settings.unavailable,
      chatStreamAborted: runtimeDiagnostics ? String(runtimeDiagnostics.counters.chatStreamAborted) : ui.settings.unavailable,
      upstreamError: runtimeDiagnostics ? String(runtimeDiagnostics.counters.upstreamError) : ui.settings.unavailable,
      rateLimitBlocked: runtimeDiagnostics
        ? `chat:${runtimeDiagnostics.rateLimit.blockedByScope.chat}, auth:${runtimeDiagnostics.rateLimit.blockedByScope.auth_login}, gh-propose:${runtimeDiagnostics.rateLimit.blockedByScope.github_propose}, gh-exec:${runtimeDiagnostics.rateLimit.blockedByScope.github_execute}, matrix-exec:${runtimeDiagnostics.rateLimit.blockedByScope.matrix_execute}`
        : ui.settings.unavailable,
    },
    journal: {
      status: runtimeDiagnostics?.journal.enabled ? ui.settings.configured : ui.settings.journalUnavailable,
      mode: runtimeDiagnostics?.journal.mode ?? ui.settings.unavailable,
      retention: runtimeDiagnostics
        ? `${runtimeDiagnostics.journal.recentCount}/${runtimeDiagnostics.journal.maxEntries}`
        : ui.settings.unavailable,
      recentCount: runtimeDiagnostics ? String(runtimeDiagnostics.journal.recentCount) : ui.settings.unavailable,
      entries: runtimeJournalEntries.slice(0, 12)
    }
  };

  const settingsRows: StatusPanelRow[] = [
    { label: ui.settings.backend, value: settingsTruthSnapshot.backend.label },
    { label: ui.shell.workspaceTabs.github.label, value: `${settingsTruthSnapshot.github.sessionLabel} · ${settingsTruthSnapshot.github.accessLabel}` },
    { label: ui.shell.workspaceTabs.matrix.label, value: `${settingsTruthSnapshot.matrix.identityLabel} · ${settingsTruthSnapshot.matrix.connectionLabel}` },
    { label: ui.settings.modelCardTitle, value: settingsTruthSnapshot.models.activeAlias },
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
          return githubAuthState.error ? ui.shell.statusPartial : ui.auth.statusLocked;
        }

        if (githubContext.connectionLabel !== ui.shell.statusReady) {
          return githubContext.connectionLabel;
        }

        if (githubContext.approvalLabel !== ui.common.none && githubContext.approvalLabel !== ui.github.nextStepReadOnly) {
          return ui.review.approvalNeeded;
        }

        if (githubContext.repositoryLabel === ui.github.noRepoSelected) {
          return ui.github.repoSelectLabel;
        }

        return githubContext.connectionLabel;
      case "matrix":
        if (matrixContext.connectionLabel !== ui.shell.statusReady) {
          return matrixContext.connectionLabel;
        }

        if (matrixContext.approvalLabel !== ui.common.none && matrixContext.approvalLabel !== ui.shell.statusReady) {
          return ui.review.approvalNeeded;
        }

        if (matrixContext.scopeLabel === ui.matrix.scopeUnresolved) {
          return ui.matrix.scopeSelected;
        }

        if (matrixContext.summaryLabel === ui.matrix.scopeSummaryUnavailable) {
          return ui.matrix.scopeSummaryReady;
        }

        return ui.shell.statusReady;
      case "review":
        if (reviewItems.length === 0) {
          return ui.shell.statusPartial;
        }

        if (reviewHasStale) {
          return ui.shell.statusError;
        }

        if (reviewHasPending) {
          return ui.review.approvalNeeded;
        }

        if (reviewHasExecuting) {
          return ui.review.executing;
        }

    if (reviewHasTerminal) {
          return ui.review.terminalDeviation;
        }

        return ui.shell.statusReady;
      case "settings":
        if (backendHealthy === false) {
          return ui.shell.statusError;
        }

        if (githubAuthState.error) {
          return ui.shell.statusError;
        }

        if (githubAuthState.status === "loading") {
          return ui.shell.statusPartial;
        }

        if (!githubUnlocked) {
          return ui.auth.statusLocked;
        }

        if (matrixContext.connectionLabel === ui.shell.statusError) {
          return ui.shell.statusError;
        }

        if (!activeModelAlias) {
          return ui.shell.statusPartial;
        }

        return ui.shell.statusReady;
      default:
        if (chatPendingProposal?.status === "pending") {
          return ui.review.approvalNeeded;
        }

        if (chatPendingProposal?.status === "executing") {
          return ui.chat.executingTitle;
        }

        if (chatLatestReceipt?.outcome === "failed" || chatLatestReceipt?.outcome === "unverifiable") {
          return ui.shell.statusError;
        }

        return backendHealthy === false ? ui.shell.healthUnavailable : backendHealthy === true ? ui.shell.healthReady : ui.shell.healthChecking;
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

  const healthState = useMemo(() => getShellHealthCopy(locale, backendHealthy), [backendHealthy, locale]);
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
  const workspaceName = ui.shell.workspaceTabs[mode].label;
  const nextStepTitle = ui.review.nextStepLabel;
  const diagnosticsTitle = `${ui.shell.workspaceTabs[mode].label} ${ui.shell.diagnosticsLabel}`;
  const showBeginnerDiagnostics = !expertMode && healthState.tone === "error";
  const diagnosticsAccessible = expertMode || showBeginnerDiagnostics;

  const currentStatusTone = useMemo(() => {
    switch (mode) {
      case "github":
        if (!githubUnlocked) {
          return githubAuthState.error ? "error" : "partial";
        }

        if (githubContext.connectionLabel !== ui.shell.statusReady) {
          return githubContext.connectionLabel === ui.shell.statusError ? "error" : "partial";
        }

        return githubContext.approvalLabel !== ui.common.none || githubContext.repositoryLabel === ui.github.noRepoSelected
          ? "partial"
          : "ready";
      case "matrix":
        if (matrixContext.connectionLabel === ui.shell.statusError) {
          return "error";
        }

        if (matrixContext.connectionLabel !== ui.shell.statusReady) {
          return "partial";
        }

        return matrixContext.approvalLabel !== ui.common.none || matrixContext.scopeLabel === ui.matrix.scopeUnresolved || matrixContext.summaryLabel === ui.matrix.scopeSummaryUnavailable
          ? "partial"
          : "ready";
      case "review":
        if (reviewItems.length === 0) {
          return "partial";
        }

    if (reviewHasStale || reviewHasTerminal) {
          return "error";
        }

        return reviewHasPending || reviewHasExecuting ? "partial" : "ready";
      case "settings":
        if (backendHealthy === false) {
          return "error";
        }

        if (githubAuthState.error) {
          return "error";
        }

        if (githubAuthState.status === "loading" || !githubUnlocked || matrixContext.connectionLabel === ui.shell.healthChecking) {
          return "partial";
        }

        if (matrixContext.connectionLabel === ui.shell.statusError) {
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

  const currentHelperText = useMemo(() => {
    switch (mode) {
      case "github":
        if (!githubUnlocked) {
          return githubAuthState.error
            ? ui.github.workspaceNoticeRepos
            : ui.auth.intro;
        }

        if (githubContext.approvalLabel !== ui.common.none) {
          return ui.github.approveHelper;
        }

        if (githubContext.repositoryLabel === ui.github.noRepoSelected) {
          return ui.github.workspaceNoticeSelection;
        }

        return ui.github.actionReadBody;
      case "matrix":
        if (matrixContext.scopeLabel === ui.matrix.scopeSelected) {
          return ui.matrix.scopeSummaryInfo;
        }

        if (matrixContext.approvalLabel !== ui.common.none) {
          return ui.matrix.topicStatusApproval;
        }

        if (matrixContext.summaryLabel === ui.matrix.scopeSummaryUnavailable) {
          return ui.matrix.scopeSummaryInfo;
        }

        return ui.matrix.scopeNotice;
      case "review":
        if (reviewItems.length === 0) {
          return ui.review.emptyBody;
        }

        if (reviewHasStale) {
          return ui.review.warning;
        }

        if (reviewHasPending) {
          return ui.review.approvalNeeded;
        }

        if (reviewHasExecuting) {
          return ui.review.executing;
        }

    if (reviewHasTerminal) {
          return ui.review.terminalDeviation;
        }

        return ui.review.ready;
      case "settings":
        if (backendHealthy === false) {
          return ui.shell.healthUnavailableDetail;
        }

        if (githubAuthState.error) {
          return ui.github.workspaceNoticeRepos;
        }

        if (!githubUnlocked) {
          return ui.auth.statusLocked;
        }

        if (matrixContext.connectionLabel === ui.shell.statusError) {
          return ui.matrix.topicStatusUnavailable;
        }

        return expertMode
          ? ui.settings.connectionTruthNote
          : ui.shell.diagnosticsHidden;
      default:
        if (chatPendingProposal?.status === "pending") {
          return ui.chat.proposalHelper;
        }

        if (chatPendingProposal?.status === "executing") {
          return ui.chat.composerLocked.execution;
        }

        if (chatLatestReceipt?.outcome === "failed" || chatLatestReceipt?.outcome === "unverifiable") {
          return ui.chat.composerLocked.backend;
        }

        return backendHealthy === false
          ? ui.chat.composerLocked.backend
          : ui.chat.intro;
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
            { label: ui.auth.cardTitle, value: githubAuthState.error ? ui.common.error : ui.auth.statusLocked },
            { label: ui.shell.sessionLabel, value: githubAuthState.status === "loading" ? ui.auth.statusChecking : ui.auth.statusLocked }
          ];
        }

        return [
          { label: ui.settings.githubConnection, value: githubContext.expertDetails.apiStatus },
          { label: ui.github.repoSelectLabel, value: githubContext.expertDetails.selectedRepoSlug ?? ui.common.na },
          { label: ui.review.nextStepLabel, value: githubContext.approvalLabel },
          { label: ui.github.repositoryStatus, value: githubContext.expertDetails.sseEvents.length > 0 ? `${githubContext.expertDetails.sseEvents.length} ${ui.review.openReviews}` : ui.common.na },
        ];
      case "matrix":
        return [
          { label: ui.matrix.scopeTitle, value: matrixContext.scopeLabel },
          { label: ui.matrix.scopeSummaryTitle, value: matrixContext.summaryLabel },
          { label: ui.matrix.topicStatusApproval, value: matrixContext.approvalLabel },
          { label: ui.matrix.composerTitle, value: matrixContext.expertDetails.composerTargetLabel },
        ];
      case "review":
        return [
          { label: ui.review.rowOpen, value: String(reviewItems.length) },
          {
            label: ui.review.rowClassification,
            value: reviewItems.length === 0
              ? ui.review.emptyTitle
              : reviewHasStale
                ? ui.review.blocked
                : reviewHasPending
                  ? ui.review.approvalNeeded
                  : reviewHasExecuting
                    ? ui.review.executing
                    : reviewHasTerminal
                      ? ui.review.terminalDeviation
                      : ui.review.ready,
          },
        ];
      case "settings":
        return [
          { label: ui.settings.backend, value: settingsTruthSnapshot.backend.label },
          { label: ui.settings.githubIdentity, value: settingsTruthSnapshot.github.sessionLabel },
          { label: ui.settings.matrixIdentity, value: settingsTruthSnapshot.matrix.identityLabel },
          { label: ui.settings.modelCardTitle, value: settingsTruthSnapshot.models.activeAlias },
        ];
      default:
        return [
          { label: ui.chat.proposalTitle, value: chatPendingProposal?.status ?? ui.common.none },
          { label: ui.approval.receiptSection, value: String(chatSession?.metadata.chatState.receipts.length ?? 0) },
          { label: ui.chat.routePending, value: chatSession?.metadata.chatState.activeRoute?.selectedAlias ?? ui.common.na }
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
            <p className="info-label">{ui.settings.githubConnection}</p>
            <div className="expert-detail-section-grid">
              <div>
                <span>{ui.settings.backend}</span>
                <strong>{githubContext.expertDetails.apiStatus}</strong>
              </div>
              <div>
                <span>{ui.github.repoSelectLabel}</span>
                <strong>{githubContext.expertDetails.selectedRepoSlug ?? ui.common.na}</strong>
              </div>
            </div>
          </section>

          <section className="expert-detail-section">
            <p className="info-label">{ui.review.nextStepLabel}</p>
            <div className="expert-detail-section-grid">
              <div>
                <span>{ui.shell.sessionIdPrefix}</span>
                <strong>{githubContext.expertDetails.requestId ?? ui.common.na}</strong>
              </div>
              <div>
                <span>{ui.github.reviewTitle}</span>
                <strong>{githubContext.expertDetails.planId ?? ui.common.na}</strong>
              </div>
              <div>
                <span>{ui.github.defaultBranch}</span>
                <strong>{githubContext.expertDetails.branchName ?? ui.common.na}</strong>
              </div>
            </div>
          </section>

          <section className="expert-detail-section">
            <p className="info-label">{ui.shell.healthTitle}</p>
            <div className="expert-detail-section-grid">
              <div>
                <span>{ui.github.repositoryStatus}</span>
                <strong>{githubContext.expertDetails.sseEvents.length > 0 ? githubContext.expertDetails.sseEvents.join(" · ") : ui.common.na}</strong>
              </div>
            </div>
          </section>

          <section className="expert-detail-section">
            <p className="info-label">{ui.github.verifyResult}</p>
            {githubContext.expertDetails.rawDiffPreview ? (
              <pre className="github-diff-preview">{githubContext.expertDetails.rawDiffPreview}</pre>
            ) : (
              <p className="muted-copy">{ui.github.diffAppearsLater}</p>
            )}
          </section>
        </div>
      );
    }

    if (mode === "matrix") {
      return (
        <div className="expert-detail-sections">
          <section className="expert-detail-section">
            <p className="info-label">{ui.matrix.scopeTitle}</p>
            <div className="expert-detail-section-grid">
              <div>
                <span>{ui.matrix.scopeSelectedLabel}</span>
                <strong>{matrixContext.scopeLabel}</strong>
              </div>
              <div>
                <span>{ui.matrix.scopeSummaryTitle}</span>
                <strong>{matrixContext.summaryLabel}</strong>
              </div>
              <div>
                <span>{ui.matrix.topicStatusApproval}</span>
                <strong>{matrixContext.approvalLabel}</strong>
              </div>
            </div>
          </section>

          <section className="expert-detail-section">
            <p className="info-label">{ui.matrix.topicTitle}</p>
            <div className="expert-detail-section-grid">
              <div>
                <span>{ui.github.reviewTitle}</span>
                <strong>{matrixContext.expertDetails.planId ?? ui.common.na}</strong>
              </div>
              <div>
                <span>{ui.matrix.composerTitle}</span>
                <strong>{matrixContext.expertDetails.composerTargetLabel}</strong>
              </div>
              <div>
                <span>{ui.matrix.composerModeLabel}</span>
                <strong>{matrixContext.expertDetails.composerMode}</strong>
              </div>
              <div>
                <span>{ui.matrix.roomId}</span>
                <strong>{matrixContext.expertDetails.composerRoomId ?? ui.common.na}</strong>
              </div>
              <div>
                <span>{ui.matrix.threadRootId}</span>
                <strong>{matrixContext.expertDetails.composerThreadRootId ?? ui.common.na}</strong>
              </div>
            </div>
          </section>

          <section className="expert-detail-section">
            <p className="info-label">{ui.shell.healthTitle}</p>
            <div className="expert-detail-section-grid">
              <div>
                <span>{ui.github.repositoryStatus}</span>
                <strong>{matrixContext.expertDetails.backendRouteStatus}</strong>
              </div>
              <div>
                <span>{ui.shell.healthTitle}</span>
                <strong>{matrixContext.expertDetails.httpStatus ?? ui.common.na}</strong>
              </div>
              <div>
                <span>{ui.shell.healthCheckingDetail}</span>
                <strong>{matrixContext.expertDetails.latency ?? ui.common.na}</strong>
              </div>
              <div>
                <span>{ui.shell.diagnosticsLabel}</span>
                <strong>{matrixContext.expertDetails.sseLifecycle}</strong>
              </div>
            </div>
            <div className="expert-detail-section-grid">
              <div>
                <span>{ui.shell.diagnosticsLabel}</span>
                <strong>{matrixContext.expertDetails.runtimeEventTrail.join(" · ") || ui.common.na}</strong>
              </div>
            </div>
          </section>

          <section className="expert-detail-section">
            <p className="info-label">{ui.shell.diagnosticsLabel}</p>
            {matrixContext.expertDetails.rawPayload ? (
              <pre className="github-diff-preview">{matrixContext.expertDetails.rawPayload}</pre>
            ) : (
              <p className="muted-copy">{ui.matrix.topicStatusOpen}</p>
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
    ui,
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
          <p className="app-kicker">{ui.shell.appKicker}</p>
          <h1>{ui.shell.appTitle}</h1>
          <p className="app-deck">{ui.shell.appDeck}</p>
        </div>

        <div className="header-actions">
          <div className="shell-language-toggle" role="group" aria-label={ui.shell.languageLabel}>
            <button
              type="button"
              className={locale === "en" ? "secondary-button shell-language-button shell-language-button-active" : "secondary-button shell-language-button"}
              onClick={() => setLocale("en")}
              aria-pressed={locale === "en"}
              aria-label={locale === "de" ? "Sprache: Englisch" : "Language: English"}
              data-testid="locale-en"
            >
              {ui.shell.languageOptionEnglish}
            </button>
            <button
              type="button"
              className={locale === "de" ? "secondary-button shell-language-button shell-language-button-active" : "secondary-button shell-language-button"}
              onClick={() => setLocale("de")}
              aria-pressed={locale === "de"}
              aria-label={locale === "de" ? "Sprache: Deutsch" : "Language: German"}
              data-testid="locale-de"
            >
              {ui.shell.languageOptionGerman}
            </button>
          </div>
          <StatusBadge tone={healthState.tone}>{ui.shell.backendPrefix} {healthState.label}</StatusBadge>
        </div>
      </header>

      <section className="console-layout">
        <aside className="workspace-sidebar shell-left-rail">
          <ShellCard variant="rail" className="shell-nav-card">
            <SectionLabel>{ui.shell.workspacesLabel}</SectionLabel>
            <nav className="sidebar-nav" aria-label={ui.shell.workspacesLabel}>
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
                    <strong>{ui.shell.workspaceTabs[workspaceMode].label}</strong>
                    <small>{ui.shell.workspaceTabs[workspaceMode].description}</small>
                  </span>
                </button>
              ))}
            </nav>
          </ShellCard>

          <ShellCard variant="muted" className="shell-session-identity-card">
            <SectionLabel>{ui.shell.sessionLabel}</SectionLabel>
            <strong>{activeSession?.title ?? ui.shell.noActiveSession}</strong>
            <MutedSystemCopy>{workspaceName}</MutedSystemCopy>
            <div className="shell-session-meta">
              <StatusBadge tone={statusToneForBadge}>{getSessionStatusLabel(locale, activeSession?.status ?? "draft")}</StatusBadge>
              {activeSession?.archived ? <StatusBadge tone="muted">{ui.shell.archivedBadge}</StatusBadge> : null}
            </div>
            {expertMode && activeSession?.id ? (
              <MutedSystemCopy className="shell-session-id">{ui.shell.sessionIdPrefix}: {activeSession.id}</MutedSystemCopy>
            ) : null}

            <div className="shell-disclosure-control">
              <SectionLabel>{ui.shell.disclosureLabel}</SectionLabel>
              <BeginnerExpertToggle expertMode={expertMode} setExpertMode={setExpertMode} />
            </div>

            <div className="shell-account-block">
              <SectionLabel>{ui.shell.accountLabel}</SectionLabel>
              <div className="shell-account-row">
                <StatusBadge tone={accountTone}>
                  {githubUnlocked ? ui.shell.accountAuthenticated : githubAuthState.status === "loading" ? ui.shell.accountChecking : ui.shell.accountLocked}
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
                    {githubAuthState.busy ? `${ui.shell.accountLogout}...` : ui.shell.accountLogout}
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
            headerNote={appText.sessionHeaderNote}
          />
        </aside>

        <section className="console-main shell-center-main">
          <ShellCard variant="base" className="workspace-frame-card">
            <header className="workspace-frame-header">
              <SectionLabel>{workspaceName}</SectionLabel>
            </header>
            <div className="workspace-frame-body">{workspaceSurface}</div>
          </ShellCard>
        </section>

        <aside className="workspace-context truth-rail">
          <TruthRailSection
            title={ui.shell.healthTitle}
            testId="truth-rail-health"
            badge={<StatusBadge tone={healthState.tone}>{healthState.label}</StatusBadge>}
          >
            <MutedSystemCopy>{healthState.detail}</MutedSystemCopy>
            {expertMode ? (
              <div className="truth-rail-pairs">
                <div>
                  <span>{ui.shell.modeLabel}</span>
                  <strong>{workspaceName}</strong>
                </div>
                <div>
                  <span>{ui.shell.publicAliasLabel}</span>
                  <strong>{activeModelAlias ?? ui.common.na}</strong>
                </div>
              </div>
            ) : null}
          </TruthRailSection>

          {approvalSummary.hasApprovals ? (
            <TruthRailSection
              title={ui.shell.pendingApprovalsTitle}
              testId="truth-rail-approvals"
              badge={<StatusBadge tone={approvalSummary.stale > 0 ? "error" : "partial"}>{approvalSummary.pending}</StatusBadge>}
            >
              <p className="truth-rail-keyline">
                {ui.shell.pendingApprovalsSummary(approvalSummary.pending, approvalSummary.stale)}
              </p>
              <MutedSystemCopy>
                {approvalSummary.chatPending > 0 ? ui.shell.pendingApprovalsChat : ui.shell.pendingApprovalsSeparate}
              </MutedSystemCopy>
            </TruthRailSection>
          ) : null}

          <TruthRailSection
            title={nextStepTitle}
            testId="truth-rail-next-step"
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

          <TruthRailSection title={ui.shell.diagnosticsLabel} testId="truth-rail-diagnostics">
            <MutedSystemCopy>
              {diagnosticsAccessible ? ui.shell.diagnosticsAvailable : ui.shell.diagnosticsHidden}
            </MutedSystemCopy>
            {!diagnosticsAccessible ? (
              <button type="button" className="secondary-button" onClick={() => setExpertMode(true)}>
                {ui.shell.activateExpert}
              </button>
            ) : (
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDiagnosticsOpen((current) => !current)}
              >
                {diagnosticsOpen ? ui.shell.diagnosticsHide : ui.shell.diagnosticsShow}
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
