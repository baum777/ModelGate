import React, { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { ChatWorkspace } from "./components/ChatWorkspace.js";
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
import { RoutingView } from "./components/RoutingView.js";
import { Sidebar } from "./components/Sidebar.js";
import { Topbar } from "./components/Topbar.js";
import { TruthRail } from "./components/TruthRail.js";
import {
  type StatusPanelRow,
} from "./components/StatusPanel.js";
import {
  MutedSystemCopy,
  SectionLabel,
  ShellCard,
  StatusBadge,
} from "./components/ShellPrimitives.js";
import {
  getShellHealthCopy,
  useLocalization,
} from "./lib/localization.js";
import {
  fetchDiagnostics,
  fetchHealth,
  fetchModels,
  type DiagnosticsResponse
} from "./lib/api.js";
import {
  createInitialGitHubAuthState,
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

type WorkspaceMode = "chat" | "github" | "matrix" | "routing" | "review" | "settings";

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

const WORKSPACE_MODES: WorkspaceMode[] = ["chat", "github", "matrix", "routing", "review", "settings"];

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

function PublicPreview() {
  return (
    <main className="app-shell public-preview" data-testid="public-preview">
      <section className="workspace-hero">
        <div>
          <p className="status-pill status-partial">WIP preview</p>
          <h1>ModelGate</h1>
          <p className="hero-copy">
            Public preview shell. Governed workspace access stays separate from this route.
          </p>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  return shouldRenderConsole() ? <ConsoleShell /> : <PublicPreview />;
}

function shouldRenderConsole() {
  if (typeof window === "undefined") {
    return true;
  }

  const url = new URL(window.location.href);
  return url.pathname === "/console" || url.searchParams.get("console") === "1";
}

function ConsoleShell() {
  const persisted = readPersistedShellState();
  const { locale, setLocale, copy: ui } = useLocalization();
  const appText = useMemo(
    () => locale === "de"
      ? {
          telemetryHealthLoaded: "Backend-Health geladen",
          telemetryHealthLoadedDetail: (service: string, modeLabel: string, allowedModelCount: number) =>
            `${service} meldet ${modeLabel} mit ${allowedModelCount} öffentlichen Modell(aliasen).`,
          telemetryHealthFailed: "Backend-Health fehlgeschlagen",
          telemetryHealthFailedDetail: "Kein Zugriff auf /health",
          telemetryModelAliasLoaded: "Öffentlicher Modellalias geladen",
          telemetryModelAliasLoadedDetail: (alias: string) =>
            `Alias ${alias} ausgewählt; Provider-Ziele bleiben backend-owned.`,
          telemetryModelListFailed: "Modellliste fehlgeschlagen",
          telemetryModelListFailedDetail: "Kein Zugriff auf /models",
          chatGovernancePendingApproval: "Freigabe ausstehend",
          chatGovernanceExecutionRunning: "Ausführung läuft",
          chatGovernanceLastExecutionConfirmed: "Letzte Ausführung bestätigt",
          chatGovernanceProposalRejected: "Vorschlag verworfen",
          chatGovernanceLastExecutionFailed: "Letzte Ausführung fehlgeschlagen",
          chatGovernanceNoOpenProposal: "Kein offener Vorschlag",
          sessionHeaderNote: "Wiederaufnehmbare Sessions pro Workspace",
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
  const [githubAuthState] = useReducer(githubAuthReducer, undefined, createInitialGitHubAuthState);
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
  const [githubContext, setGitHubContext] = useState<GitHubWorkspaceStatus>(() => createDefaultGitHubContext());
  const [matrixContext, setMatrixContext] = useState<MatrixWorkspaceStatus>(() => createDefaultMatrixContext());
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [diagnosticsSnapshot, setDiagnosticsSnapshot] = useState<DiagnosticsResponse | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const githubUnlocked = true;

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

      try {
        const diagnostics = await fetchDiagnostics();

        if (!cancelled) {
          setDiagnosticsSnapshot(diagnostics);
          setDiagnosticsError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setDiagnosticsSnapshot(null);
          setDiagnosticsError(error instanceof Error ? error.message : "Diagnostics unavailable");
        }
      }
    }

    void loadConsoleState();

    return () => {
      cancelled = true;
    };
  }, [appText]);

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
      if (mode === "routing") {
        setMode("chat");
      }
    }
  }, [expertMode, mode]);

  useEffect(() => {
    setDiagnosticsOpen(false);
  }, [mode]);

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
  const reviewHasRejected = reviewItems.some((item) => item.status === "rejected");

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
                : reviewHasRejected
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
  };

  const settingsRows: StatusPanelRow[] = [
    { label: ui.settings.backend, value: settingsTruthSnapshot.backend.label },
    { label: ui.shell.workspaceTabs.github.label, value: `${settingsTruthSnapshot.github.sessionLabel} · ${settingsTruthSnapshot.github.accessLabel}` },
    { label: ui.shell.workspaceTabs.matrix.label, value: `${settingsTruthSnapshot.matrix.identityLabel} · ${settingsTruthSnapshot.matrix.connectionLabel}` },
    { label: ui.settings.modelCardTitle, value: settingsTruthSnapshot.models.activeAlias },
  ];

  const routingRows: StatusPanelRow[] = diagnosticsSnapshot
    ? [
        { label: "active_policy", value: diagnosticsSnapshot.routing.activePolicy },
        { label: "fail_closed", value: String(diagnosticsSnapshot.routing.failClosed) },
        { label: "fallbacks", value: String(diagnosticsSnapshot.routing.fallbackChain.length) },
        { label: "log_enabled", value: String(diagnosticsSnapshot.routing.logEnabled) },
      ]
    : [
        { label: "status", value: diagnosticsError ? "auth required" : "loading" },
      ];

  const currentRows = useMemo(() => {
    switch (mode) {
      case "github":
        return githubRows;
      case "matrix":
        return matrixRows;
      case "routing":
        return routingRows;
      case "review":
        return reviewRows;
      case "settings":
        return settingsRows;
      default:
        return chatRows;
    }
  }, [chatRows, githubRows, matrixRows, mode, reviewRows, routingRows, settingsRows]);

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

        if (reviewHasRejected) {
          return ui.review.terminalDeviation;
        }

        return ui.shell.statusReady;
      case "routing":
        return diagnosticsSnapshot
          ? diagnosticsSnapshot.routing.failClosed
            ? ui.shell.statusReady
            : ui.shell.statusPartial
          : diagnosticsError
            ? ui.shell.statusError
            : ui.shell.statusPartial;
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
    diagnosticsError,
    diagnosticsSnapshot,
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
  const workspaceContextTitle = `${workspaceName} ${ui.shell.workspaceContextSuffix}`;
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

        if (reviewHasStale || reviewHasRejected) {
          return "error";
        }

        return reviewHasPending || reviewHasExecuting ? "partial" : "ready";
      case "routing":
        if (diagnosticsError) {
          return "error";
        }

        if (!diagnosticsSnapshot) {
          return "partial";
        }

        return diagnosticsSnapshot.routing.failClosed ? "ready" : "partial";
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
    diagnosticsError,
    diagnosticsSnapshot,
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
          return githubAuthState.error ? ui.github.workspaceNoticeRepos : ui.auth.footerNote;
        }

        if (githubContext.connectionLabel !== ui.shell.statusReady) {
          return githubContext.connectionLabel === ui.shell.statusError
            ? ui.github.workspaceNoticeRepos
            : ui.shell.healthCheckingDetail;
        }

        if (githubContext.approvalLabel !== ui.common.none) {
          return ui.review.approvalNeeded;
        }

        if (githubContext.repositoryLabel === ui.github.noRepoSelected) {
          return ui.github.nextStepChooseRepo;
        }

        return ui.github.intro;
      case "matrix":
        if (matrixContext.connectionLabel !== ui.shell.statusReady) {
          return matrixContext.connectionLabel === ui.shell.statusError
            ? ui.matrix.topicStatusUnavailable
            : ui.shell.healthCheckingDetail;
        }

        if (matrixContext.scopeLabel === ui.matrix.scopeSelected) {
          return ui.matrix.resolveScope;
        }

        if (matrixContext.approvalLabel !== ui.common.none) {
          return ui.matrix.topicStatusApproval;
        }

        if (matrixContext.summaryLabel === ui.matrix.scopeSummaryUnavailable) {
          return ui.matrix.scopeSummaryLoading;
        }

        return ui.matrix.scopeNotice;
      case "review":
        if (reviewItems.length === 0) {
          return ui.review.emptyTitle;
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

        if (reviewHasRejected) {
          return ui.review.terminalDeviation;
        }

        return ui.review.ready;
      case "routing":
        if (diagnosticsError) {
          return "Diagnostics require backend authorization. Browser remains read-only.";
        }

        if (!diagnosticsSnapshot) {
          return "Routing diagnostics are loading.";
        }

        return "Alias-only routing policy loaded from /diagnostics.";
      case "settings":
        if (backendHealthy === false) {
          return ui.shell.healthUnavailableDetail;
        }

        if (githubAuthState.error) {
          return ui.github.workspaceNoticeRepos;
        }

        if (githubAuthState.status === "loading") {
          return ui.auth.statusChecking;
        }

        if (!githubUnlocked) {
          return ui.shell.accountLoginRequired;
        }

        if (matrixContext.connectionLabel === ui.shell.statusError) {
          return ui.matrix.topicStatusUnavailable;
        }

        if (!activeModelAlias) {
          return ui.settings.modelChoiceNote;
        }

        return ui.settings.connectionTruthNote;
      default:
        if (chatPendingProposal?.status === "pending") {
          return ui.chat.composerLocked.approval;
        }

        if (chatPendingProposal?.status === "executing") {
          return ui.chat.composerLocked.execution;
        }

        if (chatLatestReceipt?.outcome === "failed" || chatLatestReceipt?.outcome === "unverifiable") {
          return ui.shell.statusError;
        }

        return backendHealthy === false ? ui.shell.healthUnavailableDetail : backendHealthy === true ? ui.shell.healthReadyDetail : ui.shell.healthCheckingDetail;
    }
  }, [
    backendHealthy,
    chatLatestReceipt?.outcome,
    chatPendingProposal?.status,
    diagnosticsError,
    diagnosticsSnapshot,
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

        if (reviewHasRejected) {
          return ui.review.terminalDeviation;
        }

        return ui.review.ready;
      case "routing":
        return "Config: config/model-capabilities.yml + config/llm-router.yml. Provider IDs remain backend-only.";
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
    diagnosticsError,
    diagnosticsSnapshot,
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
                    : reviewHasRejected
                      ? ui.review.terminalDeviation
                      : ui.review.ready,
          },
        ];
      case "routing":
        return diagnosticsSnapshot
          ? [
              { label: "active_policy", value: diagnosticsSnapshot.routing.activePolicy },
              { label: "fail_closed", value: String(diagnosticsSnapshot.routing.failClosed) },
              { label: "allow_fallback", value: String(diagnosticsSnapshot.routing.allowFallback) },
              { label: "free_only", value: String(diagnosticsSnapshot.routing.freeOnly) },
            ]
          : [
              { label: "diagnostics", value: diagnosticsError ? "auth required" : "loading" },
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
    diagnosticsError,
    diagnosticsSnapshot,
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
  ) : mode === "github" ? (
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
  ) : mode === "routing" ? (
    <RoutingView diagnosticsSnapshot={diagnosticsSnapshot} diagnosticsError={diagnosticsError} />
  ) : (
    <SettingsWorkspace
      expertMode={expertMode}
      onExpertModeChange={setExpertMode}
      diagnostics={telemetry as DiagnosticEntry[]}
      onClearDiagnostics={() => setTelemetry([])}
      truthSnapshot={settingsTruthSnapshot}
      diagnosticsSnapshot={diagnosticsSnapshot}
      diagnosticsError={diagnosticsError}
    />
  );
  const statusToneForBadge = currentStatusTone === "error" ? "error" : currentStatusTone === "ready" ? "ready" : "partial";
  const accountTone = githubUnlocked ? "ready" : githubAuthState.error ? "error" : "partial";
  const accountLabel = githubUnlocked
    ? ui.shell.accountAuthenticated
    : githubAuthState.status === "loading"
      ? ui.shell.accountChecking
      : ui.shell.accountLocked;
  const visibleWorkspaceModes = expertMode
    ? WORKSPACE_MODES
    : WORKSPACE_MODES.filter((workspaceMode) => workspaceMode !== "routing");

  return (
    <main className="app-shell app-shell-console" data-testid="app-shell">
      <Topbar locale={locale} onLocaleChange={setLocale} health={healthState} />

      <section className="console-layout">
        <Sidebar
          locale={locale}
          workspaceModes={visibleWorkspaceModes}
          activeMode={mode}
          onWorkspaceSelect={handleWorkspaceTabSelect}
          workspaceName={workspaceName}
          activeSession={activeSession}
          sessionStatusTone={statusToneForBadge}
          expertMode={expertMode}
          onExpertModeChange={setExpertMode}
          accountTone={accountTone}
          accountLabel={accountLabel}
          accountError={githubAuthState.error}
          sessionWorkspace={sessionWorkspace}
          sessionWorkspaceSessions={sessionWorkspaceSessions}
          sessionWorkspaceActiveId={sessionWorkspaceActiveId}
          onSessionCreate={() => handleWorkspaceSessionCreate(sessionWorkspace)}
          onSessionSelect={(sessionId) => handleWorkspaceSessionSelect(sessionWorkspace, sessionId)}
          onSessionArchive={(sessionId) => handleWorkspaceSessionArchive(sessionWorkspace, sessionId)}
          onSessionDelete={(sessionId) => handleWorkspaceSessionDelete(sessionWorkspace, sessionId)}
          sessionHeaderNote={appText.sessionHeaderNote}
        />

        <section className="console-main shell-center-main">
          <ShellCard variant="base" className="workspace-frame-card">
            <header className="workspace-frame-header">
              <div>
                <SectionLabel>{workspaceName}</SectionLabel>
                <h2>{activeSession?.title ?? ui.shell.currentSessionFallback}</h2>
              </div>
              <StatusBadge tone={statusToneForBadge}>{currentStatusBadge}</StatusBadge>
            </header>
            <MutedSystemCopy className="workspace-frame-note">{currentStatusHeadline}</MutedSystemCopy>
            <div className="workspace-frame-body">{workspaceSurface}</div>
          </ShellCard>
        </section>

        <TruthRail
          locale={locale}
          expertMode={expertMode}
          healthState={healthState}
          workspaceName={workspaceName}
          activeModelAlias={activeModelAlias}
          activeSession={activeSession}
          statusTone={statusToneForBadge}
          currentStatusBadge={currentStatusBadge}
          approvalSummary={approvalSummary}
          workspaceContextTitle={workspaceContextTitle}
          currentRows={currentRows}
          currentHelperText={currentHelperText}
          diagnosticsAccessible={diagnosticsAccessible}
          diagnosticsOpen={diagnosticsOpen}
          diagnosticsTitle={diagnosticsTitle}
          diagnosticsRows={currentExpertRows}
          diagnosticsChildren={currentExpertChildren}
          onActivateExpert={() => setExpertMode(true)}
          onDiagnosticsToggle={setDiagnosticsOpen}
        />
      </section>
    </main>
  );
}
