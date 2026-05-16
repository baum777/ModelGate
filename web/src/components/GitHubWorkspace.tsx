import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ExpertDetails } from "./ExpertDetails.js";
import {
  executeGitHubPlan,
  fetchGitHubContext,
  fetchGitHubRepos,
  proposeGitHubAction,
  verifyGitHubPlan,
  type GitHubChangePlan,
  type GitHubCapabilitiesResponse,
  type GitHubContextBundle,
  type GitHubExecuteResult,
  type GitHubRepoSummary,
  type GitHubVerifyResult,
} from "../lib/github-api.js";
import type { IntegrationStatus } from "../lib/api.js";
import { createPinnedChatContext, type PinnedChatContext } from "../lib/pinned-chat-context.js";
import type { ReviewItem } from "./ReviewWorkspace.js";
import {
  deriveSessionStatus,
  deriveSessionTitle,
  type GitHubSession
} from "../lib/workspace-state.js";
import {
  BACKEND_TRUTH_UNAVAILABLE,
  buildGovernanceMetadataRows,
  mergeMetadataRows,
} from "../lib/governance-metadata.js";
import { useLocalization, type Locale } from "../lib/localization.js";
import { isExpertMode, type WorkMode } from "../lib/work-mode.js";
import { toButtonGate } from "../lib/button-gate.js";
import { ActivityRow } from "./mobile/github/ActivityRow.js";
import { DiffSheet, type DiffSheetFile } from "./mobile/github/DiffSheet.js";

export type GitHubWorkspaceStatus = {
  repositoryLabel: string;
  connectionLabel: string;
  accessLabel: string;
  analysisLabel: string;
  proposalLabel: string;
  approvalLabel: string;
  resultLabel: string;
  safetyText: string;
  expertDetails: {
    requestId: string | null;
    planId: string | null;
    branchName: string | null;
    apiStatus: string;
    sseEvents: string[];
    rawDiffPreview: string | null;
    selectedRepoSlug: string | null;
  };
};

type GitHubWorkspaceProps = {
  session: GitHubSession;
  backendHealthy: boolean | null;
  workMode: WorkMode;
  onTelemetry: (
    kind: "info" | "warning" | "error",
    label: string,
    detail?: string,
  ) => void;
  onContextChange: (status: GitHubWorkspaceStatus) => void;
  onReviewItemsChange?: (items: ReviewItem[]) => void;
  onReviewDirtyChange?: (isDirty: boolean) => void;
  onPinChatContext?: (context: PinnedChatContext) => void;
  onSessionChange: (session: GitHubSession) => void;
  githubIntegration: IntegrationStatus | null;
  githubCapabilities: GitHubCapabilitiesResponse | null;
  onIntegrationAction: (
    provider: "github" | "matrix",
    action: "connect" | "reconnect" | "disconnect" | "reverify"
  ) => void;
};

export type WorkbenchActionEffectType =
  | "local_review_state"
  | "backend_prepare"
  | "backend_execute_pr";

export type WorkbenchActionEffect = WorkbenchActionEffectType;

export type WorkbenchActionState =
  | "unmarked"
  | "marked"
  | "removed"
  | "pr_prepared"
  | "pr_ready";

export type WorkbenchActionId =
  | "mark_for_stage"
  | "remove_from_review"
  | "open_diff"
  | "prepare_pr"
  | "create_pr"
  | "copy_summary";

const ANALYSIS_QUESTION =
  "Beschreibe die Projektstruktur und nenne die sichere nächste Aktion.";
const PROPOSAL_OBJECTIVE =
  "Erstelle einen sicheren Änderungsvorschlag für das gewählte Repo.";
const DEFAULT_ANALYSIS_QUESTION = ANALYSIS_QUESTION;
const DEFAULT_PROPOSAL_OBJECTIVE = PROPOSAL_OBJECTIVE;
const GITHUB_SESSION_SYNC_INTERVAL_MS = 220;

type GitHubLocaleText = {
  repoLoadFailed: string;
  riskLabel: string;
  branchLabel: string;
  commitLabel: string;
  pullRequestLabel: string;
  pullRequestUrlLabel: string;
  reviewSourceLabel: string;
  reviewReceiptPending: string;
  reviewReceiptExecutionPending: string;
  reviewReceiptVerification: (status: string) => string;
  authorityDomain: string;
  executionDomain: string;
  planSummary: (planId: string) => string;
  verificationPending: string;
  proposalConstraintReadOnly: string;
  proposalConstraintNoDirectExecution: string;
  telemetryRepoChanged: string;
  telemetryAnalysisStarted: string;
  telemetryAnalysisStartedDetail: (repoFullName: string) => string;
  telemetryAnalysisReady: string;
  telemetryAnalysisReadyDetail: (fileCount: number) => string;
  telemetryAnalysisFailed: string;
  telemetryProposalRequested: string;
  telemetryProposalRequestedDetail: (repoFullName: string) => string;
  telemetryProposalReady: string;
  telemetryProposalReadyDetail: (planId: string) => string;
  telemetryProposalFailed: string;
  telemetryApprovalSubmitted: string;
  telemetryApprovalSubmittedDetail: string;
  telemetryExecutionReady: string;
  telemetryExecutionReadyDetail: (prNumber: number) => string;
  telemetryExecutionFailed: string;
  telemetryVerificationReady: string;
  telemetryVerificationReadyDetail: (status: string) => string;
  telemetryVerificationFailed: string;
  telemetryProposalRejected: string;
  telemetryProposalRejectedDetail: string;
  eventPullRequestCreated: (prNumber: number) => string;
  eventPullRequestVerified: (status: string) => string;
  verifyFallbackError: string;
};

function getGitHubLocaleText(locale: Locale): GitHubLocaleText {
  if (locale === "de") {
    return {
      repoLoadFailed: "GitHub-Repos konnten nicht geladen werden.",
      riskLabel: "Risiko",
      branchLabel: "Branch",
      commitLabel: "Commit",
      pullRequestLabel: "Pull Request",
      pullRequestUrlLabel: "Pull-Request-URL",
      reviewSourceLabel: "GitHub-Workspace",
      reviewReceiptPending: "Vorschlag wartet auf Freigabe",
      reviewReceiptExecutionPending: "Ausführung protokolliert, Prüfung ausstehend",
      reviewReceiptVerification: (status) => `Prüfung ${status}`,
      authorityDomain: "GitHub-Backend-Aktionsrouten",
      executionDomain: "GitHub-Pull-Request-Workflow",
      planSummary: (planId) => `Plan ${planId}`,
      verificationPending: "Prüfung ausstehend",
      proposalConstraintReadOnly: "Nur lesend vorbereiten",
      proposalConstraintNoDirectExecution: "Keine direkte Ausführung",
      telemetryRepoChanged: "GitHub-Repo gewechselt",
      telemetryAnalysisStarted: "GitHub-Analyse gestartet",
      telemetryAnalysisStartedDetail: (repoFullName) => `Repo ${repoFullName} wird lesend untersucht.`,
      telemetryAnalysisReady: "GitHub-Analyse bereit",
      telemetryAnalysisReadyDetail: (fileCount) => `${fileCount} Datei(en) wurden gelesen.`,
      telemetryAnalysisFailed: "GitHub-Analyse fehlgeschlagen",
      telemetryProposalRequested: "GitHub-Vorschlag angefordert",
      telemetryProposalRequestedDetail: (repoFullName) => `Vorschlag für ${repoFullName} wird vorbereitet.`,
      telemetryProposalReady: "GitHub-Vorschlag bereit",
      telemetryProposalReadyDetail: (planId) => `Plan ${planId} wurde im Backend vorbereitet.`,
      telemetryProposalFailed: "GitHub-Vorschlag fehlgeschlagen",
      telemetryApprovalSubmitted: "GitHub-Freigabe gesendet",
      telemetryApprovalSubmittedDetail: "Freigabe wurde an das Backend gesendet.",
      telemetryExecutionReady: "GitHub-Ausführung bereit",
      telemetryExecutionReadyDetail: (prNumber) => `Pull Request ${prNumber} wurde erstellt.`,
      telemetryExecutionFailed: "GitHub-Ausführung fehlgeschlagen",
      telemetryVerificationReady: "GitHub-Prüfung bereit",
      telemetryVerificationReadyDetail: (status) => `Pull Request wurde mit Status ${status} geprüft.`,
      telemetryVerificationFailed: "GitHub-Prüfung fehlgeschlagen",
      telemetryProposalRejected: "GitHub-Vorschlag abgelehnt",
      telemetryProposalRejectedDetail: "Die lokale Freigabeabsicht wurde verworfen.",
      eventPullRequestCreated: (prNumber) => `Pull Request erstellt · ${prNumber}`,
      eventPullRequestVerified: (status) => `PR geprüft · ${status}`,
      verifyFallbackError: "Die GitHub-Prüfung konnte nicht abgeschlossen werden.",
    };
  }

  return {
    repoLoadFailed: "GitHub repositories could not be loaded.",
    riskLabel: "Risk",
    branchLabel: "Branch",
    commitLabel: "Commit",
    pullRequestLabel: "Pull request",
    pullRequestUrlLabel: "Pull request URL",
    reviewSourceLabel: "GitHub workspace",
    reviewReceiptPending: "Proposal pending approval",
    reviewReceiptExecutionPending: "Execution recorded, verification pending",
    reviewReceiptVerification: (status) => `verification ${status}`,
    authorityDomain: "GitHub backend action routes",
    executionDomain: "GitHub pull request workflow",
    planSummary: (planId) => `plan ${planId}`,
    verificationPending: "verification pending",
    proposalConstraintReadOnly: "Prepare in read-only mode",
    proposalConstraintNoDirectExecution: "No direct execution",
    telemetryRepoChanged: "GitHub repository changed",
    telemetryAnalysisStarted: "GitHub analysis started",
    telemetryAnalysisStartedDetail: (repoFullName) => `Inspecting repository ${repoFullName} in read-only mode.`,
    telemetryAnalysisReady: "GitHub analysis ready",
    telemetryAnalysisReadyDetail: (fileCount) => `${fileCount} file(s) were read.`,
    telemetryAnalysisFailed: "GitHub analysis failed",
    telemetryProposalRequested: "GitHub proposal requested",
    telemetryProposalRequestedDetail: (repoFullName) => `Preparing proposal for ${repoFullName}.`,
    telemetryProposalReady: "GitHub proposal ready",
    telemetryProposalReadyDetail: (planId) => `Plan ${planId} was prepared in the backend.`,
    telemetryProposalFailed: "GitHub proposal failed",
    telemetryApprovalSubmitted: "GitHub approval submitted",
    telemetryApprovalSubmittedDetail: "Approval was sent to the backend.",
    telemetryExecutionReady: "GitHub execution ready",
    telemetryExecutionReadyDetail: (prNumber) => `Pull request ${prNumber} was created.`,
    telemetryExecutionFailed: "GitHub execution failed",
    telemetryVerificationReady: "GitHub verification ready",
    telemetryVerificationReadyDetail: (status) => `Pull request was checked with status ${status}.`,
    telemetryVerificationFailed: "GitHub verification failed",
    telemetryProposalRejected: "GitHub proposal rejected",
    telemetryProposalRejectedDetail: "The local approval intent was discarded.",
    eventPullRequestCreated: (prNumber) => `Pull request created · ${prNumber}`,
    eventPullRequestVerified: (status) => `PR checked · ${status}`,
    verifyFallbackError: "GitHub verification could not be completed.",
  };
}

