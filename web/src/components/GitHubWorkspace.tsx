import { useEffect, useMemo, useRef, useState } from "react";
import {
  ApprovalTransitionCard,
  DecisionZone,
  ExecutionReceiptCard,
  ProposalCard,
} from "./ApprovalPrimitives.js";
import { ExpertDetails } from "./ExpertDetails.js";
import {
  executeGitHubPlan,
  fetchGitHubContext,
  fetchGitHubRepos,
  proposeGitHubAction,
  verifyGitHubPlan,
  type GitHubChangePlan,
  type GitHubContextBundle,
  type GitHubExecuteResult,
  type GitHubRepoSummary,
  type GitHubVerifyResult,
} from "../lib/github-api.js";
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
  expertMode: boolean;
  onTelemetry: (
    kind: "info" | "warning" | "error",
    label: string,
    detail?: string,
  ) => void;
  onContextChange: (status: GitHubWorkspaceStatus) => void;
  onReviewItemsChange?: (items: ReviewItem[]) => void;
  onSessionChange: (session: GitHubSession) => void;
};

const ANALYSIS_QUESTION =
  "Beschreibe die Projektstruktur und nenne die sichere nächste Aktion.";
const PROPOSAL_OBJECTIVE =
  "Erstelle einen sicheren Änderungsvorschlag für das gewählte Repo.";

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

