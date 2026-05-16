import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestChatCompletion } from "../../lib/api.js";
import {
  type GitHubWorkspaceStatus,
} from "../../components/GitHubWorkspace.js";
import {
  type MatrixWorkspaceStatus,
} from "../../components/MatrixWorkspace.js";
import {
  SettingsWorkspace,
  type DiagnosticEntry,
  type SettingsTruthSnapshot,
} from "../../components/SettingsWorkspace.js";
import { SessionList } from "../../components/SessionList.js";
import {
  type StatusPanelRow,
} from "../../components/StatusPanel.js";
import {
  MutedSystemCopy,
  SectionLabel,
  ShellCard,
  StatusBadge,
  TruthRailSection,
} from "../../components/ShellPrimitives.js";
import { FloatingCompanion } from "../../components/FloatingCompanion.js";
import { buildCompanionContext } from "../../lib/companion-context.js";
import {
  validateCompanionIntent,
  type CompanionAllowedIntent,
} from "../../lib/companion-intents.js";
import {
  getShellHealthCopy,
  getSessionStatusLabel,
  useLocalization,
} from "../../lib/localization.js";
import {
  deriveSettingsLoginAdapters,
} from "../../lib/settings-login-adapters.js";
import {
  type WorkspaceKind,
} from "../../lib/workspace-state.js";
import {
  summarizePendingApprovals,
} from "../../lib/shell-view-model.js";
import {
  getWorkModeCopy,
  isExpertMode,
  resolvePersistedWorkMode,
  type WorkMode,
} from "../../lib/work-mode.js";
import { BottomNav } from "../../components/navigation/BottomNav.js";
import { ContextStrip, type MobileContextStatus } from "../../components/mobile/layout/ContextStrip.js";
import { TopContextBar } from "../../components/mobile/layout/TopContextBar.js";
import { useRuntimeStatus } from "../../hooks/useRuntimeStatus.js";
import { useWorkspaceSessions } from "../../hooks/useWorkspaceSessions.js";
import { useCrossTabCommands } from "../../hooks/useCrossTabCommands.js";
import type { CrossTabCommand } from "../../lib/cross-tab-commands.js";
import { useReviewState } from "../../hooks/useReviewState.js";
import { deriveShellFreshness, type ShellFreshness } from "../../lib/shell-freshness.js";
import type { NavigationPaletteEntry } from "../../lib/navigation-palette.js";
import {
  MOBILE_NAV_MODES,
  WORKSPACE_MODES,
  isSessionWorkspace,
  normalizeWorkspaceMode,
  toWorkspaceKind,
  toWorkspaceMode,
  type WorkspaceMode,
} from "../../lib/shell-routing.js";
import { MosaicStackedIcon, WorkspaceIcon } from "./ShellIcons.js";
import { BeginnerExpertToggle, RouteStatusLadder } from "./ShellControls.js";

const loadChatWorkspace = () => import("../../components/ChatWorkspace.js");
const loadGitHubWorkspace = () => import("../../components/GitHubWorkspace.js");
const loadMatrixWorkspace = () => import("../../components/MatrixWorkspace.js");

const ChatWorkspace = lazy(() => loadChatWorkspace().then((module) => ({ default: module.ChatWorkspace })));
const GitHubWorkspace = lazy(() => loadGitHubWorkspace().then((module) => ({ default: module.GitHubWorkspace })));
const MatrixWorkspace = lazy(() => loadMatrixWorkspace().then((module) => ({ default: module.MatrixWorkspace })));

type TelemetryEntry = {
  id: string;
  kind: "info" | "warning" | "error";
  label: string;
  detail?: string;
};

type PersistedShellState = {
  activeTab?: string;
  workMode?: WorkMode;
  expertMode?: boolean;
};

const SHELL_STORAGE_KEY = "mosaicstacked.console.shell.v2";
const DEFAULT_FREE_MODEL_ALIAS = "default-free";

function readUrlWorkspaceMode() {
  if (typeof window === "undefined") {
    return null;
  }

  const url = new URL(window.location.href);
  const requestedMode = url.searchParams.get("mode");
  return normalizeWorkspaceMode(requestedMode);
}

function replaceConsoleUrl(mode?: WorkspaceMode) {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  url.pathname = "/console";
  url.searchParams.delete("console");

  if (mode) {
    url.searchParams.set("mode", mode);
  }

  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function createId() {
  return crypto.randomUUID();
}

function hasPrimaryModifier(event: KeyboardEvent) {
  return event.metaKey || event.ctrlKey;
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

const MOBILE_BREAKPOINT_QUERY = "(max-width: 760px)";
const MATRIX_HIERARCHY_ENABLED = ((import.meta as { env?: { VITE_MATRIX_HIERARCHY?: string } }).env?.VITE_MATRIX_HIERARCHY ?? "false") === "true";
// Reference-only mobile demo pages stay in-repo, but runtime defaults to functional workspaces.
const MOBILE_REFERENCE_SURFACES_ENABLED = false;

function useDarkOnlyTheme() {
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.documentElement.dataset.theme = "dark";
    document.body.classList.remove("light-mode");
  }, []);
}

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }

    return window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };

    setIsMobile(media.matches);
    media.addEventListener("change", onChange);

    return () => {
      media.removeEventListener("change", onChange);
    };
  }, []);

  return isMobile;
}