function createId() {
  return crypto.randomUUID();
}

function formatRepoStatus(status: GitHubRepoSummary["status"], locale: Locale) {
  switch (status) {
    case "ready":
      return locale === "de" ? "Bereit" : "Ready";
    case "blocked":
      return locale === "de" ? "Gesperrt" : "Blocked";
    default:
      return locale === "de" ? "Nicht verbunden" : "Not connected";
  }
}

function formatRepoVisibility(isPrivate: boolean, locale: Locale) {
  return isPrivate
    ? locale === "de" ? "Privat" : "Private"
    : locale === "de" ? "Öffentlich" : "Public";
}

function friendlyRepoLabel(index: number, expertMode: boolean, fullName: string, locale: Locale) {
  return expertMode ? fullName : locale === "de" ? `Repository ${index + 1}` : `Repository ${index + 1}`;
}

export function describeRepositoryAccess(repo: GitHubRepoSummary | null, locale: Locale = "de") {
  if (!repo) {
    return locale === "de" ? "Kein Repo ausgewählt" : "No repository selected";
  }

  return repo.permissions.canWrite
    ? locale === "de" ? "Schreibzugriff" : "Write access"
    : locale === "de" ? "Nur Lesen" : "Read only";
}

function formatGitHubRiskLevel(riskLevel: GitHubChangePlan["riskLevel"]) {
  switch (riskLevel) {
    case "low_surface":
      return "low surface";
    case "medium_surface":
      return "medium surface";
    case "high_surface":
      return "high surface";
    default:
      return riskLevel;
  }
}

function formatWorkbenchActionState(state: WorkbenchActionState, locale: Locale) {
  if (locale === "de") {
    switch (state) {
      case "marked":
        return "vorgemerkt";
      case "removed":
        return "entfernt";
      case "pr_prepared":
        return "PR vorbereitet";
      case "pr_ready":
        return "PR bereit";
      default:
        return "nicht vorgemerkt";
    }
  }

  switch (state) {
    case "unmarked":
      return "unmarked";
    case "marked":
      return "marked";
    case "removed":
      return "removed";
    case "pr_prepared":
      return "PR prepared";
    case "pr_ready":
      return "PR-ready";
    default:
      return state;
  }
}

export function deriveWorkbenchActionLabel(options: {
  effectType: WorkbenchActionEffectType;
  actionState: WorkbenchActionState;
  action: WorkbenchActionId;
  backendCapability: boolean;
  locale: Locale;
}) {
  const de = options.locale === "de";

  if (
    options.action === "create_pr"
    && (options.effectType !== "backend_execute_pr" || !options.backendCapability || options.actionState !== "pr_prepared")
  ) {
    return de ? "PR vorbereiten" : "Prepare PR";
  }

  switch (options.action) {
    case "mark_for_stage":
      return de ? "Zur Übergabe vormerken" : "Mark for stage";
    case "remove_from_review":
      return de ? "Aus Review entfernen" : "Remove from review";
    case "open_diff":
      return de ? "Diff öffnen ↗" : "Open diff ↗";
    case "prepare_pr":
      return de ? "PR vorbereiten" : "Prepare PR";
    case "create_pr":
      return de ? "PR erstellen" : "Create PR";
    case "copy_summary":
      return de ? "Zusammenfassung kopieren" : "Copy summary";
    default:
      return de ? "Aktion" : "Action";
  }
}

function buildRawDiffPreview(plan: GitHubChangePlan | null) {
  if (!plan) {
    return null;
  }

  return plan.diff
    .map((file) => [
      `--- ${file.path}`,
      `+++ ${file.path}`,
      file.patch,
    ].join("\n"))
    .join("\n\n")
    .slice(0, 1600);
}

function getExecuteBlockReasonLabel(
  reason: GitHubCapabilitiesResponse["executeBlockReason"] | "backend_unavailable" | "no_repo_write_permission" | "stale_plan" | null,
  locale: Locale,
) {
  if (!reason) {
    return null;
  }

  if (reason === "missing_admin_key") {
    return locale === "de"
      ? "Ausführung gesperrt: Admin-Key fehlt."
      : "Execution blocked: admin key missing.";
  }

  if (reason === "invalid_admin_key") {
    return locale === "de"
      ? "Ausführung gesperrt: Admin-Key ungültig."
      : "Execution blocked: admin key invalid.";
  }

  if (reason === "backend_unavailable") {
    return locale === "de"
      ? "Ausführung gesperrt: Backend nicht verfügbar."
      : "Execution blocked: backend unavailable.";
  }

  if (reason === "no_repo_write_permission") {
    return locale === "de"
      ? "Ausführung gesperrt: Kein Schreibzugriff auf das Repo."
      : "Execution blocked: repository write access missing.";
  }

  if (reason === "stale_plan") {
    return locale === "de"
      ? "Ausführung gesperrt: Proposal ist stale."
      : "Execution blocked: proposal is stale.";
  }

  return locale === "de"
    ? "Ausführung gesperrt: GitHub-Backend nicht konfiguriert."
    : "Execution blocked: GitHub backend not configured.";
}

export function buildGitHubPinnedChatContext(options: {
  selectedRepo: GitHubRepoSummary | null;
  analysisBundle: GitHubContextBundle | null;
  proposalPlan: GitHubChangePlan | null;
}): PinnedChatContext | null {
  if (!options.selectedRepo || !options.analysisBundle) {
    return null;
  }

  const summary = options.proposalPlan?.summary ?? options.analysisBundle.question;
  const firstAnalysisFile = options.analysisBundle.files[0] ?? null;
  const firstDiffFile = options.proposalPlan?.diff[0] ?? null;
  const excerpt = firstAnalysisFile?.excerpt ?? firstDiffFile?.patch ?? "";

  return createPinnedChatContext({
    repoFullName: options.selectedRepo.fullName,
    ref: options.proposalPlan?.baseRef ?? options.analysisBundle.ref ?? options.selectedRepo.defaultBranch,
    path: firstAnalysisFile?.path ?? firstDiffFile?.path ?? null,
    summary,
    excerpt,
    diffPreview: buildRawDiffPreview(options.proposalPlan),
  });
}

export function isGitHubReviewDirty(options: {
  proposalPlan: GitHubChangePlan | null;
  executionResult: GitHubExecuteResult | null;
  approvalChecked: boolean;
  executionError: string | null;
}) {
  return Boolean(
    (options.proposalPlan && !options.executionResult)
    || options.approvalChecked
    || (options.proposalPlan && options.executionError),
  );
}

function verificationStatusCopy(result: GitHubVerifyResult | null, locale: Locale) {
  switch (result?.status) {
    case "verified":
      return {
        label: locale === "de" ? "Geprüft" : "Verified",
        tone: "ready" as const,
        detail: locale === "de" ? "Der Pull Request wurde bestätigt." : "The pull request was verified.",
      };
    case "pending":
      return {
        label: locale === "de" ? "Prüfung läuft oder ist noch nicht eindeutig" : "Verification is still pending",
        tone: "partial" as const,
        detail: locale === "de" ? "Die Backend-Prüfung ist noch nicht abgeschlossen." : "Backend verification is not complete yet.",
      };
    case "mismatch":
      return {
        label: locale === "de" ? "Abweichung gefunden" : "Mismatch detected",
        tone: "error" as const,
        detail: locale === "de" ? "Die Prüfung passt nicht zum freigegebenen Vorschlag." : "Verification does not match the approved proposal.",
      };
    case "failed":
      return {
        label: locale === "de" ? "Prüfung fehlgeschlagen" : "Verification failed",
        tone: "error" as const,
        detail: locale === "de" ? "Die Backend-Prüfung konnte nicht abgeschlossen werden." : "Backend verification could not be completed.",
      };
    default:
      return {
        label: locale === "de" ? "Bereit zur Prüfung auf GitHub" : "Ready for verification on GitHub",
        tone: "partial" as const,
        detail: locale === "de" ? "Der Pull Request wurde erstellt." : "The pull request has been created.",
      };
  }
}