function friendlyTargetBranchLabel(targetBranch: string | null, repo: GitHubRepoSummary | null, locale: Locale) {
  if (!targetBranch) {
    return locale === "de" ? "Hauptzweig" : "Default branch";
  }

  if (repo && targetBranch === repo.defaultBranch) {
    return locale === "de" ? "Hauptzweig" : "Default branch";
  }

  return locale === "de" ? "Zielzweig" : "Target branch";
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

export function GitHubWorkspace(props: GitHubWorkspaceProps) {
  const { locale, copy: ui } = useLocalization();
  const localText = useMemo(() => getGitHubLocaleText(locale), [locale]);
  const [repos, setRepos] = useState<GitHubRepoSummary[]>([]);
  const [reposLoading, setReposLoading] = useState(true);
  const [reposError, setReposError] = useState<string | null>(null);
  const [selectedRepoFullName, setSelectedRepoFullName] = useState(
    props.session.metadata.selectedRepoFullName,
  );
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
  const repoSelectRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    const snapshotMetadata = {
      ...props.session.metadata,
      selectedRepoFullName,
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

    props.onSessionChange(nextSession);
  }, [
    analysisBundle,
    approvalChecked,
    eventTrail,
    executionError,
    executionResult,
    proposalPlan,
    props.onSessionChange,
    props.session.id,
    requestId,
    selectedRepoFullName,
    verificationError,
    verificationResult,
  ]);

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
    ? props.expertMode
      ? selectedRepo.fullName
      : ui.github.repoSelected
    : ui.github.noRepoSelected;
  const rawDiffPreview = props.expertMode ? buildRawDiffPreview(proposalPlan) : null;
  const currentRequestId = requestId;
  const stalePlanBlocked = Boolean(
    proposalPlan?.stale
      || executionError?.toLowerCase().includes("stale")
      || verificationError?.toLowerCase().includes("stale"),
  );
  const executionConsumed = Boolean(executionResult);
  const approvalLocked =
    !proposalPlan
    || executing
    || verifying
    || stalePlanBlocked
    || executionConsumed
    || proposalLoading;
  const executeDisabled =
    !proposalPlan
    || executing
    || verifying
    || stalePlanBlocked
    || executionConsumed
    || proposalLoading;
  const verifyDisabled = !executionResult || executing || verifying;

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
    props.expertMode,
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
    if (!proposalPlan || proposalPlan.stale) {
      setApprovalChecked(false);
      setExecuting(false);
      setVerifying(false);
      setExecutionResult(null);
      setVerificationResult(null);
      setExecutionError(null);
      setVerificationError(null);
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
        question: ANALYSIS_QUESTION,
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
        objective: PROPOSAL_OBJECTIVE,
        question: ANALYSIS_QUESTION,
        ref: selectedRepo.defaultBranch,
        selectedPaths: analysisBundle.files.slice(0, 4).map((file) => file.path),
        constraints: [localText.proposalConstraintReadOnly, localText.proposalConstraintNoDirectExecution],
        baseBranch: selectedRepo.defaultBranch,
      });

      setProposalPlan(response.plan);
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

  const hasSelection = Boolean(selectedRepo);
  const analysisFiles = analysisBundle?.files ?? [];
  const proposalFiles = proposalPlan?.diff ?? [];
  const proposalReady = Boolean(proposalPlan);
  const proposalHeadline = proposalPlan
    ? executionResult
      ? resultCopy.label
      : ui.review.approvalNeeded
    : analysisBundle
      ? ui.github.analysisTitle
      : ui.github.nextStepAnalysis;
  const proposalBadge = proposalPlan
    ? executionResult
      ? resultCopy.label
      : ui.review.approvalNeeded
    : analysisBundle
      ? ui.github.readOnly
      : ui.github.nextStepAnalysis;
  const nextStepTitle = !hasSelection
    ? `${ui.github.nextStepLabel}: ${ui.github.nextStepChooseRepo}.`
    : proposalPlan
      ? `${ui.github.nextStepLabel}: ${ui.github.nextStepProposal}.`
      : `${ui.github.nextStepLabel}: ${ui.github.nextStepAnalysis}.`;
  const nextStepDescription = !hasSelection
    ? ui.github.actionReadBody
    : proposalPlan
      ? ui.github.approveHelper
      : ui.github.actionReadBody;

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
      <section className="workspace-hero github-hero">
        <div>
          <p className={`status-pill ${hasSelection ? "status-ready" : "status-partial"}`}>
            {hasSelection ? ui.github.readOnlyActive : ui.github.nextStepChooseRepo}
          </p>
          <h1>{ui.github.title}</h1>
          <p className="hero-copy">
            {ui.github.intro}
          </p>
        </div>

        <aside className="mini-panel github-mini-panel">
          <label htmlFor="github-repo-select">{ui.github.repoSelectLabel}</label>
          <select
            id="github-repo-select"
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
                {friendlyRepoLabel(index, props.expertMode, repo.fullName, locale)}
              </option>
            ))}
          </select>

          {selectedRepo ? (
            <article className="github-repo-card">
              <div className="github-repo-card-header">
                <div>
                  <span>{ui.github.connectedRepo}</span>
                  <strong>{props.expertMode ? selectedRepo.fullName : ui.github.repoSelected}</strong>
                </div>
                <span className="status-pill status-ready">{accessLabel}</span>
              </div>
              <div className="github-repo-meta">
                <span>{formatRepoVisibility(selectedRepo.isPrivate, locale)}</span>
                <span>•</span>
                <span>{props.expertMode ? `${ui.github.defaultBranch}: ${selectedRepo.defaultBranch}` : ui.github.readOnly}</span>
                <span>•</span>
                <span>{ui.github.repositoryStatus}: {formatRepoStatus(selectedRepo.status, locale)}</span>
              </div>
              <p>{selectedRepo.description ?? ui.common.none}</p>
            </article>
          ) : (
            <p>{reposLoading ? ui.github.loadingRepos : ui.github.noRepos}</p>
          )}

          <div className="github-hero-note">
            <p className="info-label">{ui.github.nextStepLabel}</p>
            <strong>{nextStepTitle}</strong>
            <p>{nextStepDescription}</p>
            {workspaceNotice ? (
              <p
                className={proposalPlan && stalePlanBlocked ? "warning-banner" : "error-banner"}
                role={proposalPlan && stalePlanBlocked ? "status" : "alert"}
                data-testid="github-workspace-notice"
              >
                {workspaceNotice}
              </p>
            ) : null}
          </div>
        </aside>
      </section>

      {!hasSelection ? (
        <article className="empty-state-card">
          <div className="empty-state-card-copy">
            <p className="info-label">{ui.github.title}</p>
            <h2>{ui.github.noRepoSelected}</h2>
            <p>
              {ui.github.workspaceNoticeSelection}
            </p>
          </div>

          <ol className="guided-steps">
            <li>{ui.github.nextStepChooseRepo}</li>
            <li>{ui.github.nextStepAnalysis}</li>
            <li>{ui.github.nextStepProposal}</li>
            <li>{ui.review.approvalNeeded}</li>
          </ol>

          <div className="action-row">
            <button
              type="button"
              onClick={() => repoSelectRef.current?.focus()}
              disabled={reposLoading || repos.length === 0}
            >
              {ui.github.repoSelectLabel}
            </button>
            <span className="muted-copy">{ui.github.noRepos}</span>
          </div>
        </article>
      ) : (
        <>
          <div className="github-action-grid">
            <article className="workspace-card github-action-card">
              <header className="card-header">
                <div>
                  <span>{ui.github.actionReadTitle}</span>
                  <strong>{ui.github.nextStepAnalysis}</strong>
                </div>
                <span className="status-pill status-ready">{ui.github.readOnly}</span>
              </header>
              <p>{ui.github.actionReadBody}</p>
              <div className="action-row">
                <button
                  type="button"
                  onClick={() => {
                    void runAnalysis();
                  }}
                  disabled={analysisLoading}
                >
                  {analysisLoading ? ui.common.loading : ui.github.nextStepAnalysis}
                </button>
                <span className="muted-copy">{ui.github.readOnlyActive}</span>
              </div>
            </article>

            <article className="workspace-card github-action-card">
              <header className="card-header">
                <div>
                  <span>{ui.github.actionProposalTitle}</span>
                  <strong>{ui.github.nextStepProposal}</strong>
                </div>
                <span className="status-pill status-partial">{ui.review.approvalNeeded}</span>
              </header>
              <p>{ui.github.actionProposalBody}</p>
              <div className="action-row">
                <button
                  type="button"
                  onClick={() => {
                    void createProposal();
                  }}
                  disabled={proposalLoading || !analysisBundle}
                >
                  {proposalLoading ? ui.common.loading : ui.github.nextStepProposal}
                </button>
                <span className="muted-copy">{ui.review.approvalNeeded}</span>
              </div>
            </article>
          </div>

          <article className="workspace-card github-review-card">
            <header className="card-header">
              <div>
                <span>{ui.github.reviewTitle}</span>
                <strong>{proposalHeadline}</strong>
              </div>
              <div className="plan-badges">
                <span className={`workflow-chip ${proposalReady ? "workflow-chip-active" : "workflow-chip-idle"}`}>
                  {proposalBadge}
                </span>
              </div>
            </header>

            {analysisBundle ? (
              <div className="github-review-body">
                <div className="github-review-summary">
                  <p className="info-label">{ui.github.analysisTitle}</p>
                  <strong>{analysisBundle.question}</strong>
                  <p className="muted-copy">
                    {analysisBundle.files.length} · {analysisBundle.tokenBudget.truncated ? ui.shell.statusPartial : ui.shell.statusReady}
                  </p>
                </div>

                <div className="github-file-chip-row">
                  {analysisFiles.map((file) => (
                    <span key={file.path} className="reference-chip">
                      {file.path}
                    </span>
                  ))}
                </div>

                {analysisBundle.warnings.length > 0 ? (
                  <div className="github-warning-list">
                    {analysisBundle.warnings.map((warning) => (
                      <span key={warning} className="workflow-chip workflow-chip-idle">
                        {warning}
                      </span>
                    ))}
                  </div>
                ) : null}

                {proposalPlan ? (
                  <ProposalCard
                    testId="github-approval-surface"
                    title={proposalPlan.summary}
                    summary={proposalPlan.rationale}
                    consequence={
                      executionResult
                        ? ui.github.verifyResult
                        : ui.github.approveHelper
                    }
                    statusLabel={
                      proposalPlan.stale
                        ? ui.github.staleProposal
                        : executionResult
                          ? verificationResult?.status === "verified"
                            ? ui.matrix.topicStatusVerified
                            : ui.matrix.topicStatusOpen
                          : ui.review.approvalNeeded
                    }
                    statusTone={
                      proposalPlan.stale
                        ? "error"
                        : executionResult
                          ? verificationResult?.status === "verified"
                            ? "ready"
                            : "partial"
                          : "partial"
                    }
                    metadata={mergeMetadataRows(
                      buildGovernanceMetadataRows({
                        actingIdentity: BACKEND_TRUTH_UNAVAILABLE,
                        activeScope: `${selectedRepo?.fullName ?? selectedRepoFullName ?? ui.common.na}@${proposalPlan.baseRef}`,
                        authorityDomain: localText.authorityDomain,
                        targetScope: `${selectedRepo?.fullName ?? selectedRepoFullName ?? ui.common.na}@${proposalPlan.targetBranch}`,
                        executionDomain: localText.executionDomain,
                        executionTarget: `${proposalPlan.branchName} -> ${proposalPlan.targetBranch}`,
                        provenanceSummary: localText.planSummary(proposalPlan.planId),
                        receiptSummary: executionResult
                          ? verificationResult?.status ?? localText.reviewReceiptExecutionPending
                          : localText.reviewReceiptPending,
                      }),
                      [{ label: localText.riskLabel, value: proposalPlan.riskLevel }]
                    )}
                  >
                    <div className="github-plan-file-grid">
                      {proposalFiles.map((file) => (
                        <article key={file.path} className="github-plan-file-card">
                          <strong>{file.path}</strong>
                          <p>{file.changeType === "modified" ? ui.github.planFileModified : ui.github.planFileChanged}</p>
                        </article>
                      ))}
                    </div>

                    {proposalPlan.stale ? (
                      <p className="warning-banner" role="status" data-testid="github-stale-proposal">
                        {ui.github.staleProposal}
                      </p>
                    ) : null}

                    {!executionResult ? (
                      <>
                        {executing || verifying ? (
                          <ApprovalTransitionCard
                            testId="github-approval-transition"
                            title={ui.github.approving}
                            detail={ui.github.approveHelper}
                          />
                        ) : null}
                        <DecisionZone
                          testId="github-decision-zone"
                          approveLabel={executing ? ui.github.approving : ui.github.approveLabel}
                          rejectLabel={ui.github.rejectLabel}
                          onApprove={() => {
                            void handleExecuteProposal();
                          }}
                          onReject={() => {
                            setApprovalChecked(false);
                            setEventTrail((current) => [...current, ui.github.rejectLabel].slice(-4));
                            props.onTelemetry("warning", localText.telemetryProposalRejected, localText.telemetryProposalRejectedDetail);
                          }}
                          approveDisabled={approvalLocked}
                          rejectDisabled={approvalLocked}
                          busy={executing || verifying}
                          helperText={ui.github.approveHelper}
                        />
                      </>
                    ) : null}
                  </ProposalCard>
                ) : (
                  <div className="github-plan-empty">
                    <p className="muted-copy">
                      {ui.github.proposalEmpty}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="github-review-empty">
                <p className="empty-state">
                  {ui.github.reviewEmpty}
                </p>
              </div>
            )}
          </article>

          {proposalPlan && executionResult ? (
                  <ExecutionReceiptCard
              title={resultCopy.detail}
              detail={ui.github.verifyResult}
              outcome={
                verificationResult?.status === "failed"
                  ? "failed"
                  : verificationResult?.status === "mismatch"
                    ? "unverifiable"
                    : verificationResult?.status === "verified"
                      ? "executed"
                      : "executed"
              }
              metadata={mergeMetadataRows(
                buildGovernanceMetadataRows({
                  actingIdentity: BACKEND_TRUTH_UNAVAILABLE,
                  activeScope: `${selectedRepo?.fullName ?? selectedRepoFullName ?? ui.common.na}@${proposalPlan.baseRef}`,
                  authorityDomain: localText.authorityDomain,
                  targetScope: `${selectedRepo?.fullName ?? selectedRepoFullName ?? ui.common.na}@${executionResult.targetBranch}`,
                  executionDomain: localText.executionDomain,
                  executionTarget: `PR #${executionResult.prNumber}`,
                  provenanceSummary: localText.planSummary(executionResult.planId),
                  receiptSummary: verificationResult?.status ?? localText.verificationPending,
                }),
                [
                  {
                    label: ui.github.targetBranch,
                    value: props.expertMode ? executionResult.targetBranch : friendlyTargetBranchLabel(executionResult.targetBranch, selectedRepo, locale),
                  },
                  { label: localText.commitLabel, value: executionResult.commitSha },
                  { label: ui.github.verifyResult, value: verificationResult?.status ?? ui.common.loading },
                ]
              )}
              testId="github-pr-result"
            >
              {executionResult.prUrl ? (
                <p>
                  <a
                    href={executionResult.prUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="secondary-button github-pr-link"
                  >
                    {ui.github.openInGitHub}
                  </a>
                </p>
              ) : null}

              <div className="action-row">
                <span className="muted-copy">
                  {verificationResult ? verificationResult.status : ui.github.verifyResult}
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    void handleVerifyProposal();
                  }}
                  disabled={verifyDisabled}
                >
                  {verifying ? ui.github.verifyBusy : ui.github.verifyResult}
                </button>
              </div>
            </ExecutionReceiptCard>
          ) : null}

          <ExpertDetails
            expertMode={props.expertMode}
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
        </>
      )}
    </section>
  );
}
