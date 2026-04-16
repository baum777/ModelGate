import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchGitHubContext,
  fetchGitHubRepos,
  proposeGitHubAction,
  type GitHubChangePlan,
  type GitHubContextBundle,
  type GitHubRepoSummary,
} from "../lib/github-api.js";

export type GitHubWorkspaceStatus = {
  repositoryLabel: string;
  connectionLabel: string;
  accessLabel: string;
  analysisLabel: string;
  approvalLabel: string;
  requestId: string | null;
  planId: string | null;
  branchName: string | null;
  apiStatus: string;
  sseEvents: string[];
  rawDiffPreview: string | null;
  selectedRepoSlug: string | null;
  safetyTip: string;
};

type GitHubWorkspaceProps = {
  backendHealthy: boolean | null;
  backendHealthLabel: string | null;
  expertMode: boolean;
  onTelemetry: (
    kind: "info" | "warning" | "error",
    label: string,
    detail?: string,
  ) => void;
  onContextChange: (status: GitHubWorkspaceStatus) => void;
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

export function GitHubWorkspace(props: GitHubWorkspaceProps) {
  const [repos, setRepos] = useState<GitHubRepoSummary[]>([]);
  const [reposLoading, setReposLoading] = useState(true);
  const [reposError, setReposError] = useState<string | null>(null);
  const [selectedRepoFullName, setSelectedRepoFullName] = useState("");
  const [analysisBundle, setAnalysisBundle] = useState<GitHubContextBundle | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [proposalPlan, setProposalPlan] = useState<GitHubChangePlan | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [eventTrail, setEventTrail] = useState<string[]>([]);
  const repoSelectRef = useRef<HTMLSelectElement | null>(null);

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
  const approvalLabel = proposalPlan ? "Wartet auf dich" : "Nicht erforderlich";
  const selectedRepoLabel = selectedRepo?.fullName ?? "Noch kein GitHub-Repo ausgewählt";
  const rawDiffPreview = props.expertMode ? buildRawDiffPreview(proposalPlan) : null;
  const currentRequestId = requestId;

  useEffect(() => {
    props.onContextChange({
      repositoryLabel: selectedRepoLabel,
      connectionLabel,
      accessLabel,
      analysisLabel,
      approvalLabel,
      requestId: currentRequestId,
      planId: proposalPlan?.planId ?? null,
      branchName: proposalPlan?.branchName ?? null,
      apiStatus: props.backendHealthy === false ? "Nicht verbunden" : "Backend-Routen aktiv",
      sseEvents: eventTrail,
      rawDiffPreview,
      selectedRepoSlug: selectedRepo?.fullName ?? null,
      safetyTip:
        "Solange 'Nur Lesen' aktiv ist, kann die App keine Dateien ändern oder Commits erstellen.",
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
  ]);

  function resetReviewState() {
    setAnalysisBundle(null);
    setAnalysisError(null);
    setProposalPlan(null);
    setProposalError(null);
    setRequestId(null);
    setEventTrail([]);
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

  const hasSelection = Boolean(selectedRepo);
  const analysisFiles = analysisBundle?.files ?? [];
  const proposalFiles = proposalPlan?.diff ?? [];
  const proposalReady = Boolean(proposalPlan);
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
            {hasSelection ? "Nur Lesen aktiv" : "GitHub bereit"}
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
            {repos.map((repo) => (
              <option key={repo.fullName} value={repo.fullName}>
                {repo.fullName}
              </option>
            ))}
          </select>

          {selectedRepo ? (
            <article className="github-repo-card">
              <div className="github-repo-card-header">
                <div>
                  <span>Verbundenes Repo</span>
                  <strong>{selectedRepo.fullName}</strong>
                </div>
                <span className="status-pill status-ready">{accessLabel}</span>
              </div>
              <div className="github-repo-meta">
                <span>{formatRepoVisibility(selectedRepo.isPrivate)}</span>
                <span>•</span>
                <span>Hauptzweig: {selectedRepo.defaultBranch}</span>
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
        <p>Die KI kann dein Repo ansehen, aber keine Dateien verändern.</p>
        <span className="status-pill status-partial">Änderungen passieren erst nach deiner Freigabe.</span>
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
                <span className="muted-copy">Keine Änderungen am Repo</span>
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
                <span className="muted-copy">Wird nicht automatisch ausgeführt</span>
              </div>
            </article>
          </div>

          {analysisError ? <p className="error-banner" role="alert">{analysisError}</p> : null}
          {proposalError ? <p className="error-banner" role="alert">{proposalError}</p> : null}

          <article className="workspace-card github-review-card">
            <header className="card-header">
              <div>
                <span>Vorschlag prüfen</span>
                <strong>
                  {proposalReady ? "Bereit zur Freigabe" : analysisBundle ? "Analyse abgeschlossen" : "Noch keine Analyse"}
                </strong>
              </div>
              <div className="plan-badges">
                <span className={`workflow-chip ${proposalReady ? "workflow-chip-active" : "workflow-chip-idle"}`}>
                  {proposalReady ? "Freigabe nötig" : analysisBundle ? "Nur Lesen" : "Noch nicht gestartet"}
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

                    <div className="action-row">
                      <span className="muted-copy">Änderungen werden erst nach deiner Freigabe vorbereitet oder ausgeführt.</span>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          props.onTelemetry(
                            "info",
                            "GitHub proposal reviewed",
                            proposalPlan.planId,
                          );
                        }}
                      >
                        Vorschlag prüfen
                      </button>
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

          {props.expertMode ? (
            <details className="github-expert-details" open>
              <summary>Technische Details</summary>
              <div className="github-expert-grid">
                <div>
                  <span>Erlaubtes Repo</span>
                  <strong>{selectedRepo?.fullName ?? "n/a"}</strong>
                </div>
                <div>
                  <span>Anfrage-ID</span>
                  <strong>{requestId ?? "n/a"}</strong>
                </div>
                <div>
                  <span>Plan-ID</span>
                  <strong>{proposalPlan?.planId ?? "n/a"}</strong>
                </div>
                <div>
                  <span>Branch</span>
                  <strong>{proposalPlan?.branchName ?? "n/a"}</strong>
                </div>
                <div>
                  <span>GitHub API Status</span>
                  <strong>{props.backendHealthy === false ? "Nicht verbunden" : "Backend-Route aktiv"}</strong>
                </div>
                <div>
                  <span>Laufzeit-Ereignisse</span>
                  <strong>{eventTrail.length > 0 ? eventTrail.join(" · ") : "Nicht relevant"}</strong>
                </div>
              </div>
              {rawDiffPreview ? (
                <pre className="github-diff-preview">{rawDiffPreview}</pre>
              ) : (
                <p className="muted-copy">
                  Raw diff preview erscheint erst nach einem vorbereiteten Vorschlag.
                </p>
              )}
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}