function resultStatusCopy(
  executionResult: GitHubExecuteResult | null,
  verificationResult: GitHubVerifyResult | null,
  verifying: boolean,
  locale: Locale,
) {
  if (!executionResult) {
    return {
      label: locale === "de" ? "Noch nicht gestartet" : "Not started yet",
      tone: "partial" as const,
      detail: locale === "de" ? "Noch kein Pull Request erstellt." : "No pull request created yet.",
    };
  }

  if (!verificationResult) {
    return verifying
      ? {
          label: locale === "de" ? "Prüfung läuft oder ist noch nicht eindeutig" : "Verification is still pending",
          tone: "partial" as const,
          detail: locale === "de" ? "Der Pull Request wird jetzt geprüft." : "The pull request is being verified.",
        }
      : {
          label: locale === "de" ? "Bereit zur Prüfung auf GitHub" : "Ready for verification on GitHub",
          tone: "partial" as const,
          detail: locale === "de" ? "Der Pull Request wurde erstellt." : "The pull request has been created.",
        };
  }

  const copy = verificationStatusCopy(verificationResult, locale);

  return {
    label: copy.label,
    tone: copy.tone,
    detail: copy.detail,
  };
}

function formatActivityAge(timestamp: string | null | undefined, locale: Locale) {
  if (!timestamp) {
    return locale === "de" ? "lokal" : "local";
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function summarizeDiff(files: DiffSheetFile[]) {
  return files.reduce(
    (summary, file) => ({
      additions: summary.additions + file.additions,
      deletions: summary.deletions + file.deletions,
    }),
    { additions: 0, deletions: 0 },
  );
}

export function buildGitHubReviewItems(
  proposalPlan: GitHubChangePlan | null,
  executionResult: GitHubExecuteResult | null,
  verificationResult: GitHubVerifyResult | null,
  locale: Locale = "de",
): ReviewItem[] {
  const localText = getGitHubLocaleText(locale);

  if (!proposalPlan) {
    return [];
  }

  const status = proposalPlan.stale
    ? "stale"
    : verificationResult?.status === "verified"
      ? "executed"
      : verificationResult?.status === "failed"
        ? "failed"
        : verificationResult?.status === "mismatch"
          ? "rejected"
        : executionResult
          ? "approved"
          : "pending_review";
  const receiptSummary = verificationResult
    ? localText.reviewReceiptVerification(verificationResult.status)
    : executionResult
      ? localText.reviewReceiptExecutionPending
      : localText.reviewReceiptPending;

  return [
    {
      id: proposalPlan.planId,
      source: "github",
      title: proposalPlan.summary,
      summary: `${proposalPlan.rationale} · ${receiptSummary}`,
      status,
      stale: proposalPlan.stale,
      sourceLabel: localText.reviewSourceLabel,
      provenanceRows: mergeMetadataRows(
        buildGovernanceMetadataRows({
          actingIdentity: BACKEND_TRUTH_UNAVAILABLE,
          activeScope: `${proposalPlan.repo.fullName}@${proposalPlan.baseRef}`,
          authorityDomain: localText.authorityDomain,
          targetScope: `${proposalPlan.repo.fullName}@${proposalPlan.targetBranch}`,
          executionDomain: localText.executionDomain,
          executionTarget: executionResult
            ? `PR #${executionResult.prNumber}`
            : `${proposalPlan.branchName} -> ${proposalPlan.targetBranch}`,
          provenanceSummary: localText.planSummary(proposalPlan.planId),
          receiptSummary
        }),
        [{ label: localText.riskLabel, value: formatGitHubRiskLevel(proposalPlan.riskLevel) }]
      ),
    },
  ];
}

function GateButton({
  className,
  disabled,
  blockedReason,
  onClick,
  children,
  testId,
  effectType,
  backendCapability,
  executeBlockReason,
}: {
  className?: string;
  disabled: boolean;
  blockedReason?: string | null;
  onClick: () => void;
  children: ReactNode;
  testId?: string;
  effectType?: string;
  backendCapability?: string;
  executeBlockReason?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      title={disabled && blockedReason ? blockedReason : undefined}
      data-testid={testId}
      data-effect-type={effectType}
      data-backend-capability={backendCapability}
      data-execute-block-reason={executeBlockReason}
    >
      {children}
    </button>
  );
}

export function GitHubWorkspace(props: GitHubWorkspaceProps) {
  const { locale, copy: ui } = useLocalization();
  const localText = useMemo(() => getGitHubLocaleText(locale), [locale]);
  const expertMode = isExpertMode(props.workMode);
  const [repos, setRepos] = useState<GitHubRepoSummary[]>([]);
  const [reposLoading, setReposLoading] = useState(true);
  const [reposError, setReposError] = useState<string | null>(null);
  const [selectedRepoFullName, setSelectedRepoFullName] = useState(
    props.session.metadata.selectedRepoFullName,
  );
  const [pendingDraft, setPendingDraft] = useState(props.session.metadata.pendingDraft);
  const [analysisQuestion, setAnalysisQuestion] = useState(DEFAULT_ANALYSIS_QUESTION);
  const [proposalObjective, setProposalObjective] = useState(DEFAULT_PROPOSAL_OBJECTIVE);
  const [analysisBundle, setAnalysisBundle] = useState<GitHubContextBundle | null>(
    props.session.metadata.analysisBundle,
  );
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [proposalPlan, setProposalPlan] = useState<GitHubChangePlan | null>(
    props.session.metadata.proposalPlan,
  );
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(props.session.metadata.requestId);
  const [eventTrail, setEventTrail] = useState<string[]>(props.session.metadata.eventTrail);
  const [diffSheetOpen, setDiffSheetOpen] = useState(false);
  const [approvalChecked, setApprovalChecked] = useState(props.session.metadata.approvalChecked);
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<GitHubExecuteResult | null>(
    props.session.metadata.executionResult,
  );
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<GitHubVerifyResult | null>(
    props.session.metadata.verificationResult,
  );
  const [executionError, setExecutionError] = useState<string | null>(
    props.session.metadata.executionError,
  );
  const [verificationError, setVerificationError] = useState<string | null>(
    props.session.metadata.verificationError,
  );
  const [workbenchActionState, setWorkbenchActionState] = useState<WorkbenchActionState>(() =>
    props.session.metadata.executionResult ? "pr_ready" : "unmarked",
  );
  const [rawDiffExpanded, setRawDiffExpanded] = useState(false);
  const repoSelectRef = useRef<HTMLSelectElement | null>(null);
  const sessionSyncHandleRef = useRef<number | null>(null);
  const latestSessionRef = useRef<GitHubSession | null>(null);
  const flushSessionSync = useCallback(() => {
    if (sessionSyncHandleRef.current !== null) {
      globalThis.clearTimeout(sessionSyncHandleRef.current);
      sessionSyncHandleRef.current = null;
    }

    if (latestSessionRef.current) {
      props.onSessionChange(latestSessionRef.current);
    }
  }, [props.onSessionChange]);
  const githubConnected = props.githubIntegration?.credentialSource === "user_connected";
  const githubConnectAction = props.githubIntegration?.status && props.githubIntegration.status !== "connect_available" && props.githubIntegration.status !== "not_connected"
    ? "reconnect"
    : "connect";
  const githubConnectLabel = locale === "de" ? "GitHub verbinden" : "Connect your GitHub";

  useEffect(() => {
    const snapshotMetadata = {
      ...props.session.metadata,
      selectedRepoFullName,
      pendingDraft,
      analysisBundle,
      proposalPlan,
      requestId,
      eventTrail,
      approvalChecked,
      executionResult,
      verificationResult,
      executionError,
      verificationError,
    };

    const nextSession: GitHubSession = {
      ...props.session,
      title: deriveSessionTitle({
        ...props.session,
        metadata: snapshotMetadata,
      }),
      updatedAt: new Date().toISOString(),
      status: deriveSessionStatus({
        ...props.session,
        metadata: snapshotMetadata,
      }),
      resumable: true,
      metadata: snapshotMetadata,
    };

    latestSessionRef.current = nextSession;

    if (sessionSyncHandleRef.current !== null) {
      return;
    }

    sessionSyncHandleRef.current = globalThis.setTimeout(() => {
      sessionSyncHandleRef.current = null;
      if (latestSessionRef.current) {
        props.onSessionChange(latestSessionRef.current);
      }
    }, GITHUB_SESSION_SYNC_INTERVAL_MS);
  }, [
    analysisBundle,
    approvalChecked,
    eventTrail,
    executionError,
    executionResult,
    proposalPlan,
    props.onSessionChange,
    props.session.id,
    pendingDraft,
    requestId,
    selectedRepoFullName,
    verificationError,
    verificationResult,
  ]);

  useEffect(() => () => {
    flushSessionSync();
  }, [flushSessionSync]);

  useEffect(() => {
    const incomingDraft = props.session.metadata.pendingDraft;

    if (!incomingDraft) {
      return;
    }

    setPendingDraft((current) => (current?.id === incomingDraft.id ? current : incomingDraft));
  }, [props.session.metadata.pendingDraft?.id]);

  useEffect(() => {
    let cancelled = false;

    async function loadRepos() {
      setReposLoading(true);
      setReposError(null);

      try {
        const response = await fetchGitHubRepos();

        if (cancelled) {
          return;
        }

        setRepos(response.repos);
        if (response.repos.length === 1) {
          setSelectedRepoFullName(response.repos[0]?.fullName ?? "");
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        setReposError(error instanceof Error ? error.message : localText.repoLoadFailed);
      } finally {
        if (!cancelled) {
          setReposLoading(false);
        }
      }
    }

    void loadRepos();

    return () => {
      cancelled = true;
    };
  }, [localText.repoLoadFailed]);

  useEffect(() => {
    if (!pendingDraft) {
      return;
    }

    if (pendingDraft.repo.trim().length > 0) {
      setSelectedRepoFullName(pendingDraft.repo.trim());
    }

    const draftText = pendingDraft.content.trim();

    if (pendingDraft.intent === "proposal") {
      setProposalObjective(draftText || DEFAULT_PROPOSAL_OBJECTIVE);
    } else {
      setAnalysisQuestion(draftText || DEFAULT_ANALYSIS_QUESTION);
    }

    setEventTrail((current) => [
      ...current,
      locale === "de"
        ? `Chat-Draft übernommen · ${pendingDraft.intent}`
        : `Chat draft adopted · ${pendingDraft.intent}`,
    ].slice(-4));

    props.onTelemetry(
      "info",
      locale === "de" ? "Chat-Draft übernommen" : "Chat draft adopted",
      pendingDraft.sourceMessageId ?? pendingDraft.intent,
    );
    setPendingDraft(null);
  }, [locale, pendingDraft, props.onTelemetry]);

  const selectedRepo = useMemo(
    () => repos.find((repo) => repo.fullName === selectedRepoFullName) ?? null,
    [repos, selectedRepoFullName],
  );

  const connectionLabel = props.backendHealthy === true
    ? ui.shell.statusReady
    : props.backendHealthy === false
      ? ui.shell.statusError
      : ui.shell.healthChecking;
  const accessLabel = describeRepositoryAccess(selectedRepo, locale);
  const analysisLabel = proposalPlan
    ? ui.github.nextStepProposal
    : analysisBundle
      ? ui.shell.statusReady
      : ui.github.nextStepAnalysis;
  const proposalLabel = proposalPlan
    ? executionResult
      ? verificationResult?.status === "verified"
        ? ui.matrix.topicStatusVerified
        : ui.review.executing
      : proposalPlan.stale
        ? ui.review.warning
        : ui.github.reviewTitle
    : analysisBundle
      ? ui.shell.statusReady
      : ui.github.proposalEmpty;
  const mobileNextStepLabel = !selectedRepo
    ? ui.github.nextStepChooseRepo
    : !analysisBundle
      ? ui.github.nextStepAnalysis
      : !proposalPlan
        ? ui.github.nextStepProposal
        : (locale === "de" ? "Diff prüfen" : "Review diff");
  const approvalLabel = proposalPlan
    ? proposalPlan.stale
      ? ui.review.warning
      : verificationResult?.status === "verified"
        ? ui.matrix.topicStatusVerified
        : verificationResult?.status === "failed" || verificationResult?.status === "mismatch"
          ? ui.matrix.topicStatusMismatch
          : executionResult
            ? ui.matrix.topicStatusOpen
            : ui.review.approvalNeeded
    : analysisBundle
      ? ui.github.readOnly
      : ui.common.none;
  const resultCopy = resultStatusCopy(executionResult, verificationResult, verifying, locale);
  const selectedRepoLabel = selectedRepo
    ? expertMode
      ? selectedRepo.fullName
      : ui.github.repoSelected
    : ui.github.noRepoSelected;
  const rawDiffPreview = useMemo(
    () => expertMode ? buildRawDiffPreview(proposalPlan) : null,
    [expertMode, proposalPlan],
  );
  const currentRequestId = requestId;
  const stalePlanBlocked = Boolean(
    proposalPlan?.stale
      || executionError?.toLowerCase().includes("stale")
      || verificationError?.toLowerCase().includes("stale"),
  );
  const executionConsumed = Boolean(executionResult);
  const serverCanExecute = props.githubCapabilities?.canExecute === true;
  const backendCapabilities = {
    preparePr: Boolean(proposalPlan && selectedRepo && props.backendHealthy !== false),
    executePr: Boolean(
      proposalPlan
      && selectedRepo?.permissions.canWrite
      && props.backendHealthy === true
      && !proposalPlan.stale
      && serverCanExecute
    ),
  };
  const executeBlockReason = backendCapabilities.executePr
    ? null
    : !proposalPlan
      ? null
      : props.backendHealthy !== true
        ? "backend_unavailable"
        : !selectedRepo?.permissions.canWrite
          ? "no_repo_write_permission"
          : proposalPlan.stale
            ? "stale_plan"
            : props.githubCapabilities?.executeBlockReason ?? "github_not_configured";
  const executeBlockReasonLabel = getExecuteBlockReasonLabel(executeBlockReason, locale);
  const markForStageDisabled =
    !proposalPlan
    || executing
    || verifying
    || stalePlanBlocked
    || executionConsumed
    || proposalLoading
    || workbenchActionState === "marked"
    || workbenchActionState === "pr_prepared"
    || workbenchActionState === "pr_ready";
  const removeFromReviewDisabled =
    !proposalPlan
    || executing
    || verifying
    || workbenchActionState === "removed";
  const preparePrDisabled =
    !proposalPlan
    || !backendCapabilities.preparePr
    || executing
    || verifying
    || stalePlanBlocked
    || executionConsumed
    || workbenchActionState !== "marked";
  const executeDisabled =
    !proposalPlan
    || !backendCapabilities.executePr
    || executing
    || verifying
    || stalePlanBlocked
    || executionConsumed
    || proposalLoading
    || workbenchActionState !== "pr_prepared";
  const verifyDisabled = !executionResult || executing || verifying;
  const markForStageBlockReason = !proposalPlan
    ? (locale === "de" ? "Kein Proposal verfügbar" : "No proposal available")
    : stalePlanBlocked
      ? (locale === "de" ? "Proposal ist veraltet" : "Proposal is stale")
      : executionConsumed
        ? (locale === "de" ? "Bereits ausgeführt" : "Already executed")
        : workbenchActionState === "marked" || workbenchActionState === "pr_prepared" || workbenchActionState === "pr_ready"
          ? (locale === "de" ? "Bereits markiert" : "Already marked")
          : (locale === "de" ? "Aktion nicht verfügbar" : "Action unavailable");
  const removeFromReviewBlockReason = !proposalPlan
    ? (locale === "de" ? "Kein Proposal verfügbar" : "No proposal available")
    : workbenchActionState === "removed"
      ? (locale === "de" ? "Bereits entfernt" : "Already removed")
      : (locale === "de" ? "Aktion nicht verfügbar" : "Action unavailable");
  const preparePrBlockReason = !proposalPlan
    ? (locale === "de" ? "Proposal fehlt" : "Proposal missing")
    : workbenchActionState !== "marked"
      ? (locale === "de" ? "Erst \"Mark as reviewed\" ausführen" : "Run \"Mark as reviewed\" first")
      : (locale === "de" ? "Prepare derzeit blockiert" : "Prepare currently blocked");
  const executeBlockReasonTooltip = executeBlockReasonLabel
    ?? (locale === "de" ? "Execute derzeit blockiert" : "Execute currently blocked");
  const verifyBlockReason = !executionResult
    ? (locale === "de" ? "Noch keine Ausführung vorhanden" : "No execution result yet")
    : (locale === "de" ? "Verify derzeit blockiert" : "Verify currently blocked");
  const markForStageGate = toButtonGate(markForStageDisabled ? markForStageBlockReason : null);
  const removeFromReviewGate = toButtonGate(removeFromReviewDisabled ? removeFromReviewBlockReason : null);
  const preparePrGate = toButtonGate(preparePrDisabled ? preparePrBlockReason : null);
  const executePrGate = toButtonGate(executeDisabled ? executeBlockReasonTooltip : null);
  const verifyGate = toButtonGate(verifyDisabled ? verifyBlockReason : null);
  const reviewDirty = isGitHubReviewDirty({
    proposalPlan,
    executionResult,
    approvalChecked,
    executionError,
  });

  useEffect(() => {
    props.onContextChange({
      repositoryLabel: selectedRepoLabel,
      connectionLabel,
      accessLabel,
      analysisLabel,
      proposalLabel,
      approvalLabel,
      resultLabel: resultCopy.label,
      safetyText: ui.github.actionReadBody,
      expertDetails: {
        requestId: currentRequestId,
        planId: proposalPlan?.planId ?? null,
        branchName: proposalPlan?.branchName ?? null,
        apiStatus: props.backendHealthy === false ? ui.shell.statusError : ui.shell.statusReady,
        sseEvents: eventTrail,
        rawDiffPreview,
        selectedRepoSlug: selectedRepo?.fullName ?? null,
      },
    });
  }, [
    accessLabel,
    analysisLabel,
    connectionLabel,
    currentRequestId,
    proposalPlan,
    props.backendHealthy,
    props.onContextChange,
    expertMode,
    eventTrail,
    rawDiffPreview,
    selectedRepo,
    selectedRepoLabel,
    proposalLabel,
    resultCopy.label,
  ]);

  useEffect(() => {
    if (props.onReviewItemsChange) {
      props.onReviewItemsChange(buildGitHubReviewItems(proposalPlan, executionResult, verificationResult, locale));
    }
  }, [executionResult, locale, proposalPlan, props.onReviewItemsChange, verificationResult]);

  useEffect(() => {
    props.onReviewDirtyChange?.(reviewDirty);
  }, [props.onReviewDirtyChange, reviewDirty]);

  useEffect(() => {
    if (!proposalPlan || proposalPlan.stale) {
      setApprovalChecked(false);
      setExecuting(false);
      setVerifying(false);
      setExecutionResult(null);
      setVerificationResult(null);
      setExecutionError(null);
      setVerificationError(null);
      setWorkbenchActionState("unmarked");
    }
  }, [proposalPlan?.planId, proposalPlan?.stale, selectedRepoFullName]);

  function resetReviewState() {
    setAnalysisBundle(null);
    setAnalysisError(null);
    setProposalPlan(null);
    setProposalError(null);
    setRequestId(null);
    setEventTrail([]);
    setApprovalChecked(false);
    setExecuting(false);
    setExecutionResult(null);
    setVerifying(false);
    setVerificationResult(null);
    setExecutionError(null);
    setVerificationError(null);
    setWorkbenchActionState("unmarked");
    setRawDiffExpanded(false);
  }

  function handleRepoChange(nextFullName: string) {
    setSelectedRepoFullName(nextFullName);
    resetReviewState();
    props.onTelemetry("info", localText.telemetryRepoChanged, nextFullName || ui.github.noRepoSelected);
  }

  async function runAnalysis() {
    if (!selectedRepo) {
      setAnalysisError(ui.github.workspaceNoticeSelection);
      return;
    }

    const nextRequestId = createId();
    setRequestId(nextRequestId);
    setAnalysisLoading(true);
    setAnalysisError(null);
    setProposalError(null);
    setProposalPlan(null);
    setEventTrail((current) => [...current, `${ui.github.nextStepAnalysis} · ${nextRequestId}`].slice(-4));
    props.onTelemetry("info", localText.telemetryAnalysisStarted, localText.telemetryAnalysisStartedDetail(selectedRepo.fullName));

    try {
      const response = await fetchGitHubContext({
        repo: {
          owner: selectedRepo.owner,
          repo: selectedRepo.repo,
        },
        question: analysisQuestion,
        ref: selectedRepo.defaultBranch,
        maxFiles: 4,
        maxBytes: 12_000,
      });

      setAnalysisBundle(response.context);
      setEventTrail((current) => [...current, `${ui.github.analysisTitle} · ${response.context.files.length}`].slice(-4));
      props.onTelemetry("info", localText.telemetryAnalysisReady, localText.telemetryAnalysisReadyDetail(response.context.files.length));
    } catch (error) {
      const message = error instanceof Error ? error.message : ui.github.workspaceNoticeAnalysis;
      setAnalysisError(message);
      setEventTrail((current) => [...current, ui.github.workspaceNoticeAnalysis].slice(-4));
      props.onTelemetry("error", localText.telemetryAnalysisFailed, message);
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function createProposal() {
    if (!selectedRepo) {
      setProposalError(ui.github.workspaceNoticeSelection);
      return;
    }

    if (!analysisBundle) {
      setProposalError(ui.github.reviewEmpty);
      return;
    }

    const nextRequestId = createId();
    setRequestId(nextRequestId);
    setProposalLoading(true);
    setProposalError(null);
    setApprovalChecked(false);
    setExecuting(false);
    setExecutionResult(null);
    setVerifying(false);
    setVerificationResult(null);
    setExecutionError(null);
    setVerificationError(null);
    setEventTrail((current) => [...current, `${ui.github.nextStepProposal} · ${nextRequestId}`].slice(-4));
    props.onTelemetry("info", localText.telemetryProposalRequested, localText.telemetryProposalRequestedDetail(selectedRepo.fullName));

    try {
      const response = await proposeGitHubAction({
        repo: {
          owner: selectedRepo.owner,
          repo: selectedRepo.repo,
        },
        objective: proposalObjective,
        question: analysisQuestion,
        ref: selectedRepo.defaultBranch,
        selectedPaths: analysisBundle.files.slice(0, 4).map((file) => file.path),
        constraints: [localText.proposalConstraintReadOnly, localText.proposalConstraintNoDirectExecution],
        baseBranch: selectedRepo.defaultBranch,
      });

      setProposalPlan(response.plan);
      setWorkbenchActionState("unmarked");
      setRawDiffExpanded(false);
      setEventTrail((current) => [...current, `${ui.github.reviewTitle} · ${response.plan.planId}`].slice(-4));
      props.onTelemetry("info", localText.telemetryProposalReady, localText.telemetryProposalReadyDetail(response.plan.planId));
    } catch (error) {
      const message = error instanceof Error ? error.message : ui.github.workspaceNoticeProposal;
      setProposalError(message);
      setEventTrail((current) => [...current, ui.github.workspaceNoticeProposal].slice(-4));
      props.onTelemetry("error", localText.telemetryProposalFailed, message);
    } finally {
      setProposalLoading(false);
    }
  }

  async function handleExecuteProposal() {
    if (!proposalPlan || executeDisabled) {
      return;
    }

    setExecuting(true);
    setExecutionError(null);
    setVerificationError(null);
    setVerificationResult(null);
    setEventTrail((current) => [...current, `${ui.review.approvalNeeded} · ${proposalPlan.planId}`].slice(-4));
    props.onTelemetry("info", localText.telemetryApprovalSubmitted, localText.telemetryApprovalSubmittedDetail);

    try {
      const executionResponse = await executeGitHubPlan(proposalPlan.planId, { approval: true });
      setExecutionResult(executionResponse.result);
      setProposalPlan((current) => (current ? {
        ...current,
        status: "executed",
        execution: executionResponse.result,
      } : current));
      setWorkbenchActionState("pr_ready");
      setApprovalChecked(false);
      setEventTrail((current) => [...current, localText.eventPullRequestCreated(executionResponse.result.prNumber)].slice(-4));
      props.onTelemetry(
        "info",
        localText.telemetryExecutionReady,
        localText.telemetryExecutionReadyDetail(executionResponse.result.prNumber),
      );

      setVerifying(true);
      try {
        const verificationResponse = await verifyGitHubPlan(proposalPlan.planId);
        setVerificationResult(verificationResponse.verification);
        setProposalPlan((current) => (current ? {
          ...current,
          verification: verificationResponse.verification,
        } : current));
        setEventTrail((current) => [...current, localText.eventPullRequestVerified(verificationResponse.verification.status)].slice(-4));
        props.onTelemetry(
          "info",
          localText.telemetryVerificationReady,
          localText.telemetryVerificationReadyDetail(verificationResponse.verification.status),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : localText.verifyFallbackError;
        setVerificationError(message);
        setEventTrail((current) => [...current, ui.github.workspaceNoticeVerification].slice(-4));
        props.onTelemetry("error", localText.telemetryVerificationFailed, message);
      } finally {
        setVerifying(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : ui.github.workspaceNoticeExecution;
      setExecutionError(message);
      setApprovalChecked(false);
      setEventTrail((current) => [...current, ui.github.workspaceNoticeExecution].slice(-4));
      props.onTelemetry("error", localText.telemetryExecutionFailed, message);
    } finally {
      setExecuting(false);
    }
  }

  async function handleVerifyProposal() {
    if (!proposalPlan || verifyDisabled) {
      return;
    }

    setVerifying(true);
    setVerificationError(null);
    setEventTrail((current) => [...current, `${ui.github.verifyResult} · ${proposalPlan.planId}`].slice(-4));

    try {
      const verificationResponse = await verifyGitHubPlan(proposalPlan.planId);
      setVerificationResult(verificationResponse.verification);
      setProposalPlan((current) => (current ? {
        ...current,
        verification: verificationResponse.verification,
      } : current));
      props.onTelemetry(
        "info",
        localText.telemetryVerificationReady,
        localText.telemetryVerificationReadyDetail(verificationResponse.verification.status),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : ui.github.workspaceNoticeVerification;
      setVerificationError(message);
      setEventTrail((current) => [...current, ui.github.workspaceNoticeVerification].slice(-4));
      props.onTelemetry("error", localText.telemetryVerificationFailed, message);
    } finally {
      setVerifying(false);
    }
  }

  const analysisFiles = analysisBundle?.files ?? [];
  const proposalFiles = proposalPlan?.diff ?? [];
  const mobileDiffFiles: DiffSheetFile[] = proposalFiles.map((file) => ({
    path: file.path,
    changeType: file.changeType,
    additions: file.additions,
    deletions: file.deletions,
    patch: file.patch,
  }));
  const mobileDiffSummary = summarizeDiff(mobileDiffFiles);
  const mobileActivityRows = [
    proposalPlan ? {
      id: `proposal:${proposalPlan.planId}`,
      title: proposalPlan.summary,
      additions: mobileDiffSummary.additions,
      deletions: mobileDiffSummary.deletions,
      age: formatActivityAge(proposalPlan.generatedAt, locale),
      onPress: () => setDiffSheetOpen(true),
    } : null,
    executionResult ? {
      id: `execution:${executionResult.planId}`,
      title: localText.eventPullRequestCreated(executionResult.prNumber),
      additions: mobileDiffSummary.additions,
      deletions: mobileDiffSummary.deletions,
      age: formatActivityAge(executionResult.executedAt, locale),
      onPress: () => setDiffSheetOpen(true),
    } : null,
    verificationResult ? {
      id: `verification:${verificationResult.status}`,
      title: localText.eventPullRequestVerified(verificationResult.status),
      additions: 0,
      deletions: 0,
      age: locale === "de" ? "Prüfung" : "verify",
      onPress: () => setDiffSheetOpen(true),
    } : null,
    analysisBundle ? {
      id: `analysis:${analysisBundle.generatedAt}`,
      title: analysisBundle.question,
      additions: analysisBundle.files.length,
      deletions: 0,
      age: formatActivityAge(analysisBundle.generatedAt, locale),
      onPress: () => setDiffSheetOpen(true),
    } : null,
  ].filter((row): row is {
    id: string;
    title: string;
    additions: number;
    deletions: number;
    age: string;
    onPress: () => void;
  } => Boolean(row));
  const workbenchStatus = executionResult
    ? "PR-ready"
    : stalePlanBlocked || executionError || verificationError
      ? "needs review"
      : workbenchActionState === "marked" || workbenchActionState === "pr_prepared"
        ? "marked"
      : proposalPlan
        ? "pending"
        : "clean";
  const workbenchModeLabel =
    proposalPlan || analysisBundle
      ? "Read & Write"
      : "Read Only";
  const workbenchSummaryTitle = proposalPlan?.summary
    ?? analysisBundle?.question
    ?? (locale === "de" ? "Noch keine aktive Arbeit." : "No active work yet.");
  const workbenchSummaryBody = proposalPlan
    ? proposalPlan.rationale
    : analysisBundle
      ? (locale === "de" ? "Analyse liegt vor, Proposal kann vorbereitet werden." : "Analysis is available and a proposal can be prepared.")
      : (locale === "de" ? "Wähle ein Repository und starte mit Analyse." : "Select a repository and start with analysis.");
  const rawDiffForView = buildRawDiffPreview(proposalPlan);
  const actionStateLabel = formatWorkbenchActionState(workbenchActionState, locale);
  const changeLogValidation = verificationResult
    ? `verify:${verificationResult.status}`
    : executionResult
      ? (locale === "de" ? "execute: erstellt, verify ausstehend" : "execute: created, verify pending")
      : proposalPlan
        ? (locale === "de" ? "analyse/proposal geprüft, kein Execute-Call" : "analysis/proposal checked, no execute call")
        : (locale === "de" ? "keine Checks" : "no checks");
  const changeLogKeyElements = proposalFiles
    .slice(0, 5)
    .map((file) => `${file.changeType}:${file.path}`);
  const canCopySummary = Boolean(proposalPlan || analysisBundle);
  const canOpenRawDiff = Boolean(rawDiffForView);
  const openDiffGate = toButtonGate(!canOpenRawDiff ? (locale === "de" ? "Noch kein Diff verfügbar" : "No diff available yet") : null);
  const copySummaryGate = toButtonGate(!canCopySummary ? (locale === "de" ? "Noch keine Summary verfügbar" : "No summary available yet") : null);
  const workbenchActionEffects = {
    markForStage: "local_review_state" as WorkbenchActionEffectType,
    removeReview: "local_review_state" as WorkbenchActionEffectType,
    openDiff: "local_review_state" as WorkbenchActionEffectType,
    preparePr: "backend_prepare" as WorkbenchActionEffectType,
    createPr: "backend_execute_pr" as WorkbenchActionEffectType,
    copySummary: "local_review_state" as WorkbenchActionEffectType,
  };
  const workbenchActionLabels = {
    markForStage: deriveWorkbenchActionLabel({
      effectType: workbenchActionEffects.markForStage,
      actionState: workbenchActionState,
      action: "mark_for_stage",
      backendCapability: false,
      locale,
    }),
    removeReview: deriveWorkbenchActionLabel({
      effectType: workbenchActionEffects.removeReview,
      actionState: workbenchActionState,
      action: "remove_from_review",
      backendCapability: false,
      locale,
    }),
    openDiff: deriveWorkbenchActionLabel({
      effectType: workbenchActionEffects.openDiff,
      actionState: workbenchActionState,
      action: "open_diff",
      backendCapability: false,
      locale,
    }),
    preparePr: deriveWorkbenchActionLabel({
      effectType: workbenchActionEffects.preparePr,
      actionState: workbenchActionState,
      action: "prepare_pr",
      backendCapability: backendCapabilities.preparePr,
      locale,
    }),
    createPr: deriveWorkbenchActionLabel({
      effectType: workbenchActionEffects.createPr,
      actionState: workbenchActionState,
      action: "create_pr",
      backendCapability: backendCapabilities.executePr,
      locale,
    }),
    copySummary: deriveWorkbenchActionLabel({
      effectType: workbenchActionEffects.copySummary,
      actionState: workbenchActionState,
      action: "copy_summary",
      backendCapability: false,
      locale,
    }),
  };
  const workflowSteps = [
    {
      key: "repo",
      label: "Repo",
      completed: Boolean(selectedRepo),
      active: !selectedRepo,
    },
    {
      key: "analysis",
      label: locale === "de" ? "Analyse" : "Analyze",
      completed: Boolean(analysisBundle),
      active: Boolean(selectedRepo) && !analysisBundle,
    },
    {
      key: "proposal",
      label: "Proposal",
      completed: Boolean(proposalPlan),
      active: Boolean(analysisBundle) && !proposalPlan,
    },
    {
      key: "review",
      label: locale === "de" ? "Review" : "Review",
      completed: workbenchActionState === "marked" || workbenchActionState === "pr_prepared" || workbenchActionState === "pr_ready",
      active: Boolean(proposalPlan) && workbenchActionState === "unmarked",
    },
    {
      key: "execute",
      label: locale === "de" ? "Execute" : "Execute",
      completed: Boolean(executionResult),
      active: workbenchActionState === "pr_prepared" && !executionResult,
    },
    {
      key: "verify",
      label: locale === "de" ? "Verify" : "Verify",
      completed: Boolean(verificationResult),
      active: Boolean(executionResult) && !verificationResult,
    },
  ];
  const pinnableChatContext = useMemo(
    () => buildGitHubPinnedChatContext({
      selectedRepo,
      analysisBundle,
      proposalPlan,
    }),
    [analysisBundle, proposalPlan, selectedRepo],
  );
  function handleMarkForStage() {
    if (markForStageDisabled) {
      return;
    }

    setWorkbenchActionState("marked");
    setApprovalChecked(true);
    setEventTrail((current) => [...current, locale === "de" ? "Zur Übergabe vorgemerkt" : "Marked for stage"].slice(-4));
  }

  function handleRemoveFromReview() {
    if (removeFromReviewDisabled) {
      return;
    }

    setWorkbenchActionState("removed");
    setApprovalChecked(false);
    setEventTrail((current) => [...current, locale === "de" ? "Aus Review entfernt" : "Removed from review"].slice(-4));
  }

  function handlePreparePr() {
    if (preparePrDisabled) {
      return;
    }

    setWorkbenchActionState("pr_prepared");
    setApprovalChecked(true);
    setEventTrail((current) => [...current, workbenchActionLabels.preparePr].slice(-4));
  }

  async function handleCopySummary() {
    if (!canCopySummary || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    const lines = [
      `Intent: ${workbenchSummaryTitle}`,
      `Why: ${workbenchSummaryBody}`,
      `Files: ${proposalFiles.map((file) => file.path).join(", ") || "none"}`,
      `Risk: ${proposalPlan ? formatGitHubRiskLevel(proposalPlan.riskLevel) : "n/a"}`,
      `Validation: ${changeLogValidation}`,
      `Action State: ${actionStateLabel}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      props.onTelemetry("info", "Workbench summary copied");
    } catch (error) {
      props.onTelemetry(
        "warning",
        "Workbench summary copy failed",
        error instanceof Error ? error.message : undefined,
      );
    }
  }

  const workspaceNotice = proposalPlan && stalePlanBlocked
    ? ui.github.workspaceNoticeStale
    : executionError && !stalePlanBlocked
      ? ui.github.workspaceNoticeExecution
      : verificationError
        ? ui.github.workspaceNoticeVerification
        : analysisError
          ? ui.github.workspaceNoticeAnalysis
          : proposalError
            ? ui.github.workspaceNoticeProposal
            : reposError
              ? ui.github.workspaceNoticeRepos
              : null;

  return (
    <section
      className="workspace-panel github-workspace"
      data-testid="github-workspace"
      aria-busy={reposLoading || analysisLoading || proposalLoading || executing || verifying}
    >
      <section className="github-mobile-panel mobile-panel-scroll" aria-label={locale === "de" ? "Workbench mobile Arbeitsfläche" : "Workbench mobile workspace"}>
        <header className="github-mobile-summary github-mobile-summary-elevated">
          <span className="mobile-mono">WORKBENCH</span>
          <strong>{selectedRepo ? (expertMode ? selectedRepo.fullName : ui.github.repoSelected) : ui.github.nextStepChooseRepo}</strong>
          <p>
            {selectedRepo
              ? `${accessLabel} · ${selectedRepo.defaultBranch}`
              : githubConnected
                ? ui.github.noRepos
                : githubConnectLabel}
          </p>
        </header>

        <section className="github-mobile-truth-grid" aria-label={locale === "de" ? "Workbench Status" : "Workbench status"}>
          <div className="github-mobile-truth-item">
            <span>{locale === "de" ? "Repo" : "Repo"}</span>
            <strong>{selectedRepo ? (expertMode ? selectedRepo.fullName : ui.github.repoSelected) : ui.github.noRepoSelected}</strong>
          </div>
          <div className="github-mobile-truth-item">
            <span>{locale === "de" ? "Branch" : "Branch"}</span>
            <strong>{proposalPlan?.branchName ?? selectedRepo?.defaultBranch ?? ui.common.na}</strong>
          </div>
          <div className="github-mobile-truth-item">
            <span>{locale === "de" ? "Verbindung" : "Connection"}</span>
            <strong>{connectionLabel}</strong>
          </div>
          <div className="github-mobile-truth-item">
            <span>{locale === "de" ? "Nächster Schritt" : "Next step"}</span>
            <strong>{mobileNextStepLabel}</strong>
          </div>
        </section>

        <section className="github-mobile-stage-card" aria-label={locale === "de" ? "Schritt 1 Kontext" : "Step 1 context"}>
          <span className="mobile-mono">{locale === "de" ? "SCHRITT 1 · KONTEXT" : "STEP 1 · CONTEXT"}</span>
          <label htmlFor="github-repo-select-mobile">{ui.github.repoSelectLabel}</label>
          <select
            id="github-repo-select-mobile"
            aria-label={ui.github.repoSelectLabel}
            ref={repoSelectRef}
            value={selectedRepoFullName}
            onChange={(event) => handleRepoChange(event.target.value)}
            disabled={reposLoading || repos.length === 0}
          >
            <option value="">
              {reposLoading ? ui.github.loadingRepos : ui.github.repoSelectLabel}
            </option>
            {repos.map((repo, index) => (
              <option key={repo.fullName} value={repo.fullName}>
                {friendlyRepoLabel(index, expertMode, repo.fullName, locale)}
              </option>
            ))}
          </select>
          <div className="github-mobile-stage-actions">
            {githubConnected ? (
              <>
                <button type="button" className="secondary-button" onClick={() => props.onIntegrationAction("github", "reverify")}>
                  {locale === "de" ? "Erneut prüfen" : "Reverify"}
                </button>
                <button type="button" className="secondary-button" onClick={() => props.onIntegrationAction("github", "disconnect")}>
                  {locale === "de" ? "Trennen" : "Disconnect"}
                </button>
              </>
            ) : (
              <button type="button" onClick={() => props.onIntegrationAction("github", githubConnectAction)}>
                {githubConnectLabel}
              </button>
            )}
          </div>
        </section>

        <section className="github-mobile-stage-card" aria-label={locale === "de" ? "Schritt 2 Analyse und Vorschlag" : "Step 2 analysis and proposal"}>
          <span className="mobile-mono">{locale === "de" ? "SCHRITT 2 · ANALYSE" : "STEP 2 · ANALYZE"}</span>
          <p>{locale === "de" ? "Starte erst die Analyse, dann den Vorschlag." : "Run analysis first, then proposal."}</p>
          <div className="github-mobile-action-list">
            <button
              type="button"
              onClick={() => {
                if (!selectedRepo && !githubConnected) {
                  props.onIntegrationAction("github", githubConnectAction);
                  return;
                }
                if (!selectedRepo) {
                  repoSelectRef.current?.focus();
                  return;
                }
                void runAnalysis();
              }}
              disabled={analysisLoading || reposLoading}
            >
              {analysisLoading ? ui.common.loading : ui.github.nextStepAnalysis}
            </button>
            <button
              type="button"
              onClick={() => {
                void createProposal();
              }}
              disabled={proposalLoading || !analysisBundle}
            >
              {proposalLoading ? ui.common.loading : ui.github.nextStepProposal}
            </button>
          </div>
        </section>

        <section className="github-mobile-stage-card" aria-label={locale === "de" ? "Schritt 3 Diff und Übergabe" : "Step 3 diff and handoff"}>
          <span className="mobile-mono">{locale === "de" ? "SCHRITT 3 · DIFF" : "STEP 3 · DIFF"}</span>
          <p>{locale === "de" ? "Öffne den Diff und prüfe Änderungen vor Freigabe." : "Open diff and review changes before approval."}</p>
          <div className="github-mobile-action-list">
            <button
              type="button"
              onClick={() => setDiffSheetOpen(true)}
              disabled={!proposalPlan}
            >
              {workbenchActionLabels.openDiff}
            </button>
          </div>
        </section>

        <section className="github-mobile-activity" aria-label={locale === "de" ? "Workbench Aktivität" : "Workbench activity"}>
          <span className="mobile-mono">{locale === "de" ? "AKTIVITÄT" : "ACTIVITY"}</span>
          {mobileActivityRows.length > 0 ? mobileActivityRows.map((row) => (
            <ActivityRow
              key={row.id}
              title={row.title}
              additions={row.additions}
              deletions={row.deletions}
              age={row.age}
              onPress={row.onPress}
            />
          )) : (
            <p>{locale === "de" ? "Noch keine Analyse oder Proposal in dieser Session." : "No analysis or proposal in this session yet."}</p>
          )}
        </section>

        <DiffSheet
          open={diffSheetOpen}
          title={locale === "de" ? "Workbench Diff" : "Workbench diff"}
          summary={proposalPlan?.summary ?? analysisBundle?.question ?? ui.github.diffAppearsLater}
          emptyLabel={ui.github.diffAppearsLater}
          files={mobileDiffFiles}
          onDismiss={() => setDiffSheetOpen(false)}
        />
      </section>

      <article className="workspace-card github-workflow-stepper" data-testid="workbench-stepper">
        <header className="card-header">
          <div>
            <span>{locale === "de" ? "Workflow" : "Workflow"}</span>
            <strong>{locale === "de" ? "Repo → Analyse → Proposal → Review → Execute → Verify" : "Repo → Analyze → Proposal → Review → Execute → Verify"}</strong>
          </div>
        </header>
        <div className="chip-list">
          {workflowSteps.map((step) => (
            <span
              key={step.key}
              className={step.completed
                ? "workflow-chip workflow-chip-complete"
                : step.active
                  ? "workflow-chip workflow-chip-active"
                  : "workflow-chip workflow-chip-idle"}
            >
              {step.completed ? "✓ " : ""}{step.label}
            </span>
          ))}
        </div>
      </article>

      <article className="workspace-card github-review-card">
        <header className="card-header">
          <div>
            <span>{locale === "de" ? "Workspace Header" : "Workspace Header"}</span>
            <strong>{locale === "de" ? "Workbench Review Center" : "Workbench Review Center"}</strong>
          </div>
          <div className="plan-badges">
            <span className="workflow-chip workflow-chip-active" aria-label={`repo:${selectedRepo?.fullName ?? ui.github.noRepoSelected}`}>
              {selectedRepo?.fullName ?? ui.github.noRepoSelected}
            </span>
            <span className="workflow-chip workflow-chip-idle" aria-label={`branch:${proposalPlan?.branchName ?? selectedRepo?.defaultBranch ?? ui.common.na}`}>
              {proposalPlan?.branchName ?? selectedRepo?.defaultBranch ?? ui.common.na}
            </span>
            <span className={`workflow-chip ${workbenchStatus === "clean" ? "workflow-chip-idle" : "workflow-chip-active"}`} aria-label={`mode:${workbenchModeLabel}`}>
              {`mode:${workbenchModeLabel}`}
            </span>
            <span className={`workflow-chip ${workbenchStatus === "clean" ? "workflow-chip-idle" : "workflow-chip-active"}`} aria-label={`status:${workbenchStatus}`}>
              {`status:${workbenchStatus}`}
            </span>
            <span className="workflow-chip workflow-chip-idle" aria-label={`scope:${proposalFiles[0]?.path ?? analysisFiles[0]?.path ?? ui.common.na}`}>
              {`scope:${proposalFiles[0]?.path ?? analysisFiles[0]?.path ?? ui.common.na}`}
            </span>
          </div>
        </header>
      </article>

      <article className="workspace-card github-review-card">
        <header className="card-header">
          <div>
            <span>{locale === "de" ? "Active Context" : "Active Context"}</span>
            <strong>{selectedRepo?.fullName ?? ui.github.noRepoSelected}</strong>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => repoSelectRef.current?.focus()}
            disabled={reposLoading}
          >
            {locale === "de" ? "Kontext ändern" : "Change context"}
          </button>
        </header>
        <div className="truth-rail-pairs">
          <div>
            <span>Repo</span>
            <strong>{selectedRepo?.fullName ?? ui.common.na}</strong>
          </div>
          <div>
            <span>Branch</span>
            <strong>{proposalPlan?.branchName ?? selectedRepo?.defaultBranch ?? ui.common.na}</strong>
          </div>
          <div>
            <span>Scope</span>
            <strong>{proposalFiles[0]?.path ?? analysisFiles[0]?.path ?? ui.common.na}</strong>
          </div>
          <div>
            <span>{locale === "de" ? "Verbindung" : "Connection"}</span>
            <strong>{connectionLabel}</strong>
          </div>
          <div>
            <span>{locale === "de" ? "Schreibstatus" : "Write status"}</span>
            <strong>{workbenchModeLabel}</strong>
          </div>
        </div>
        <div className="action-row">
          <select
            id="github-repo-select"
            aria-label={ui.github.repoSelectLabel}
            ref={repoSelectRef}
            value={selectedRepoFullName}
            onChange={(event) => handleRepoChange(event.target.value)}
            disabled={reposLoading || repos.length === 0}
          >
            <option value="">
              {reposLoading ? ui.github.loadingRepos : ui.github.repoSelectLabel}
            </option>
            {repos.map((repo, index) => (
              <option key={repo.fullName} value={repo.fullName}>
                {friendlyRepoLabel(index, expertMode, repo.fullName, locale)}
              </option>
            ))}
          </select>
          {githubConnected ? (
            <>
              <button type="button" className="secondary-button" onClick={() => props.onIntegrationAction("github", "reverify")}>
                {locale === "de" ? "Erneut prüfen" : "Reverify"}
              </button>
              <button type="button" className="secondary-button" onClick={() => props.onIntegrationAction("github", "disconnect")}>
                {locale === "de" ? "Trennen" : "Disconnect"}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => props.onIntegrationAction("github", githubConnectAction)}>
              {githubConnectLabel}
            </button>
          )}
        </div>
        {selectedRepo ? (
          <p className="muted-copy">
            {`${formatRepoVisibility(selectedRepo.isPrivate, locale)} · ${ui.github.repositoryStatus}: ${formatRepoStatus(selectedRepo.status, locale)} · ${selectedRepo.description ?? ui.common.none}`}
          </p>
        ) : null}
      </article>

      {workspaceNotice ? (
        <p
          className={proposalPlan && stalePlanBlocked ? "warning-banner" : "error-banner"}
          role={proposalPlan && stalePlanBlocked ? "status" : "alert"}
          data-testid="github-workspace-notice"
        >
          {workspaceNotice}
        </p>
      ) : null}

      <article className="workspace-card github-review-card">
        <header className="card-header">
          <div>
            <span>{locale === "de" ? "Current Work Summary" : "Current Work Summary"}</span>
            <strong>{workbenchSummaryTitle}</strong>
          </div>
          <div className="action-row">
            <button type="button" onClick={() => { void runAnalysis(); }} disabled={analysisLoading || !selectedRepo}>
              {analysisLoading ? ui.common.loading : ui.github.nextStepAnalysis}
            </button>
            <button type="button" onClick={() => { void createProposal(); }} disabled={proposalLoading || !analysisBundle}>
              {proposalLoading ? ui.common.loading : ui.github.nextStepProposal}
            </button>
          </div>
        </header>
        <p>{workbenchSummaryBody}</p>
        {props.onPinChatContext ? (
          <div className="action-row github-pin-context-row">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                if (!pinnableChatContext) {
                  return;
                }

                props.onPinChatContext?.(pinnableChatContext);
              }}
              disabled={!pinnableChatContext}
            >
              {ui.github.pinToChatContext}
            </button>
            <span className="muted-copy">{ui.github.pinToChatContextHint}</span>
          </div>
        ) : null}
      </article>

      <article className="workspace-card github-review-card" data-testid="workbench-change-log">
        <header className="card-header">
          <div>
            <span>{locale === "de" ? "Guardrail Change Log" : "Guardrail Change Log"}</span>
            <strong>{proposalPlan?.planId ?? ui.common.na}</strong>
          </div>
          <span className="status-pill status-partial">{`Action: ${actionStateLabel}`}</span>
        </header>
        <div className="truth-rail-pairs">
          <div>
            <span>Intent</span>
            <strong>{workbenchSummaryTitle}</strong>
          </div>
          <div>
            <span>Files</span>
            <strong>{proposalFiles.map((file) => file.path).join(", ") || ui.common.none}</strong>
          </div>
          <div>
            <span>Key Elements</span>
            <strong>{changeLogKeyElements.join(" · ") || ui.common.none}</strong>
          </div>
          <div>
            <span>Risk</span>
            <strong>{proposalPlan ? formatGitHubRiskLevel(proposalPlan.riskLevel) : ui.common.na}</strong>
          </div>
          <div>
            <span>Validation</span>
            <strong>{changeLogValidation}</strong>
          </div>
          <div>
            <span>Action State</span>
            <strong>{actionStateLabel}</strong>
          </div>
        </div>
      </article>

      <article className="workspace-card github-review-card" data-testid="workbench-review-actions">
        <header className="card-header">
          <div>
            <span>{locale === "de" ? "Review Actions" : "Review Actions"}</span>
            <strong>{locale === "de" ? "Semantik folgt technischer Wirkung" : "Action semantics follow technical effect"}</strong>
          </div>
        </header>
        <div className="action-row">
          <GateButton
            onClick={handleMarkForStage}
            disabled={markForStageDisabled}
            blockedReason={markForStageGate.tooltipText}
            testId="workbench-action-mark-for-stage"
            effectType={workbenchActionEffects.markForStage}
          >
            {workbenchActionLabels.markForStage}
          </GateButton>
          <GateButton
            className="secondary-button"
            onClick={handleRemoveFromReview}
            disabled={removeFromReviewDisabled}
            blockedReason={removeFromReviewGate.tooltipText}
            testId="workbench-action-remove-review"
            effectType={workbenchActionEffects.removeReview}
          >
            {workbenchActionLabels.removeReview}
          </GateButton>
          <GateButton
            className="secondary-button"
            onClick={() => setRawDiffExpanded((current) => !current)}
            disabled={!canOpenRawDiff}
            blockedReason={openDiffGate.tooltipText}
            testId="workbench-action-open-diff"
            effectType={workbenchActionEffects.openDiff}
          >
            {workbenchActionLabels.openDiff}
          </GateButton>
          <GateButton
            className="secondary-button"
            onClick={handlePreparePr}
            disabled={preparePrDisabled}
            blockedReason={preparePrGate.tooltipText}
            testId="workbench-action-prepare-pr"
            effectType={workbenchActionEffects.preparePr}
          >
            {workbenchActionLabels.preparePr}
          </GateButton>
          <GateButton
            onClick={() => {
              void handleExecuteProposal();
            }}
            disabled={executeDisabled}
            blockedReason={executePrGate.tooltipText}
            testId="workbench-action-create-pr"
            effectType={workbenchActionEffects.createPr}
            backendCapability={String(serverCanExecute)}
            executeBlockReason={executeBlockReason ?? "none"}
          >
            {workbenchActionLabels.createPr}
          </GateButton>
          <GateButton
            className="secondary-button"
            onClick={() => {
              void handleCopySummary();
            }}
            disabled={!canCopySummary}
            blockedReason={copySummaryGate.tooltipText}
            testId="workbench-action-copy-summary"
            effectType={workbenchActionEffects.copySummary}
          >
            {workbenchActionLabels.copySummary}
          </GateButton>
        </div>
        <p className="muted-copy">
          {locale === "de"
            ? "Mark for stage und Aus Review entfernen ändern nur lokalen Workbench-Review-State."
            : "Mark for stage and Remove from review only change local workbench review state."}
        </p>
        {executeBlockReasonLabel ? (
          <p className="muted-copy">{executeBlockReasonLabel}</p>
        ) : null}
      </article>

      <article className="workspace-card github-review-card">
        <header className="card-header">
          <div>
            <span>{locale === "de" ? "Raw Diff" : "Raw Diff"}</span>
            <strong>{locale === "de" ? "Optionaler Detailblick" : "Optional detail view"}</strong>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setRawDiffExpanded((current) => !current)}
            disabled={!canOpenRawDiff}
          >
            {rawDiffExpanded ? (locale === "de" ? "Diff schließen" : "Close diff") : workbenchActionLabels.openDiff}
          </button>
        </header>
        {rawDiffExpanded && rawDiffForView ? (
          <pre className="github-diff-preview">{rawDiffForView}</pre>
        ) : (
          <p className="muted-copy">{ui.github.diffAppearsLater}</p>
        )}
      </article>

      {proposalPlan && executionResult ? (
        <article className="workspace-card github-review-card" data-testid="github-pr-result">
          <header className="card-header">
            <div>
              <span>{locale === "de" ? "PR Status" : "PR status"}</span>
              <strong>{resultCopy.detail}</strong>
            </div>
          </header>
          <div className="action-row">
            {executionResult.prUrl ? (
              <a
                href={executionResult.prUrl}
                target="_blank"
                rel="noreferrer"
                className="secondary-button github-pr-link"
              >
                {ui.github.openInGitHub}
              </a>
            ) : null}
            <GateButton
              className="secondary-button"
              onClick={() => {
                void handleVerifyProposal();
              }}
              disabled={verifyDisabled}
              blockedReason={verifyGate.tooltipText}
            >
              {verifying ? ui.github.verifyBusy : ui.github.verifyResult}
            </GateButton>
          </div>
        </article>
      ) : null}

          <ExpertDetails
            expertMode={expertMode}
            rows={[
              { label: ui.github.connectedRepo, value: selectedRepo?.fullName ?? ui.common.na },
              { label: ui.shell.sessionIdPrefix, value: requestId ?? ui.common.na },
              { label: ui.github.reviewTitle, value: proposalPlan?.planId ?? ui.common.na },
              { label: localText.branchLabel, value: proposalPlan?.branchName ?? ui.common.na },
              { label: localText.commitLabel, value: executionResult?.commitSha ?? ui.common.na },
              { label: localText.pullRequestLabel, value: executionResult?.prNumber ? `#${executionResult.prNumber}` : ui.common.na },
              { label: ui.github.targetBranch, value: executionResult?.targetBranch ?? proposalPlan?.targetBranch ?? ui.common.na },
              { label: ui.github.repositoryStatus, value: props.backendHealthy === false ? ui.shell.statusError : ui.shell.statusReady },
              { label: ui.github.verifyResult, value: verificationResult?.status ?? ui.common.na },
              { label: ui.shell.diagnosticsLabel, value: eventTrail.length > 0 ? eventTrail.join(" · ") : ui.common.none },
            ]}
          >
            {executionResult?.prUrl ? (
              <p>
                {localText.pullRequestUrlLabel}:{" "}
                <a href={executionResult.prUrl} target="_blank" rel="noreferrer">
                  {executionResult.prUrl}
                </a>
              </p>
            ) : null}
            {verificationResult?.mismatchReasons?.length ? (
              <p className="warning-banner" role="status">
                {verificationResult.mismatchReasons.join(" · ")}
              </p>
            ) : null}
          {rawDiffPreview ? (
              <pre className="github-diff-preview">{rawDiffPreview}</pre>
            ) : (
              <p className="muted-copy">
                {ui.github.diffAppearsLater}
              </p>
            )}
          </ExpertDetails>
    </section>
  );
}