export function ConsoleShell() {
  const persisted = readPersistedShellState();
  const { locale, setLocale, copy: ui } = useLocalization();
  useDarkOnlyTheme();
  const isMobileViewport = useIsMobileViewport();
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
          processGoReview: "Workbench öffnen",
          processGoWorkspace: "Workspace öffnen",
          processCreateSession: "Neue Session",
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
          processGoReview: "Open workbench",
          processGoWorkspace: "Open workspace",
          processCreateSession: "New session",
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
  const [mode, setMode] = useState<WorkspaceMode>(
    () => readUrlWorkspaceMode() ?? normalizeWorkspaceMode(persisted?.activeTab) ?? "chat",
  );
  const [workMode, setWorkMode] = useState<WorkMode>(() => resolvePersistedWorkMode(persisted));
  const expertMode = isExpertMode(workMode);
  const workModeCopy = getWorkModeCopy(locale, workMode);
  const [telemetry, setTelemetry] = useState<TelemetryEntry[]>([]);
  const [githubContext, setGitHubContext] = useState<GitHubWorkspaceStatus>(() => createDefaultGitHubContext());
  const [matrixContext, setMatrixContext] = useState<MatrixWorkspaceStatus>(() => createDefaultMatrixContext());
  const { reviewItems, githubReviewDirty, setGitHubReviewDirty, updateGitHubReviewItems, updateMatrixReviewItems } = useReviewState();
  const [mobileContextOpen, setMobileContextOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const mobileSettingsLongPressRef = useRef<number | null>(null);
  const mobileSettingsLongPressTriggeredRef = useRef(false);
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
  const {
    backendHealthy,
    activeModelAlias,
    setActiveModelAlias,
    availableModels,
    modelRegistry,
    runtimeDiagnostics,
    integrationsStatus,
    githubCapabilities,
    runtimeJournalEntries,
    openRouterCredentialStatus,
    openRouterApiKeyInput,
    setOpenRouterApiKeyInput,
    openRouterModelInput,
    setOpenRouterModelInput,
    isSavingOpenRouterCredentials,
    isTestingOpenRouterCredentials,
    openRouterCredentialMessage,
    settingsVerificationResults,
    routingStatus,
    refreshIntegrationsStatus,
    refreshOpenRouterCredentialStatus,
    handleSaveOpenRouterCredentials,
    handleTestOpenRouterCredentials,
    handleSettingsVerifyConnection,
    handleIntegrationAction,
    buildSettingsIntegrationStartUrl,
  } = useRuntimeStatus({
    mode,
    locale,
    appText: {
      telemetryHealthLoaded: appText.telemetryHealthLoaded,
      telemetryHealthLoadedDetail: appText.telemetryHealthLoadedDetail,
      telemetryHealthFailed: appText.telemetryHealthFailed,
      telemetryHealthFailedDetail: appText.telemetryHealthFailedDetail,
      telemetryModelAliasLoaded: appText.telemetryModelAliasLoaded,
      telemetryModelAliasLoadedDetail: appText.telemetryModelAliasLoadedDetail,
      telemetryModelListFailed: appText.telemetryModelListFailed,
      telemetryModelListFailedDetail: appText.telemetryModelListFailedDetail,
      telemetryDiagnosticsFailed: appText.telemetryDiagnosticsFailed,
      telemetryDiagnosticsFailedDetail: appText.telemetryDiagnosticsFailedDetail,
    },
    onTelemetry: recordTelemetry,
  });
  const {
    workspaceState,
    setWorkspaceState,
    restoredSession,
    chatSession,
    githubSession,
    matrixSession,
    getWorkspaceSessions,
    handleWorkspaceSessionCreate: createWorkspaceSession,
    handleWorkspaceSessionSelect: selectWorkspaceSession,
    selectActiveWorkspaceSession,
    handleWorkspaceSessionArchive,
    handleWorkspaceSessionDelete,
    handleChatSessionChange,
    handleGitHubSessionChange,
    handleMatrixSessionChange,
  } = useWorkspaceSessions(activeModelAlias);
  const {
    pinnedChatContext,
    handleWorkspaceTabSelect,
    handlePinChatContext,
    handleClearPinnedChatContext,
    handleCrossTabCommand,
  } = useCrossTabCommands({
    locale,
    mode,
    setMode,
    githubReviewDirty,
    githubReviewConfirmNavigation: ui.github.reviewDirtyConfirmNavigation,
    setWorkspaceState,
    selectActiveWorkspaceSession,
    recordTelemetry,
  });

  useEffect(() => {
    persistShellState({
      activeTab: mode,
      workMode,
      expertMode,
    });
  }, [expertMode, mode, workMode]);

  useEffect(() => {
    replaceConsoleUrl(mode);
  }, [mode]);

  useEffect(() => {
    setMobileContextOpen(false);
  }, [mode]);

  useEffect(() => {
    if (!isMobileViewport) {
      setMobileContextOpen(false);
    }
  }, [isMobileViewport]);

  const handleWorkspaceSessionCreate = useCallback((workspace: WorkspaceKind) => {
    setMode(toWorkspaceMode(workspace));
    createWorkspaceSession(workspace);
  }, [createWorkspaceSession]);

  const handleWorkspaceSessionSelect = useCallback((workspace: WorkspaceKind, sessionId: string) => {
    setMode(toWorkspaceMode(workspace));
    selectWorkspaceSession(workspace, sessionId);
  }, [selectWorkspaceSession]);

  const handleMobileNavSelect = useCallback((nextMode: WorkspaceMode) => {
    setMobileContextOpen(false);
    handleWorkspaceTabSelect(nextMode);
  }, [handleWorkspaceTabSelect]);

  const handleMobileContextToggle = useCallback(() => {
    setMobileContextOpen((current) => !current);
  }, []);

  const handleMobileBrandPointerDown = useCallback(() => {
    if (!isMobileViewport) {
      return;
    }

    mobileSettingsLongPressTriggeredRef.current = false;
    mobileSettingsLongPressRef.current = globalThis.setTimeout(() => {
      mobileSettingsLongPressTriggeredRef.current = true;
      setMobileContextOpen(false);
      handleWorkspaceTabSelect("settings");
    }, 650);
  }, [handleWorkspaceTabSelect, isMobileViewport]);

  const clearMobileBrandLongPress = useCallback(() => {
    if (mobileSettingsLongPressRef.current !== null) {
      globalThis.clearTimeout(mobileSettingsLongPressRef.current);
      mobileSettingsLongPressRef.current = null;
    }
  }, []);

  const handleMobileBrandClick = useCallback(() => {
    if (mobileSettingsLongPressTriggeredRef.current) {
      mobileSettingsLongPressTriggeredRef.current = false;
      return;
    }

    handleWorkspaceTabSelect("chat");
  }, [handleWorkspaceTabSelect]);

  useEffect(() => () => {
    clearMobileBrandLongPress();
  }, [clearMobileBrandLongPress]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!hasPrimaryModifier(event)) {
        if (event.key === "Escape") {
          if (paletteOpen) {
            event.preventDefault();
            setPaletteOpen(false);
            setPaletteQuery("");
            return;
          }

          if (mobileContextOpen) {
            event.preventDefault();
            setMobileContextOpen(false);
          }
        }
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "k") {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }

      if (event.shiftKey && key === "e") {
        event.preventDefault();
        setWorkMode((current) => current === "expert" ? "beginner" : "expert");
        return;
      }

      if (event.shiftKey) {
        return;
      }

      if (key === "1") {
        event.preventDefault();
        handleWorkspaceTabSelect("chat");
      } else if (key === "2") {
        event.preventDefault();
        handleWorkspaceTabSelect("workbench");
      } else if (key === "3") {
        event.preventDefault();
        handleWorkspaceTabSelect("matrix");
      } else if (key === "4") {
        event.preventDefault();
        handleWorkspaceTabSelect("settings");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleWorkspaceTabSelect, mobileContextOpen, paletteOpen]);

  const sessionWorkspace: WorkspaceKind = isSessionWorkspace(mode) ? toWorkspaceKind(mode) : workspaceState.activeWorkspace;
  const sessionWorkspaceSessions = getWorkspaceSessions(sessionWorkspace);
  const sessionWorkspaceActiveId = workspaceState.activeSessionIdByWorkspace[sessionWorkspace];
  const activeSession = sessionWorkspaceSessions.find((session) => session.id === sessionWorkspaceActiveId) ?? sessionWorkspaceSessions[0] ?? null;
  const freshness: ShellFreshness = deriveShellFreshness({
    backendHealthy,
    restoredSession,
  });
  const freshnessLabel = freshness === "backend-fresh"
    ? (locale === "de" ? "backend-fresh" : "backend-fresh")
    : freshness === "local-restored"
      ? (locale === "de" ? "local-restored" : "local-restored")
      : (locale === "de" ? "stale" : "stale");
  const freshnessHint = freshness === "backend-fresh"
    ? (locale === "de" ? "Live-Backend-Status" : "Live backend status")
    : freshness === "local-restored"
      ? (locale === "de" ? "Aus lokalem Restore geladen" : "Loaded from local restore")
      : (locale === "de" ? "Veraltet oder nicht erreichbar" : "Stale or unreachable");
  const workbenchTabLabel = `${ui.shell.workspaceTabs.workbench.label}${githubReviewDirty ? " •" : ""}`;
  const matrixDraftDefaultRoomId = matrixSession?.metadata.roomId?.trim()
    || matrixSession?.metadata.topicRoomId?.trim()
    || matrixSession?.metadata.selectedRoomIds[0]?.trim()
    || null;
  const matrixDraftRoomOptions = useMemo(() => {
    const candidates = [
      matrixSession?.metadata.roomId,
      matrixSession?.metadata.topicRoomId,
      matrixSession?.metadata.provenanceRoomId,
      ...(matrixSession?.metadata.selectedRoomIds ?? []),
    ];
    const next: string[] = [];
    for (const value of candidates) {
      const trimmed = value?.trim();
      if (!trimmed || next.includes(trimmed)) {
        continue;
      }
      next.push(trimmed);
    }
    return next;
  }, [
    matrixSession?.metadata.provenanceRoomId,
    matrixSession?.metadata.roomId,
    matrixSession?.metadata.selectedRoomIds,
    matrixSession?.metadata.topicRoomId,
  ]);
  const hasRepoContext = Boolean(githubSession?.metadata.selectedRepoFullName);
  const workbenchRepoBinding = githubSession?.metadata.selectedRepoFullName ?? null;
  const workbenchBranchBinding =
    githubContext.expertDetails.branchName
    ?? githubSession?.metadata.proposalPlan?.branchName
    ?? githubSession?.metadata.proposalPlan?.baseRef
    ?? githubSession?.metadata.analysisBundle?.ref
    ?? null;
  const workbenchScopeBinding =
    githubSession?.metadata.proposalPlan?.diff[0]?.path
    ?? githubSession?.metadata.analysisBundle?.files[0]?.path
    ?? null;
  const repoChipLabel = hasRepoContext
    ? `⊟ ${githubSession?.metadata.selectedRepoFullName}`
    : (locale === "de" ? "⊡ Kein Kontext" : "⊡ No context");
  const branchChipLabel = hasRepoContext
    ? (
        githubContext.expertDetails.branchName
        ?? githubSession?.metadata.proposalPlan?.baseRef
        ?? githubSession?.metadata.analysisBundle?.ref
        ?? ui.common.na
      )
    : (locale === "de" ? "Tippe ⊡ für Repo" : "Tap ⊡ to load repo");
  const fileChipLabel = hasRepoContext
    ? (
        githubSession?.metadata.analysisBundle?.files[0]?.path
        ?? githubSession?.metadata.proposalPlan?.diff[0]?.path
        ?? (locale === "de" ? "Keine Datei" : "No file")
      )
    : (locale === "de" ? "Datei wählen" : "Choose a file");

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
  const githubConfigured = runtimeDiagnostics?.github.configured ?? null;
  const githubReady = runtimeDiagnostics?.github.ready ?? null;
  const githubAccountLabel = githubConfigured === false || githubReady === false
    ? ui.settings.notConfigured
    : githubConfigured === null || githubReady === null
      ? ui.shell.healthChecking
      : ui.settings.configured;
  const githubAccessLabel = githubConfigured === false || githubReady === false
    ? ui.settings.notConfigured
    : githubContext.accessLabel;

  const githubRows: StatusPanelRow[] = [
    { label: ui.github.connectedRepo, value: githubContext.repositoryLabel },
    { label: ui.settings.githubConnection, value: githubContext.connectionLabel },
    { label: ui.github.readOnly, value: githubAccessLabel },
    ...(githubContext.approvalLabel !== ui.common.none
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
  const routeOwnershipRows = mode === "workbench"
    ? [
        {
          label: "identity",
          value: githubAccountLabel,
          tone: githubReady === true ? "ready" as const : githubReady === false ? "error" as const : "partial" as const,
        },
        {
          label: "config",
          value: runtimeDiagnostics?.github.configured ? ui.settings.configured : runtimeDiagnostics ? ui.settings.notConfigured : ui.shell.healthChecking,
          tone: runtimeDiagnostics?.github.configured ? "ready" as const : runtimeDiagnostics ? "error" as const : "partial" as const,
        },
        {
          label: "scope",
          value: githubContext.repositoryLabel,
          tone: githubContext.repositoryLabel === ui.github.noRepoSelected ? "partial" as const : "ready" as const,
        },
        {
          label: "execute",
          value: githubContext.approvalLabel,
          tone: githubContext.approvalLabel === ui.common.none ? "muted" as const : "partial" as const,
        },
        {
          label: "verify",
          value: githubContext.resultLabel,
          tone: githubContext.resultLabel === ui.github.verifyResult ? "muted" as const : "ready" as const,
        },
      ]
    : mode === "matrix"
      ? [
          {
            label: "identity",
            value: matrixContext.identityLabel,
            tone: runtimeDiagnostics?.matrix.configured ? "ready" as const : runtimeDiagnostics ? "error" as const : "partial" as const,
          },
          {
            label: "rooms",
            value: matrixContext.connectionLabel,
            tone: matrixContext.connectionLabel === ui.shell.healthChecking ? "partial" as const : "ready" as const,
          },
          {
            label: "scope",
            value: matrixContext.scopeLabel,
            tone: matrixContext.scopeLabel === ui.matrix.scopeUnresolved ? "partial" as const : "ready" as const,
          },
          {
            label: "analyze",
            value: matrixContext.summaryLabel,
            tone: matrixContext.summaryLabel === ui.matrix.scopeSummaryUnavailable ? "muted" as const : "ready" as const,
          },
          {
            label: "execute",
            value: matrixContext.approvalLabel,
            tone: matrixContext.approvalLabel === ui.common.none ? "muted" as const : "partial" as const,
          },
          {
            label: "verify",
            value: matrixContext.expertDetails.sseLifecycle,
            tone: matrixContext.expertDetails.sseLifecycle === ui.common.loading ? "muted" as const : "ready" as const,
          },
        ]
      : [];

  const defaultFreeStatus: SettingsTruthSnapshot["models"]["defaultFreeStatus"] = backendHealthy === false
    ? "unavailable"
    : openRouterCredentialStatus.defaultFree.status;

  const settingsTruthSnapshot: SettingsTruthSnapshot = {
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
      sessionLabel: githubAccountLabel,
      connectionLabel: githubContext.connectionLabel,
      repositoryLabel: githubContext.repositoryLabel,
      accessLabel: githubAccessLabel,
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
      defaultFreeStatus,
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
      rateLimitDefaults: runtimeDiagnostics
        ? `chat:${runtimeDiagnostics.rateLimit.limits.chat}, auth:${runtimeDiagnostics.rateLimit.limits.auth_login}, gh-propose:${runtimeDiagnostics.rateLimit.limits.github_propose}, gh-exec:${runtimeDiagnostics.rateLimit.limits.github_execute}, matrix-exec:${runtimeDiagnostics.rateLimit.limits.matrix_execute}`
        : "chat:30, auth:8, gh-propose:10, gh-exec:6, matrix-exec:6",
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

  const settingsLoginAdapters = useMemo(() => deriveSettingsLoginAdapters({
    copy: {
      checking: ui.shell.healthChecking,
      unavailable: ui.shell.healthUnavailable,
      none: ui.common.none,
    },
    integrations: integrationsStatus
  }), [
    integrationsStatus,
    ui.common.none,
    ui.shell.healthChecking,
    ui.shell.healthUnavailable
  ]);

  const settingsRows: StatusPanelRow[] = [
    { label: ui.settings.backend, value: settingsTruthSnapshot.backend.label },
    { label: ui.shell.workspaceTabs.workbench.label, value: `${settingsTruthSnapshot.github.sessionLabel} · ${settingsTruthSnapshot.github.accessLabel}` },
    { label: ui.shell.workspaceTabs.matrix.label, value: `${settingsTruthSnapshot.matrix.identityLabel} · ${settingsTruthSnapshot.matrix.connectionLabel}` },
    { label: ui.settings.modelCardTitle, value: settingsTruthSnapshot.models.activeAlias },
  ];

  const currentRows = useMemo(() => {
    switch (mode) {
      case "workbench":
        return githubRows;
      case "matrix":
        return matrixRows;
      case "settings":
        return settingsRows;
      default:
        return chatRows;
    }
  }, [chatRows, githubRows, matrixRows, mode, settingsRows]);

  const currentStatusBadge = useMemo(() => {
    switch (mode) {
      case "workbench":
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
      case "settings":
        if (backendHealthy === false) {
          return ui.shell.statusError;
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
    githubContext.approvalLabel,
    githubContext.connectionLabel,
    githubContext.repositoryLabel,
    activeModelAlias,
    matrixContext.approvalLabel,
    matrixContext.connectionLabel,
    matrixContext.scopeLabel,
    matrixContext.summaryLabel,
    mode,
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
  const workspaceTabLabels = useMemo(() => ({
    chat: ui.shell.workspaceTabs.chat.label,
    workbench: workbenchTabLabel,
    matrix: ui.shell.workspaceTabs.matrix.label,
    settings: ui.shell.workspaceTabs.settings.label,
  }), [ui.shell.workspaceTabs.chat.label, ui.shell.workspaceTabs.matrix.label, ui.shell.workspaceTabs.settings.label, workbenchTabLabel]);
  const workspaceName = workspaceTabLabels[mode];
  const nextStepTitle = ui.review.nextStepLabel;
  const matrixReadAvailable = integrationsStatus?.matrix.capabilities.read === "available";

  useEffect(() => {
    if (!paletteOpen) {
      setPaletteQuery("");
    }
  }, [paletteOpen]);

  const paletteEntries = useMemo<NavigationPaletteEntry[]>(() => {
    const tabEntries: NavigationPaletteEntry[] = WORKSPACE_MODES.map((workspaceMode) => ({
      id: `tab:${workspaceMode}`,
      kind: "tab",
      label: workspaceTabLabels[workspaceMode],
      detail: locale === "de" ? "Navigation" : "Navigation",
      mode: workspaceMode,
      onSelect: () => {
        handleWorkspaceTabSelect(workspaceMode);
        setPaletteOpen(false);
      },
    }));

    const sessionEntries: NavigationPaletteEntry[] = (["chat", "github", "matrix"] as const).flatMap((workspace) => {
      const workspaceMode = toWorkspaceMode(workspace);
      const workspaceSessions = getWorkspaceSessions(workspace);
      return workspaceSessions
        .filter((session) => !session.archived)
        .map((session) => ({
          id: `session:${workspace}:${session.id}`,
          kind: "session" as const,
          label: session.title,
          detail: `${workspaceTabLabels[workspaceMode]} · ${session.status}`,
          mode: workspaceMode,
          onSelect: () => {
            handleWorkspaceSessionSelect(workspace, session.id);
            setPaletteOpen(false);
          },
        }));
    });

    return [...tabEntries, ...sessionEntries];
  }, [getWorkspaceSessions, handleWorkspaceSessionSelect, handleWorkspaceTabSelect, locale, workspaceTabLabels]);

  const filteredPaletteEntries = useMemo(() => {
    const query = paletteQuery.trim().toLowerCase();
    if (!query) {
      return paletteEntries;
    }

    return paletteEntries.filter((entry) => (
      entry.label.toLowerCase().includes(query)
      || entry.detail.toLowerCase().includes(query)
    ));
  }, [paletteEntries, paletteQuery]);

  const currentStatusTone = useMemo(() => {
    switch (mode) {
      case "workbench":
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
      case "settings":
        if (backendHealthy === false) {
          return "error";
        }

        if (matrixContext.connectionLabel === ui.shell.healthChecking) {
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
    githubContext.approvalLabel,
    githubContext.connectionLabel,
    githubContext.repositoryLabel,
    activeModelAlias,
    matrixContext.connectionLabel,
    matrixContext.approvalLabel,
    matrixContext.scopeLabel,
    matrixContext.summaryLabel,
    mode,
  ]);

  const currentHelperText = useMemo(() => {
    switch (mode) {
      case "workbench":
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
      case "settings":
        if (backendHealthy === false) {
          return ui.shell.healthUnavailableDetail;
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
    githubContext.approvalLabel,
    githubContext.repositoryLabel,
    matrixContext.connectionLabel,
    matrixContext.approvalLabel,
    matrixContext.scopeLabel,
    matrixContext.summaryLabel,
    mode,
  ]);

  const clearTelemetry = useCallback(() => {
    setTelemetry([]);
  }, []);
  const workbenchBinding = useMemo(
    () => ({
      repo: workbenchRepoBinding,
      branch: workbenchBranchBinding,
      scope: workbenchScopeBinding,
    }),
    [workbenchBranchBinding, workbenchRepoBinding, workbenchScopeBinding],
  );
  const chatWorkspaceProps = useMemo(
    () => ({
      session: chatSession,
      workMode,
      backendHealthy,
      routingStatus,
      activeModelAlias,
      availableModels,
      modelRegistry,
      onActiveModelAliasChange: setActiveModelAlias,
      onTelemetry: recordTelemetry,
      onSessionChange: handleChatSessionChange,
      pinnedContext: pinnedChatContext,
      onClearPinnedContext: handleClearPinnedChatContext,
      matrixDraftDefaultRoomId,
      matrixDraftRoomOptions,
      workbenchBinding,
      onCrossTabCommand: (command: CrossTabCommand) => {
        handleCrossTabCommand(command);
      },
    }),
    [
      activeModelAlias,
      availableModels,
      backendHealthy,
      chatSession,
      handleChatSessionChange,
      handleClearPinnedChatContext,
      handleCrossTabCommand,
      matrixDraftDefaultRoomId,
      matrixDraftRoomOptions,
      modelRegistry,
      pinnedChatContext,
      recordTelemetry,
      routingStatus,
      setActiveModelAlias,
      workMode,
      workbenchBinding,
    ],
  );
  const githubWorkspaceProps = useMemo(
    () => ({
      session: githubSession,
      backendHealthy,
      workMode,
      onTelemetry: recordTelemetry,
      onContextChange: setGitHubContext,
      onReviewItemsChange: updateGitHubReviewItems,
      onReviewDirtyChange: setGitHubReviewDirty,
      onPinChatContext: handlePinChatContext,
      onSessionChange: handleGitHubSessionChange,
      githubIntegration: integrationsStatus?.github ?? null,
      githubCapabilities,
      onIntegrationAction: handleIntegrationAction,
    }),
    [
      backendHealthy,
      githubSession,
      handleGitHubSessionChange,
      handleIntegrationAction,
      handlePinChatContext,
      githubCapabilities,
      integrationsStatus?.github,
      recordTelemetry,
      setGitHubReviewDirty,
      updateGitHubReviewItems,
      workMode,
    ],
  );
  const matrixWorkspaceProps = useMemo(
    () => ({
      session: matrixSession,
      restoredSession,
      workMode,
      expertMode,
      matrixReadAvailable,
      matrixHierarchyEnabled: MATRIX_HIERARCHY_ENABLED,
      onTelemetry: recordTelemetry,
      onContextChange: setMatrixContext,
      onReviewItemsChange: updateMatrixReviewItems,
      onSessionChange: handleMatrixSessionChange,
      onQueueChatDraft: (content: string) => {
        handleCrossTabCommand({
          type: "QueueChatDraft",
          payload: {
            content,
            source: "matrix",
          },
        });
      },
    }),
    [
      expertMode,
      handleMatrixSessionChange,
      handleCrossTabCommand,
      matrixReadAvailable,
      matrixSession,
      recordTelemetry,
      restoredSession,
      updateMatrixReviewItems,
      workMode,
    ],
  );
  const settingsWorkspaceProps = useMemo(
    () => ({
      workMode,
      onWorkModeChange: setWorkMode,
      diagnostics: telemetry as DiagnosticEntry[],
      onClearDiagnostics: clearTelemetry,
      truthSnapshot: settingsTruthSnapshot,
      loginAdapters: settingsLoginAdapters,
      openRouterCredentialStatus,
      openRouterApiKeyInput,
      openRouterModelInput,
      onOpenRouterApiKeyInputChange: setOpenRouterApiKeyInput,
      onOpenRouterModelInputChange: setOpenRouterModelInput,
      onSaveOpenRouterCredentials: handleSaveOpenRouterCredentials,
      onTestOpenRouterCredentials: handleTestOpenRouterCredentials,
      isSavingOpenRouterCredentials,
      isTestingOpenRouterCredentials,
      openRouterCredentialMessage,
      buildIntegrationStartUrl: buildSettingsIntegrationStartUrl,
      onIntegrationAction: handleIntegrationAction,
      verificationResults: settingsVerificationResults,
      onVerifyConnection: handleSettingsVerifyConnection,
    }),
    [
      buildSettingsIntegrationStartUrl,
      clearTelemetry,
      handleIntegrationAction,
      handleSaveOpenRouterCredentials,
      handleSettingsVerifyConnection,
      handleTestOpenRouterCredentials,
      isSavingOpenRouterCredentials,
      isTestingOpenRouterCredentials,
      openRouterApiKeyInput,
      openRouterCredentialMessage,
      openRouterCredentialStatus,
      openRouterModelInput,
      setOpenRouterApiKeyInput,
      setOpenRouterModelInput,
      settingsLoginAdapters,
      settingsTruthSnapshot,
      settingsVerificationResults,
      telemetry,
      workMode,
    ],
  );
  const workspaceSurface = mode === "chat" ? (
    <ChatWorkspace
      key={chatSession?.id ?? "chat-session"}
      {...chatWorkspaceProps}
    />
  ) : mode === "workbench" ? (
    <GitHubWorkspace
      key={githubSession?.id ?? "github-session"}
      {...githubWorkspaceProps}
    />
  ) : mode === "matrix" ? (
    <MatrixWorkspace
      key={matrixSession?.id ?? "matrix-session"}
      {...matrixWorkspaceProps}
    />
  ) : (
    <SettingsWorkspace {...settingsWorkspaceProps} />
  );
  const statusToneForBadge = currentStatusTone === "error" ? "error" : currentStatusTone === "ready" ? "ready" : "partial";
  const activeMobileNav = mode;
  const mobileContextStatus: { label: MobileContextStatus; tone: MobileContextStatus } = (() => {
    if (mode === "chat") {
      if (chatSession?.metadata.chatState.connectionState === "streaming" || chatSession?.metadata.chatState.connectionState === "submitting") {
        return { label: "streaming", tone: "streaming" };
      }

      if (chatPendingProposal?.status === "pending" || chatPendingProposal?.status === "executing") {
        return { label: "pending", tone: "pending" };
      }

      if (
        chatSession?.metadata.chatState.connectionState === "error"
        || chatSession?.metadata.chatState.lastError
        || chatLatestReceipt?.outcome === "failed"
        || chatLatestReceipt?.outcome === "unverifiable"
      ) {
        return { label: "error", tone: "error" };
      }

      return { label: "idle", tone: "idle" };
    }

    if (currentStatusTone === "error") {
      return { label: "error", tone: "error" };
    }

    if (currentStatusTone === "partial") {
      return { label: "pending", tone: "pending" };
    }

    return { label: "idle", tone: "idle" };
  })();
  const showRouteOwnershipContext = mode === "workbench" || mode === "matrix";
  const mobileWorkspaceSurface = workspaceSurface;
  const companionContext = useMemo(
    () => buildCompanionContext({
      workspace: mode,
      workMode,
      freshness,
      backendHealthy,
      activeModelAlias,
      integrationsStatus,
      runtimeJournalEntries,
      chatSession,
      githubSession,
      matrixSession,
    }),
    [
      activeModelAlias,
      backendHealthy,
      chatSession,
      freshness,
      githubSession,
      integrationsStatus,
      matrixSession,
      mode,
      runtimeJournalEntries,
      workMode,
    ],
  );
  const handleCompanionQuestion = useCallback(async (question: string) => {
    if (backendHealthy !== true) {
      const unavailableCopy = locale === "de"
        ? "Backend derzeit nicht erreichbar. Prüfe die Verbindung in Settings."
        : "Backend is currently unreachable. Check connectivity in Settings.";
      recordTelemetry("warning", "Helpdesk companion blocked", unavailableCopy);
      return unavailableCopy;
    }

    try {
      const response = await requestChatCompletion({
        modelAlias: DEFAULT_FREE_MODEL_ALIAS,
        messages: [
          {
            role: "user",
            content: question,
          },
        ],
      });
      recordTelemetry("info", "Helpdesk companion reply", `Alias ${response.model} returned a backend answer.`);
      return response.text;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Companion backend request failed";
      recordTelemetry("warning", "Helpdesk companion failed", message);
      return locale === "de"
        ? "Companion konnte die Antwort nicht laden. Prüfe Backend und Modellzugang."
        : "Companion could not load a response. Check backend and model access.";
    }
  }, [backendHealthy, locale, recordTelemetry]);
  const handleCompanionIntent = useCallback((intent: CompanionAllowedIntent) => {
    const validation = validateCompanionIntent(intent, locale);

    if (validation.state === "blocked") {
      recordTelemetry("warning", "Companion intent blocked", validation.intent.reason);
      return;
    }

    const allowedIntent = validation.intent;

    switch (allowedIntent.kind) {
      case "navigate_tab":
        handleWorkspaceTabSelect(allowedIntent.target);
        recordTelemetry("info", "Companion navigation", allowedIntent.label);
        return;
      case "open_panel":
        if (allowedIntent.panel === "command_palette") {
          setPaletteOpen(true);
        } else {
          handleWorkspaceTabSelect("settings");
        }
        recordTelemetry("info", "Companion panel", allowedIntent.label);
        return;
      case "prefill_chat":
        handleCrossTabCommand({
          type: "QueueChatDraft",
          payload: {
            content: allowedIntent.text,
            source: "companion",
          },
        });
        return;
      case "prefill_matrix_draft":
        handleCrossTabCommand({
          type: "QueueMatrixDraft",
          payload: {
            sourceMessageId: "floating-companion",
            roomId: allowedIntent.roomId ?? matrixDraftDefaultRoomId ?? "",
            content: allowedIntent.text,
            tags: ["todo"],
          },
        });
        return;
      case "start_safe_check":
        void Promise.allSettled([
          refreshIntegrationsStatus(),
          refreshOpenRouterCredentialStatus(),
        ]);
        recordTelemetry("info", "Companion safe check", allowedIntent.target);
        return;
      case "explain_status":
      case "show_step_guide":
        recordTelemetry("info", "Companion guide", allowedIntent.label);
        return;
      default:
        return;
    }
  }, [
    handleCrossTabCommand,
    handleWorkspaceTabSelect,
    locale,
    matrixDraftDefaultRoomId,
    recordTelemetry,
    refreshIntegrationsStatus,
    refreshOpenRouterCredentialStatus,
  ]);
  const floatingCompanion = (
    <FloatingCompanion
      locale={locale}
      context={companionContext}
      onIntent={handleCompanionIntent}
      onSubmitQuestion={handleCompanionQuestion}
    />
  );
  const paletteOverlay = paletteOpen ? (
    <>
      <button
        type="button"
        className="palette-backdrop"
        onClick={() => setPaletteOpen(false)}
        aria-label={locale === "de" ? "Command Palette schließen" : "Close command palette"}
      />
      <section className="command-palette" role="dialog" aria-label={locale === "de" ? "Command Palette" : "Command palette"}>
        <header className="command-palette-header">
          <strong>{locale === "de" ? "Command Palette" : "Command Palette"}</strong>
          <button type="button" className="ghost-button" onClick={() => setPaletteOpen(false)}>
            Esc
          </button>
        </header>
        <input
          type="search"
          value={paletteQuery}
          onChange={(event) => setPaletteQuery(event.target.value)}
          placeholder={locale === "de" ? "Tabs oder Sessions suchen…" : "Search tabs or sessions..."}
          autoFocus
        />
        <div className="command-palette-results" role="listbox">
          {filteredPaletteEntries.length === 0 ? (
            <p className="muted-copy">{locale === "de" ? "Keine Treffer." : "No results."}</p>
          ) : filteredPaletteEntries.slice(0, 24).map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="command-palette-item"
              onClick={entry.onSelect}
            >
              <span>{entry.label}</span>
              <small>{entry.detail}</small>
            </button>
          ))}
        </div>
      </section>
    </>
  ) : null;

  if (isMobileViewport) {
    return (
      <main className="app-shell app-shell-console app-shell-mobile" data-testid="app-shell">
        <TopContextBar
          brandIcon={<MosaicStackedIcon />}
          title="MosaicStacked"
          modelAlias={activeModelAlias ?? ui.common.na}
          healthTone={healthState.tone}
          locale={locale}
          brandAriaLabel={locale === "de" ? "Zur Chat-Ansicht wechseln. Lange drücken für Einstellungen." : "Switch to chat. Long press for settings."}
          modelAriaLabel={locale === "de" ? "Modelleinstellungen öffnen" : "Open model settings"}
          languageAriaLabel={ui.shell.languageLabel}
          languageOptionEnglish={ui.shell.languageOptionEnglish}
          languageOptionGerman={ui.shell.languageOptionGerman}
          onBrandClick={handleMobileBrandClick}
          onBrandPointerDown={handleMobileBrandPointerDown}
          onBrandPointerUp={clearMobileBrandLongPress}
          onBrandPointerCancel={clearMobileBrandLongPress}
          onBrandPointerLeave={clearMobileBrandLongPress}
          onModelPress={() => handleWorkspaceTabSelect("settings")}
          onLocaleChange={setLocale}
        />
        <section className="shell-truth-top shell-truth-top-mobile" aria-label={locale === "de" ? "Systemstatus" : "System status"}>
          <div className="shell-truth-top-left">
            <WorkspaceIcon mode={mode} />
            <span>{activeSession?.title ?? workspaceName}</span>
            <span className={`freshness-badge freshness-badge-${freshness}`} title={freshnessHint}>
              {freshnessLabel}
            </span>
          </div>
          <button
            type="button"
            className="shell-truth-review-pill"
            onClick={() => handleWorkspaceTabSelect("workbench")}
            aria-label={locale === "de" ? "Ausstehende Freigaben anzeigen" : "Show pending approvals"}
          >
            {`${approvalSummary.pending} pending`}
          </button>
        </section>

        <ContextStrip
          repoLabel={repoChipLabel.replace(/^⊟\s?|^⊡\s?/, "")}
          branchLabel={branchChipLabel}
          fileLabel={fileChipLabel}
          status={mobileContextStatus.label}
          ariaLabel={locale === "de" ? "Command-Kontext öffnen" : "Open command context"}
          onPress={handleMobileContextToggle}
        />

        <section className="mobile-workspace-surface">
          <ShellCard variant="base" className="workspace-frame-card mobile-workspace-frame">
            <div className="workspace-frame-body">
              <Suspense fallback={<p className="empty-state" role="status">{ui.shell.healthChecking}</p>}>
                {mobileWorkspaceSurface}
              </Suspense>
            </div>
          </ShellCard>
        </section>

        {mobileContextOpen ? (
          <>
            <button
              type="button"
              className="mobile-context-backdrop mobile-bottom-sheet-backdrop"
              aria-label={locale === "de" ? "Kontext schließen" : "Close context"}
              onClick={() => setMobileContextOpen(false)}
            />
            <section className="mobile-context-sheet mobile-bottom-sheet" aria-label={ui.shell.workspaceContextSuffix}>
              <span className="mobile-context-sheet-handle mobile-bottom-sheet-handle" aria-hidden="true" />
              <header className="mobile-context-sheet-header">
                <SectionLabel>{ui.shell.workspaceContextSuffix}</SectionLabel>
              </header>

              <div className="mobile-context-sheet-body">
                <div className="mobile-context-status-grid">
                  <div>
                    <span>{ui.shell.healthTitle}</span>
                    <strong>{healthState.label}</strong>
                  </div>
                  <div>
                    <span>{ui.review.nextStepLabel}</span>
                    <strong>{currentStatusBadge}</strong>
                  </div>
                  <div>
                    <span>{ui.shell.pendingApprovalsTitle}</span>
                    <strong>{String(approvalSummary.pending)}</strong>
                  </div>
                  <div>
                    <span>{ui.shell.modeLabel}</span>
                    <strong>{workspaceName}</strong>
                  </div>
                </div>

                {!hasRepoContext ? (
                  <p className="mobile-context-empty-note">
                    {locale === "de"
                      ? "Kein Kontext geladen. Öffne Workbench und wähle ein Repo oder eine Datei."
                      : "No context loaded yet. Open Workbench and choose a repository or file."}
                  </p>
                ) : null}

                <div className="mobile-context-actions">
                  <button type="button" className="secondary-button" onClick={() => handleMobileNavSelect("workbench")}>
                    {ui.shell.workspaceTabs.workbench.label}
                  </button>
                  <button type="button" className="secondary-button" onClick={() => handleMobileNavSelect("settings")}>
                    {ui.shell.workspaceTabs.settings.label}
                  </button>
                  {isSessionWorkspace(mode) ? (
                    <button type="button" className="secondary-button" onClick={() => handleWorkspaceSessionCreate(sessionWorkspace)}>
                      {appText.processCreateSession}
                    </button>
                  ) : null}
                </div>

                {showRouteOwnershipContext && routeOwnershipRows.length > 0 ? (
                  <RouteStatusLadder
                    title={mode === "workbench" ? "Workbench status ladder" : "Matrix status ladder"}
                    rows={routeOwnershipRows}
                  />
                ) : null}
              </div>
            </section>
          </>
        ) : null}

        <BottomNav
          ariaLabel={ui.shell.workspacesLabel}
          items={MOBILE_NAV_MODES.map((workspaceMode) => ({
            key: workspaceMode,
            label: workspaceTabLabels[workspaceMode],
            icon: <WorkspaceIcon mode={workspaceMode} />,
            active: activeMobileNav === workspaceMode,
            onPress: () => handleMobileNavSelect(workspaceMode),
            testId: `tab-${workspaceMode}`,
          }))}
        />
        {paletteOverlay}
        {floatingCompanion}
      </main>
    );
  }

  return (
    <main className="app-shell app-shell-console" data-testid="app-shell">
      <section className="shell-truth-top" aria-label={locale === "de" ? "Systemstatus" : "System status"}>
        <div className="shell-truth-top-left">
          <WorkspaceIcon mode={mode} />
          <span>{activeSession?.title ?? workspaceName}</span>
          <span className={`freshness-badge freshness-badge-${freshness}`} title={freshnessHint}>
            {freshnessLabel}
          </span>
        </div>
        <button
          type="button"
          className="shell-truth-review-pill"
          onClick={() => handleWorkspaceTabSelect("workbench")}
          aria-label={locale === "de" ? "Ausstehende Freigaben anzeigen" : "Show pending approvals"}
        >
          {`${approvalSummary.pending} pending`}
        </button>
        <div className="shell-truth-top-right">
          <span className={`shell-health-dot shell-health-dot-${healthState.tone}`} aria-hidden="true" />
          <span className="shell-truth-model">{activeModelAlias ?? ui.common.na}</span>
          <button
            type="button"
            className="secondary-button shell-expert-toggle"
            onClick={() => setWorkMode(expertMode ? "beginner" : "expert")}
          >
            {expertMode ? "Expert" : "Assist"}
          </button>
        </div>
      </section>
      <header className="global-header global-header-shell">
        <div className="brand-block">
          <span className="mosaicstacked-mark" aria-hidden="true">
            <MosaicStackedIcon />
          </span>
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
          {healthState.tone === "ready" ? null : (
            <StatusBadge tone={healthState.tone}>{ui.shell.backendPrefix} {healthState.label}</StatusBadge>
          )}
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
                  className={mode === workspaceMode
                    ? "workspace-tab workspace-tab-active workspace-tab-vertical workspace-tab-shell-active workspace-tab-icon-rail"
                    : "workspace-tab workspace-tab-vertical workspace-tab-icon-rail"}
                  onClick={() => handleWorkspaceTabSelect(workspaceMode)}
                  aria-label={workspaceTabLabels[workspaceMode]}
                  aria-current={mode === workspaceMode ? "page" : undefined}
                  data-testid={`tab-${workspaceMode}`}
                  title={workspaceTabLabels[workspaceMode]}
                >
                  <WorkspaceIcon mode={workspaceMode} />
                  <span className="sr-only">{workspaceTabLabels[workspaceMode]}</span>
                </button>
              ))}
            </nav>
          </ShellCard>

          <ShellCard variant="muted" className="shell-session-identity-card shell-controls-card">
            <div className="shell-control-row">
              <div>
                <SectionLabel>{locale === "de" ? "Arbeitsmodus" : "Work mode"}</SectionLabel>
                <BeginnerExpertToggle workMode={workMode} setWorkMode={setWorkMode} />
              </div>
              <StatusBadge tone={statusToneForBadge}>{getSessionStatusLabel(locale, activeSession?.status ?? "draft")}</StatusBadge>
            </div>
            {expertMode && activeSession?.id ? (
              <MutedSystemCopy className="shell-session-id">{ui.shell.sessionIdPrefix}: {activeSession.id}</MutedSystemCopy>
            ) : null}

          </ShellCard>

          <SessionList
            workspace={sessionWorkspace}
            sessions={sessionWorkspaceSessions}
            activeSessionId={sessionWorkspaceActiveId}
            onCreate={() => handleWorkspaceSessionCreate(sessionWorkspace)}
            onSelect={(sessionId) => handleWorkspaceSessionSelect(sessionWorkspace, sessionId)}
            onArchive={(sessionId) => handleWorkspaceSessionArchive(sessionWorkspace, sessionId)}
            onDelete={(sessionId) => handleWorkspaceSessionDelete(sessionWorkspace, sessionId)}
            headerNote={expertMode ? appText.sessionHeaderNote : undefined}
            showManagement={expertMode}
          />
        </aside>

        <section className="console-main shell-center-main">
          <ShellCard variant="base" className="workspace-frame-card">
            <div className="workspace-frame-body">
              <Suspense fallback={<p className="empty-state" role="status">{ui.shell.healthChecking}</p>}>
                {workspaceSurface}
              </Suspense>
            </div>
          </ShellCard>
        </section>

        <aside className="workspace-context truth-rail">
          <TruthRailSection
            title={ui.shell.healthTitle}
            testId="truth-rail-health"
            badge={<StatusBadge tone={healthState.tone}>{healthState.label}</StatusBadge>}
          >
            <MutedSystemCopy>{workModeCopy.riskHint}</MutedSystemCopy>
            {expertMode || healthState.tone !== "ready" ? (
              <MutedSystemCopy>{healthState.detail}</MutedSystemCopy>
            ) : null}
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

          {routeOwnershipRows.length > 0 ? (
            <TruthRailSection
              title={mode === "workbench" ? "Workbench route ownership" : "Matrix route ownership"}
              testId="truth-rail-route-ownership"
              badge={<StatusBadge tone="muted">backend-owned</StatusBadge>}
            >
              <MutedSystemCopy>
                GitHub and Matrix are not browser integrations. The console sends governed intent; backend owns credentials, execution, verification, and sanitized errors.
              </MutedSystemCopy>
              <RouteStatusLadder
                title={mode === "workbench" ? "Workbench status ladder" : "Matrix status ladder"}
                rows={routeOwnershipRows}
              />
            </TruthRailSection>
          ) : null}

          {approvalSummary.hasApprovals || expertMode ? (
            <TruthRailSection
              title={ui.shell.pendingApprovalsTitle}
              testId="truth-rail-approvals"
              badge={<StatusBadge tone={approvalSummary.stale > 0 ? "error" : approvalSummary.pending > 0 ? "partial" : "muted"}>{approvalSummary.pending}</StatusBadge>}
            >
              <p className="truth-rail-keyline">
                {ui.shell.pendingApprovalsSummary(approvalSummary.pending, approvalSummary.stale)}
              </p>
              {approvalSummary.hasApprovals ? (
                <MutedSystemCopy>
                  {approvalSummary.chatPending > 0 ? ui.shell.pendingApprovalsChat : ui.shell.pendingApprovalsSeparate}
                </MutedSystemCopy>
              ) : null}
            </TruthRailSection>
          ) : null}

          <TruthRailSection
            title={nextStepTitle}
            testId="truth-rail-next-step"
            badge={<StatusBadge tone={statusToneForBadge}>{currentStatusBadge}</StatusBadge>}
          >
            <div className="truth-rail-pairs">
              {currentRows.slice(0, expertMode ? 2 : 1).map((row) => (
                <div key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
              ))}
            </div>
            <MutedSystemCopy>{currentHelperText}</MutedSystemCopy>
            <div className="truth-rail-actions">
              {approvalSummary.hasApprovals && mode !== "workbench" ? (
                <button type="button" className="secondary-button" onClick={() => handleWorkspaceTabSelect("workbench")}>
                  {appText.processGoReview}
                </button>
              ) : isSessionWorkspace(mode) ? (
                <button type="button" className="secondary-button" onClick={() => handleWorkspaceSessionCreate(sessionWorkspace)}>
                  {appText.processCreateSession}
                </button>
              ) : null}
            </div>
          </TruthRailSection>

        </aside>
      </section>
      {paletteOverlay}
      {floatingCompanion}
    </main>
  );
}
