import { useEffect, useMemo, useRef, useState } from "react";
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
  backendHealthLabel: string | null;
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

function createId() {
  return crypto.randomUUID();
}

function formatRepoStatus(status: GitHubRepoSummary["status"]) {
  switch (status) {
    case "ready":
      return "Bereit";
    case "blocked":
      return "Gesperrt";
    default:
      return "Nicht verbunden";
  }
}

function formatRepoVisibility(isPrivate: boolean) {
  return isPrivate ? "Privat" : "Öffentlich";
}

function friendlyRepoLabel(index: number, expertMode: boolean, fullName: string) {
  return expertMode ? fullName : `Repository ${index + 1}`;
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

function verificationStatusCopy(result: GitHubVerifyResult | null) {
  switch (result?.status) {
    case "verified":
      return {
        label: "Geprüft",
        tone: "ready" as const,
        detail: "Der Pull Request wurde bestätigt.",
      };
    case "pending":
      return {
        label: "Prüfung läuft oder ist noch nicht eindeutig",
        tone: "partial" as const,
        detail: "Die Backend-Prüfung ist noch nicht abgeschlossen.",
      };
    case "mismatch":
      return {
        label: "Abweichung gefunden",
        tone: "error" as const,
        detail: "Die Prüfung passt nicht zum freigegebenen Vorschlag.",
      };
    case "failed":
      return {
        label: "Prüfung fehlgeschlagen",
        tone: "error" as const,
        detail: "Die Backend-Prüfung konnte nicht abgeschlossen werden.",
      };
    default:
      return {
        label: "Bereit zur Prüfung auf GitHub",
        tone: "partial" as const,
        detail: "Der Pull Request wurde erstellt.",
      };
  }
}

function resultStatusCopy(
  executionResult: GitHubExecuteResult | null,
  verificationResult: GitHubVerifyResult | null,
  verifying: boolean,
) {
  if (!executionResult) {
    return {
      label: "Noch nicht gestartet",
      tone: "partial" as const,
      detail: "Noch kein Pull Request erstellt.",
    };
  }

  if (!verificationResult) {
    return verifying
      ? {
          label: "Prüfung läuft oder ist noch nicht eindeutig",
          tone: "partial" as const,
          detail: "Der Pull Request wird jetzt geprüft.",
        }
      : {
          label: "Bereit zur Prüfung auf GitHub",
          tone: "partial" as const,
          detail: "Der Pull Request wurde erstellt.",
        };
  }

  const copy = verificationStatusCopy(verificationResult);

  return {
    label: copy.label,
    tone: copy.tone,
    detail: copy.detail,
  };
}

function friendlyTargetBranchLabel(targetBranch: string | null, repo: GitHubRepoSummary | null) {
  if (!targetBranch) {
    return "Hauptzweig";
  }

  if (repo && targetBranch === repo.defaultBranch) {
    return "Hauptzweig";
  }

  return "Zielzweig";
}

export function GitHubWorkspace(props: GitHubWorkspaceProps) {
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

        setReposError(error instanceof Error ? error.message : "GitHub-Repos konnten nicht geladen werden.");
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
  }, []);

  const selectedRepo = useMemo(
    () => repos.find((repo) => repo.fullName === selectedRepoFullName) ?? null,
    [repos, selectedRepoFullName],
  );

  const connectionLabel = props.backendHealthy === true
    ? "Bereit"
    : "Nicht verbunden";
  const accessLabel = "Nur Lesen";
  const analysisLabel = proposalPlan
    ? "Plan erstellt"
    : analysisBundle
      ? "Bereit"
      : "Noch nicht gestartet";
  const proposalLabel = proposalPlan
    ? executionResult
      ? "Ausgeführt"
      : "Bereit zur Prüfung"
    : analysisBundle
      ? "Bereit"
      : "Noch nicht erstellt";
  const approvalLabel = proposalPlan && !executionResult ? "Wartet auf dich" : "Nicht erforderlich";
  const resultCopy = resultStatusCopy(executionResult, verificationResult, verifying);
  const selectedRepoLabel = selectedRepo
    ? props.expertMode
      ? selectedRepo.fullName
      : "Repo ausgewählt"
    : "Noch kein GitHub-Repo ausgewählt";
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
    || !approvalChecked
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
      safetyText: "Die App kann Informationen ansehen, aber nichts verändern.",
      expertDetails: {
        requestId: currentRequestId,
        planId: proposalPlan?.planId ?? null,
        branchName: proposalPlan?.branchName ?? null,
        apiStatus: props.backendHealthy === false ? "Nicht verbunden" : "Backend-Routen aktiv",
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
      props.onReviewItemsChange(
        proposalPlan
          ? [
              {
                id: proposalPlan.planId,
                source: "github",
                title: proposalPlan.summary,
                summary: proposalPlan.rationale,
                status: proposalPlan.stale
                  ? "stale"
                  : verificationResult?.status === "verified"
                    ? "executed"
                    : "pending_review",
                stale: proposalPlan.stale,
                sourceLabel: "GitHub Workspace",
              },
            ]
          : [],
      );
    }
  }, [proposalPlan, props.onReviewItemsChange, verificationResult?.status]);

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
    props.onTelemetry("info", "GitHub repo changed", nextFullName || "No repo selected.");
  }

  async function runAnalysis() {
    if (!selectedRepo) {
      setAnalysisError("Wähle zuerst ein erlaubtes Repo aus.");
      return;
    }

    const nextRequestId = createId();
    setRequestId(nextRequestId);
    setAnalysisLoading(true);
    setAnalysisError(null);
    setProposalError(null);
    setProposalPlan(null);
    setEventTrail((current) => [...current, `Analyse gestartet · ${nextRequestId}`].slice(-4));
    props.onTelemetry("info", "GitHub analysis started", `Repo ${selectedRepo.fullName} wird lesend untersucht.`);

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
      setEventTrail((current) => [...current, `Analyse bereit · ${response.context.files.length} Datei(en)`].slice(-4));
      props.onTelemetry("info", "GitHub analysis ready", `${response.context.files.length} Datei(en) wurden gelesen.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Die GitHub-Analyse konnte nicht gestartet werden.";
      setAnalysisError(message);
      setEventTrail((current) => [...current, "Analyse fehlgeschlagen"].slice(-4));
      props.onTelemetry("error", "GitHub analysis failed", message);
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function createProposal() {
    if (!selectedRepo) {
      setProposalError("Wähle zuerst ein erlaubtes Repo aus.");
      return;
    }

    if (!analysisBundle) {
      setProposalError("Starte zuerst die Analyse.");
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
    setEventTrail((current) => [...current, `Vorschlag angefordert · ${nextRequestId}`].slice(-4));
    props.onTelemetry("info", "GitHub proposal requested", `Ein Vorschlag für ${selectedRepo.fullName} wird vorbereitet.`);

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
        constraints: ["Nur lesend vorbereiten", "Keine direkte Ausführung"],
        baseBranch: selectedRepo.defaultBranch,
      });

      setProposalPlan(response.plan);
      setEventTrail((current) => [...current, `Vorschlag bereit · ${response.plan.planId}`].slice(-4));
      props.onTelemetry("info", "GitHub proposal ready", `Plan ${response.plan.planId} wurde im Backend vorbereitet.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Der Änderungsvorschlag konnte nicht erstellt werden.";
      setProposalError(message);
      setEventTrail((current) => [...current, "Vorschlag fehlgeschlagen"].slice(-4));
      props.onTelemetry("error", "GitHub proposal failed", message);
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
    setEventTrail((current) => [...current, `Freigabe gesendet · ${proposalPlan.planId}`].slice(-4));
    props.onTelemetry("info", "GitHub approval submitted", "Freigabe an das Backend gesendet.");

    try {
      const executionResponse = await executeGitHubPlan(proposalPlan.planId, { approval: true });
      setExecutionResult(executionResponse.result);
      setProposalPlan((current) => (current ? {
        ...current,
        status: "executed",
        execution: executionResponse.result,
      } : current));
      setApprovalChecked(false);
      setEventTrail((current) => [...current, `Pull Request erstellt · ${executionResponse.result.prNumber}`].slice(-4));
      props.onTelemetry(
        "info",
        "GitHub execution ready",
        `Pull Request ${executionResponse.result.prNumber} wurde erstellt.`,
      );

      setVerifying(true);
      try {
        const verificationResponse = await verifyGitHubPlan(proposalPlan.planId);
        setVerificationResult(verificationResponse.verification);
        setProposalPlan((current) => (current ? {
          ...current,
          verification: verificationResponse.verification,
        } : current));
        setEventTrail((current) => [...current, `PR geprüft · ${verificationResponse.verification.status}`].slice(-4));
        props.onTelemetry(
          "info",
          "GitHub verification ready",
          `PR wurde mit Status ${verificationResponse.verification.status} geprüft.`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Die GitHub-Prüfung konnte nicht abgeschlossen werden.";
        setVerificationError(message);
        setEventTrail((current) => [...current, "PR-Prüfung fehlgeschlagen"].slice(-4));
        props.onTelemetry("error", "GitHub verification failed", message);
      } finally {
        setVerifying(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Die GitHub-Ausführung konnte nicht gestartet werden.";
      setExecutionError(message);
      setApprovalChecked(false);
      setEventTrail((current) => [...current, "Ausführung fehlgeschlagen"].slice(-4));
      props.onTelemetry("error", "GitHub execution failed", message);
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
    setEventTrail((current) => [...current, `PR-Prüfung angefordert · ${proposalPlan.planId}`].slice(-4));

    try {
      const verificationResponse = await verifyGitHubPlan(proposalPlan.planId);
      setVerificationResult(verificationResponse.verification);
      setProposalPlan((current) => (current ? {
        ...current,
        verification: verificationResponse.verification,
      } : current));
      props.onTelemetry(
        "info",
        "GitHub verification ready",
        `PR wurde mit Status ${verificationResponse.verification.status} geprüft.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Die GitHub-Prüfung konnte nicht abgeschlossen werden.";
      setVerificationError(message);
      setEventTrail((current) => [...current, "PR-Prüfung fehlgeschlagen"].slice(-4));
      props.onTelemetry("error", "GitHub verification failed", message);
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
      : "Bereit zur Freigabe"
    : analysisBundle
      ? "Analyse abgeschlossen"
      : "Noch keine Analyse";
  const proposalBadge = proposalPlan
    ? executionResult
      ? resultCopy.label
      : "Freigabe nötig"
    : analysisBundle
      ? "Nur Lesen"
      : "Noch nicht gestartet";
  const nextStepTitle = !hasSelection
    ? "Nächster Schritt: Wähle ein GitHub-Repo aus."
    : proposalPlan
      ? "Nächster Schritt: Vorschlag prüfen."
      : "Nächster Schritt: Analyse starten.";
  const nextStepDescription = !hasSelection
    ? "Die KI kann danach Dateien lesen, den Projektstand verstehen und einen sicheren Analyseplan vorbereiten."
    : proposalPlan
      ? "Änderungen werden erst nach deiner Freigabe vorbereitet oder ausgeführt."
      : "Die Analyse ist nur lesend. Es werden keine Dateien geändert.";

  return (
    <section className="workspace-panel github-workspace" data-testid="github-workspace">
      <section className="workspace-hero github-hero">
        <div>
          <p className={`status-pill ${hasSelection ? "status-ready" : "status-partial"}`}>
            {hasSelection ? "Nur Lesen aktiv" : "Repo auswählen"}
          </p>
          <h1>GitHub Workspace</h1>
          <p className="hero-copy">
            Repo ansehen, Projektstruktur verstehen und sichere Änderungsvorschläge vorbereiten.
          </p>
        </div>

        <aside className="mini-panel github-mini-panel">
          <label htmlFor="github-repo-select">Repo auswählen</label>
          <select
            id="github-repo-select"
            ref={repoSelectRef}
            value={selectedRepoFullName}
            onChange={(event) => handleRepoChange(event.target.value)}
            disabled={reposLoading || repos.length === 0}
          >
            <option value="">
              {reposLoading ? "Lade erlaubte Repos…" : "Repo auswählen"}
            </option>
            {repos.map((repo, index) => (
              <option key={repo.fullName} value={repo.fullName}>
                {friendlyRepoLabel(index, props.expertMode, repo.fullName)}
              </option>
            ))}
          </select>

          {selectedRepo ? (
            <article className="github-repo-card">
              <div className="github-repo-card-header">
                <div>
                  <span>Verbundenes Repo</span>
                  <strong>{props.expertMode ? selectedRepo.fullName : "Repo ausgewählt"}</strong>
                </div>
                <span className="status-pill status-ready">{accessLabel}</span>
              </div>
              <div className="github-repo-meta">
                <span>{formatRepoVisibility(selectedRepo.isPrivate)}</span>
                <span>•</span>
                <span>{props.expertMode ? `Hauptzweig: ${selectedRepo.defaultBranch}` : "Nur Lesestatus"}</span>
                <span>•</span>
                <span>Status: {formatRepoStatus(selectedRepo.status)}</span>
              </div>
              <p>{selectedRepo.description ?? "Keine Beschreibung vorhanden."}</p>
              <p className="muted-copy">{props.backendHealthLabel ?? "Backendstatus wird geladen."}</p>
            </article>
          ) : (
            <p>{reposLoading ? "Erlaubte Repos werden geladen." : "Nur erlaubte Repos werden angezeigt."}</p>
          )}
        </aside>
      </section>

      <div className="github-safety-strip">
        <span className="status-pill status-ready">Nur Lesen aktiv</span>
        <p>Keine Änderungen. Nur nach Freigabe.</p>
        <span className="status-pill status-partial">Nur nach Freigabe</span>
      </div>

      <article className={`github-next-step ${hasSelection ? "github-next-step-ready" : "github-next-step-empty"}`}>
        <div>
          <p className="info-label">Nächster Schritt</p>
          <strong>{nextStepTitle}</strong>
          <p>{nextStepDescription}</p>
        </div>
        <span className={`status-pill ${proposalPlan ? "status-partial" : "status-ready"}`}>
          {proposalPlan ? "Freigabe nötig" : "Nur Lesen"}
        </span>
      </article>

      {reposError ? <p className="error-banner" role="alert">{reposError}</p> : null}

      {!hasSelection ? (
        <article className="empty-state-card">
          <div className="empty-state-card-copy">
            <p className="info-label">GitHub Workspace</p>
            <h2>Noch kein GitHub-Repo ausgewählt</h2>
            <p>
              Wähle ein erlaubtes Repo aus. Danach kann die KI Dateien lesen und einen sicheren Analyseplan erstellen.
            </p>
          </div>

          <ol className="guided-steps">
            <li>Repo auswählen</li>
            <li>Analyse starten</li>
            <li>Vorschlag prüfen</li>
            <li>Erst nach Freigabe ändern</li>
          </ol>

          <div className="action-row">
            <button
              type="button"
              onClick={() => repoSelectRef.current?.focus()}
              disabled={reposLoading || repos.length === 0}
            >
              Repo auswählen
            </button>
            <span className="muted-copy">Nur erlaubte Repos werden angezeigt</span>
          </div>
        </article>
      ) : (
        <>
          <div className="github-action-grid">
            <article className="workspace-card github-action-card">
              <header className="card-header">
                <div>
                  <span>Projekt lesen</span>
                  <strong>Projektstruktur prüfen</strong>
                </div>
                <span className="status-pill status-ready">Nur Lesen</span>
              </header>
              <p>Die KI liest Ordner und Dateien, um den Aufbau deines Projekts zu verstehen.</p>
              <div className="action-row">
                <button
                  type="button"
                  onClick={() => {
                    void runAnalysis();
                  }}
                  disabled={analysisLoading}
                >
                  {analysisLoading ? "Analyse läuft…" : "Analyse starten"}
                </button>
                <span className="muted-copy">Keine Änderungen</span>
              </div>
            </article>

            <article className="workspace-card github-action-card">
              <header className="card-header">
                <div>
                  <span>Freigabe nötig</span>
                  <strong>Änderungsvorschlag vorbereiten</strong>
                </div>
                <span className="status-pill status-partial">Freigabe nötig</span>
              </header>
              <p>Die KI erstellt einen Plan, den du zuerst prüfen und freigeben musst.</p>
              <div className="action-row">
                <button
                  type="button"
                  onClick={() => {
                    void createProposal();
                  }}
                  disabled={proposalLoading || !analysisBundle}
                >
                  {proposalLoading ? "Vorschlag entsteht…" : "Vorschlag erstellen"}
                </button>
                <span className="muted-copy">Nur nach Freigabe</span>
              </div>
            </article>
          </div>

          {analysisError ? <p className="error-banner" role="alert">{analysisError}</p> : null}
          {proposalError ? <p className="error-banner" role="alert">{proposalError}</p> : null}

          <article className="workspace-card github-review-card">
            <header className="card-header">
              <div>
                <span>Vorschlag prüfen</span>
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
                  <p className="info-label">Letzte Analyse</p>
                  <strong>{analysisBundle.question}</strong>
                  <p className="muted-copy">
                    {analysisBundle.files.length} Datei(en) gelesen · {analysisBundle.tokenBudget.truncated ? "Budget wurde ausgeschöpft" : "Budget eingehalten"}
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
                  <div className="github-plan-summary">
                    <div className="github-plan-header">
                      <div>
                        <p className="info-label">Vorbereiteter Vorschlag</p>
                        <strong>{proposalPlan.summary}</strong>
                      </div>
                      <span className="status-pill status-partial">Freigabe nötig</span>
                    </div>

                    <p>{proposalPlan.rationale}</p>

                    <div className="github-plan-file-grid">
                      {proposalFiles.map((file) => (
                        <article key={file.path} className="github-plan-file-card">
                          <strong>{file.path}</strong>
                          <p>{file.changeType === "modified" ? "Datei wird angepasst." : "Datei wird geändert."}</p>
                        </article>
                      ))}
                    </div>

                    <div className="github-approval-gate" data-testid="github-approval-gate">
                      <p className="info-label">Freigabe nötig</p>
                      <label className="approval-check">
                        <input
                          type="checkbox"
                          checked={approvalChecked}
                          onChange={(event) => {
                            setApprovalChecked(event.target.checked);
                          }}
                          disabled={approvalLocked}
                        />
                        <span>Ich habe den Vorschlag geprüft und möchte einen Pull Request erstellen.</span>
                      </label>
                      <div className="action-row">
                        <span className="muted-copy">Ergebnis prüfen</span>
                        <button
                          type="button"
                          onClick={() => {
                            void handleExecuteProposal();
                          }}
                          disabled={executeDisabled}
                        >
                          {executing ? "Freigabe wird verarbeitet…" : "Freigeben und ausführen"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="github-plan-empty">
                    <p className="muted-copy">
                      Die nächste sichere Aktion ist bereit. Starte jetzt einen Vorschlag, wenn du Änderungen prüfen möchtest.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="github-review-empty">
                <p className="empty-state">
                  Starte zuerst die Analyse. Danach kann die KI einen sicheren Vorschlag vorbereiten.
                </p>
              </div>
            )}
          </article>

          {proposalPlan && stalePlanBlocked ? (
            <p className="warning-banner" role="alert" data-testid="github-stale-plan-warning">
              Der Vorschlag ist veraltet und muss neu erstellt werden.
            </p>
          ) : null}

          {executionError && !stalePlanBlocked ? (
            <p className="error-banner" role="alert" data-testid="github-execution-error">
              {executionError}
            </p>
          ) : null}

          {verificationError ? (
            <p className="error-banner" role="alert" data-testid="github-verification-error">
              {verificationError}
            </p>
          ) : null}

          {proposalPlan && executionResult ? (
            <article className="workspace-card github-plan-summary github-pr-result-card" data-testid="github-pr-result">
              <div className="github-plan-header">
                <div>
                  <p className="info-label">Pull Request erstellt</p>
                  <strong>{resultCopy.detail}</strong>
                </div>
                <span className={`status-pill status-${resultCopy.tone}`}>
                  {resultCopy.label}
                </span>
              </div>

              <div className="github-result-copy">
                <p className="muted-copy">Bereit zur Prüfung auf GitHub.</p>
                <p>
                  {props.expertMode
                    ? `Zielzweig: ${executionResult.targetBranch}`
                    : `Ziel: ${friendlyTargetBranchLabel(executionResult.targetBranch, selectedRepo)}`}
                </p>
                {executionResult.prUrl ? (
                  <a
                    href={executionResult.prUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="secondary-button github-pr-link"
                  >
                    Auf GitHub öffnen
                  </a>
                ) : null}
              </div>

              <div className="action-row">
                <span className="muted-copy">
                  {verificationResult ? verificationResult.status : "Ergebnis prüfen"}
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    void handleVerifyProposal();
                  }}
                  disabled={verifyDisabled}
                >
                  {verifying ? "Prüfung läuft…" : "Ergebnis prüfen"}
                </button>
              </div>
            </article>
          ) : null}

          <ExpertDetails
            expertMode={props.expertMode}
            rows={[
              { label: "Erlaubtes Repo", value: selectedRepo?.fullName ?? "n/a" },
              { label: "Anfrage-ID", value: requestId ?? "n/a" },
              { label: "Plan-ID", value: proposalPlan?.planId ?? "n/a" },
              { label: "Branch", value: proposalPlan?.branchName ?? "n/a" },
              { label: "Commit", value: executionResult?.commitSha ?? "n/a" },
              { label: "Pull Request", value: executionResult?.prNumber ? `#${executionResult.prNumber}` : "n/a" },
              { label: "Zielzweig", value: executionResult?.targetBranch ?? proposalPlan?.targetBranch ?? "n/a" },
              { label: "GitHub API Status", value: props.backendHealthy === false ? "Nicht verbunden" : "Backend-Route aktiv" },
              { label: "Verifikation", value: verificationResult?.status ?? "n/a" },
              { label: "Laufzeit-Ereignisse", value: eventTrail.length > 0 ? eventTrail.join(" · ") : "Nicht relevant" },
            ]}
          >
            {executionResult?.prUrl ? (
              <p>
                Pull Request URL:{" "}
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
                Diff erscheint erst nach einem vorbereiteten Vorschlag.
              </p>
            )}
          </ExpertDetails>
        </>
      )}
    </section>
  );
}
