import { useEffect, useMemo, useState } from "react";
import { ExpertDetails } from "./ExpertDetails.js";
import {
  MATRIX_API_BASE_URL,
  analyzeScope,
  executePlan,
  executeRoomTopicUpdate,
  fetchJoinedRooms,
  fetchMatrixWhoAmI,
  fetchPlan,
  fetchProvenance,
  fetchRoomHierarchy,
  fetchScopeSummary,
  promoteCandidate,
  prepareRoomTopicUpdate,
  fetchRoomTopicUpdatePlan,
  resolveScope,
  MatrixRequestError,
  type MatrixActionCandidate,
  type MatrixExecutionResult,
  type MatrixJoinedRoom,
  type MatrixPlan,
  type MatrixProvenance,
  type MatrixRoomTopicExecutionResult,
  type MatrixRoomTopicPlan,
  type MatrixRoomTopicVerificationResult,
  type MatrixScope,
  type MatrixScopeSummary,
  type MatrixSpaceHierarchy,
  type MatrixWhoAmI,
  verifyRoomTopicUpdate,
} from "../lib/matrix-api.js";
import type { ReviewItem } from "./ReviewWorkspace.js";

type MatrixMode = "explore" | "analyze" | "review";
type WorkflowStatus = "loading" | "partial" | "ready" | "error";
type LoadStatus = "idle" | "loading" | "ready" | "error";

export type MatrixWorkspaceStatus = {
  scopeLabel: string;
  summaryLabel: string;
  approvalLabel: string;
  safetyText: string;
  expertDetails: {
    route: string;
    requestId: string | null;
    planId: string | null;
    roomId: string | null;
    spaceId: string | null;
    eventId: string | null;
    httpStatus: number | null;
    latency: string | null;
    backendRouteStatus: string;
    runtimeEventTrail: string[];
    sseLifecycle: string;
    rawPayload: string | null;
  };
  reviewItems: ReviewItem[];
};

type MatrixWorkspaceProps = {
  restoredSession: boolean;
  expertMode: boolean;
  onTelemetry: (
    kind: "info" | "warning" | "error",
    label: string,
    detail?: string,
  ) => void;
  onContextChange: (status: MatrixWorkspaceStatus) => void;
  onReviewItemsChange?: (items: ReviewItem[]) => void;
};

type PersistedMatrixState = {
  mode?: MatrixMode;
  selectedRoomIds?: string[];
  selectedSpaceIds?: string[];
  analysisPrompt?: string;
};

const STORAGE_KEY = "modelgate.console.matrix.v1";
const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
};
const text = (value: string | null | undefined) =>
  value && value.trim() ? value : "n/a";
const legacyContractOnlyNotice =
  "Contract-only surface. Backend-owned room topic updates are wired below.";

function modeLabel(mode: MatrixMode) {
  switch (mode) {
    case "analyze":
      return "Analyze";
    case "review":
      return "Review";
    default:
      return "Explore";
  }
}

function readPersistedState(): PersistedMatrixState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedMatrixState) : null;
  } catch {
    return null;
  }
}

function persistState(state: PersistedMatrixState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function describeMatrixError(operation: string, error: unknown) {
  if (error instanceof MatrixRequestError) {
    if (error.kind === "network") {
      return `${operation} could not reach ${error.baseUrl}${error.path}: ${error.message}`;
    }
    if (error.kind === "parse") {
      return `${operation} returned an unreadable response from ${error.baseUrl}${error.path}: ${error.message}`;
    }
    const statusSuffix = error.status ? ` ${error.status}` : "";
    const codeSuffix = error.code ? ` (${error.code})` : "";
    return `${operation} failed${statusSuffix}${codeSuffix}: ${error.message}`;
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${operation} failed: ${error.message}`;
  }
  return `${operation} failed`;
}
export function MatrixWorkspace(props: MatrixWorkspaceProps) {
  const persisted = readPersistedState();
  const [mode, setMode] = useState<MatrixMode>(persisted?.mode ?? "explore");
  const [status, setStatus] = useState<WorkflowStatus>("loading");
  const [whoami, setWhoami] = useState<MatrixWhoAmI | null>(null);
  const [joinedRooms, setJoinedRooms] = useState<MatrixJoinedRoom[]>([]);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>(
    persisted?.selectedRoomIds ?? [],
  );
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<string[]>(
    persisted?.selectedSpaceIds ?? [],
  );
  const [spaceInput, setSpaceInput] = useState("");
  const [currentScope, setCurrentScope] = useState<MatrixScope | null>(null);
  const [scopeSummary, setScopeSummary] = useState<MatrixScopeSummary | null>(
    null,
  );
  const [scopeSummaryStatus, setScopeSummaryStatus] =
    useState<LoadStatus>("idle");
  const [scopeSummaryError, setScopeSummaryError] = useState<string | null>(
    null,
  );
  const [scopeResolveLoading, setScopeResolveLoading] = useState(false);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [spaceHierarchy, setSpaceHierarchy] =
    useState<MatrixSpaceHierarchy | null>(null);
  const [spaceHierarchySpace, setSpaceHierarchySpace] = useState<string | null>(
    null,
  );
  const [spaceHierarchyLoading, setSpaceHierarchyLoading] = useState(false);
  const [spaceHierarchyError, setSpaceHierarchyError] = useState<string | null>(
    null,
  );
  const [analysisPrompt, setAnalysisPrompt] = useState(
    persisted?.analysisPrompt ??
      "Review the selected scope and identify bounded workspace actions.",
  );
  const [analysisResult, setAnalysisResult] = useState<{
    snapshotId: string;
    response: { role: "assistant"; content: string };
    references: Array<{ type: string; roomId: string; label: string }>;
    actionCandidates: MatrixActionCandidate[];
  } | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );
  const [promotedPlan, setPromotedPlan] = useState<MatrixPlan | null>(null);
  const [promotionLoading, setPromotionLoading] = useState(false);
  const [promotionError, setPromotionError] = useState<string | null>(null);
  const [planRefreshError, setPlanRefreshError] = useState<string | null>(null);
  const [planRefreshLoading, setPlanRefreshLoading] = useState(false);
  const [approvalPending, setApprovalPending] = useState(false);
  const [executionResult, setExecutionResult] =
    useState<MatrixExecutionResult | null>(null);
  const [executionLoading, setExecutionLoading] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [stalePlanDetected, setStalePlanDetected] = useState(false);
  const [provenanceRoomId, setProvenanceRoomId] = useState("");
  const [provenance, setProvenance] = useState<MatrixProvenance | null>(null);
  const [provenanceError, setProvenanceError] = useState<string | null>(null);
  const [provenanceLoading, setProvenanceLoading] = useState(false);
  const [topicRoomId, setTopicRoomId] = useState(
    persisted?.selectedRoomIds?.[0] ?? "",
  );
  const [topicText, setTopicText] = useState("");
  const [topicPlan, setTopicPlan] = useState<MatrixRoomTopicPlan | null>(null);
  const [topicApprovalPending, setTopicApprovalPending] = useState(false);
  const [topicExecution, setTopicExecution] =
    useState<MatrixRoomTopicExecutionResult | null>(null);
  const [topicVerification, setTopicVerification] =
    useState<MatrixRoomTopicVerificationResult | null>(null);
  const [topicPrepareLoading, setTopicPrepareLoading] = useState(false);
  const [topicPrepareError, setTopicPrepareError] = useState<string | null>(
    null,
  );
  const [topicExecuteLoading, setTopicExecuteLoading] = useState(false);
  const [topicExecuteError, setTopicExecuteError] = useState<string | null>(
    null,
  );
  const [topicVerifyLoading, setTopicVerifyLoading] = useState(false);
  const [topicVerifyError, setTopicVerifyError] = useState<string | null>(
    null,
  );
  const [topicPlanRefreshLoading, setTopicPlanRefreshLoading] =
    useState(false);
  const [topicPlanRefreshError, setTopicPlanRefreshError] = useState<
    string | null
  >(null);
  const summaryLoading = scopeSummaryStatus === "loading";
  const selectedSpaces = useMemo(
    () => selectedSpaceIds.filter((value) => value.trim().length > 0),
    [selectedSpaceIds],
  );
  const reviewPlan = promotedPlan ?? topicPlan;
  const matrixReviewItems = useMemo<ReviewItem[]>(() => {
    if (!reviewPlan) {
      return [];
    }

    const stale = Boolean(promotedPlan?.stale || stalePlanDetected);
    return [
      {
        id: reviewPlan.planId,
        source: "matrix" as const,
        title: promotedPlan?.summary ?? "Matrix Vorschlag",
        summary: promotedPlan?.rationale ?? "Freigabe erforderlich.",
        status: stale ? "stale" : "pending_review",
        stale,
        sourceLabel: "Matrix Workspace",
      },
    ];
  }, [promotedPlan?.rationale, promotedPlan?.stale, promotedPlan?.summary, promotedPlan, reviewPlan, stalePlanDetected, topicPlan]);
  const matrixExpertDetails = useMemo(
    () => ({
      route: "/api/matrix/*",
      requestId: null,
      planId: reviewPlan?.planId ?? null,
      roomId: promotedPlan?.targetRoomId ?? topicPlan?.roomId ?? (topicRoomId || null),
      spaceId: selectedSpaces[0] ?? null,
      eventId: null,
      httpStatus: null,
      latency: null,
      backendRouteStatus: status === "error" ? "Nicht verfügbar" : "Aktiv",
      runtimeEventTrail: [
        currentScope ? "Bereich gewählt" : "Noch kein Bereich gewählt",
        scopeSummary ? "Zusammenfassung bereit" : "Zusammenfassung ausstehend",
        reviewPlan ? "Vorschlag bereit" : "Kein Vorschlag",
      ],
      sseLifecycle: "n/a",
      rawPayload: analysisResult ? JSON.stringify(analysisResult, null, 2) : null,
    }),
    [
      analysisResult,
      currentScope,
      promotedPlan?.targetRoomId,
      reviewPlan,
      scopeSummary,
      selectedSpaces,
      status,
      topicPlan?.roomId,
      topicRoomId,
    ],
  );
  const matrixContextPayload = useMemo<MatrixWorkspaceStatus>(
    () => ({
      scopeLabel: currentScope ? "Bereich gewählt" : "Noch kein Bereich gewählt",
      summaryLabel: scopeSummary ? "Zusammenfassung bereit" : "Noch keine Zusammenfassung",
      approvalLabel: reviewPlan ? "Freigabe erforderlich" : "Nicht erforderlich",
      safetyText: "Die App kann Informationen ansehen, aber nichts verändern.",
      expertDetails: matrixExpertDetails,
      reviewItems: matrixReviewItems,
    }),
    [currentScope, matrixExpertDetails, matrixReviewItems, reviewPlan, scopeSummary],
  );

  useEffect(() => {
    props.onContextChange(matrixContextPayload);
    props.onReviewItemsChange?.(matrixReviewItems);
  }, [matrixContextPayload, matrixReviewItems, props.onContextChange, props.onReviewItemsChange]);

  useEffect(() => {
    persistState({
      mode,
      selectedRoomIds,
      selectedSpaceIds,
      analysisPrompt,
    });
  }, [analysisPrompt, mode, selectedRoomIds, selectedSpaceIds]);
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      const [whoamiResult, roomsResult] = await Promise.allSettled([
        fetchMatrixWhoAmI(),
        fetchJoinedRooms(),
      ]);
      if (cancelled) return;
      const whoamiOk = whoamiResult.status === "fulfilled";
      const roomsOk = roomsResult.status === "fulfilled";
      setStatus(
        whoamiOk && roomsOk
          ? "ready"
          : whoamiOk || roomsOk
            ? "partial"
            : "error",
      );
      if (whoamiResult.status === "fulfilled") setWhoami(whoamiResult.value);
      else
        setIdentityError(
          describeMatrixError("Matrix whoami", whoamiResult.reason),
        );
      if (roomsResult.status === "fulfilled") setJoinedRooms(roomsResult.value);
      else
        setRoomsError(
          describeMatrixError("Matrix joined rooms", roomsResult.reason),
        );
      if (persisted) {
        props.onTelemetry(
          "info",
          "Matrix state restored",
          "Local Matrix selection and mode were restored from the browser.",
        );
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [persisted, props.onTelemetry, props.restoredSession]);
  async function loadProvenance(roomId: string) {
    setProvenanceLoading(true);
    setProvenanceError(null);
    try {
      const response = await fetchProvenance(roomId);
      setProvenance(response);
      setProvenanceRoomId(roomId);
    } catch (error) {
      setProvenance(null);
      setProvenanceError(describeMatrixError("Matrix provenance", error));
    } finally {
      setProvenanceLoading(false);
    }
  }
  async function loadHierarchy(roomId: string) {
    setSpaceHierarchyLoading(true);
    setSpaceHierarchyError(null);
    setSpaceHierarchySpace(roomId);
    try {
      setSpaceHierarchy(await fetchRoomHierarchy(roomId));
    } catch (error) {
      setSpaceHierarchy(null);
      setSpaceHierarchyError(describeMatrixError("Matrix hierarchy", error));
    } finally {
      setSpaceHierarchyLoading(false);
    }
  }
  function resetWorkflowState() {
    setAnalysisResult(null);
    setAnalysisError(null);
    setAnalysisLoading(false);
    setSelectedCandidateId(null);
    setPromotedPlan(null);
    setApprovalPending(false);
    setExecutionResult(null);
    setExecutionError(null);
    setPromotionError(null);
    setPlanRefreshError(null);
    setPlanRefreshLoading(false);
    setStalePlanDetected(false);
    setScopeSummary(null);
    setScopeSummaryStatus("idle");
    setScopeSummaryError(null);
    setScopeError(null);
    setSpaceHierarchy(null);
    setSpaceHierarchySpace(null);
    setSpaceHierarchyError(null);
    setSpaceHierarchyLoading(false);
    setProvenance(null);
    setProvenanceError(null);
    setProvenanceRoomId("");
  }
  function resetTopicWorkflowState() {
    setTopicPlan(null);
    setTopicApprovalPending(false);
    setTopicExecution(null);
    setTopicVerification(null);
    setTopicPrepareError(null);
    setTopicExecuteError(null);
    setTopicVerifyError(null);
    setTopicPrepareLoading(false);
    setTopicExecuteLoading(false);
    setTopicVerifyLoading(false);
    setTopicPlanRefreshLoading(false);
    setTopicPlanRefreshError(null);
  }
  async function loadSummary(scopeId: string, preferredRoomId?: string) {
    setScopeSummaryStatus("loading");
    setScopeSummary(null);
    setScopeSummaryError(null);
    try {
      const summary = await fetchScopeSummary(scopeId);
      setScopeSummary(summary);
      setScopeSummaryStatus("ready");
      const roomId = preferredRoomId ?? summary.items[0]?.roomId ?? "";
      if (roomId) {
        await loadProvenance(roomId);
      }
    } catch (error) {
      setScopeSummary(null);
      setScopeSummaryStatus("error");
      setScopeSummaryError(describeMatrixError("Matrix scope summary", error));
    }
  }
  async function refreshCanonicalPlan(planId: string) {
    setPlanRefreshLoading(true);
    setPlanRefreshError(null);
    try {
      const refreshed = await fetchPlan(planId);
      setPromotedPlan(refreshed);
      setStalePlanDetected(refreshed.stale);
      await loadProvenance(refreshed.targetRoomId);
      return refreshed;
    } catch (error) {
      setPlanRefreshError(describeMatrixError("Matrix plan fetch", error));
      return null;
    } finally {
      setPlanRefreshLoading(false);
    }
  }
  async function resolveCurrentScope() {
    if (
      scopeResolveLoading ||
      (selectedRoomIds.length === 0 && selectedSpaces.length === 0)
    ) {
      return false;
    }
    setScopeResolveLoading(true);
    setCurrentScope(null);
    resetWorkflowState();
    setScopeError(null);
    try {
      const scope = await resolveScope({
        roomIds: selectedRoomIds,
        spaceIds: selectedSpaces,
      });
      setCurrentScope(scope);
      await loadSummary(scope.scopeId);
      return true;
    } catch (error) {
      setScopeError(describeMatrixError("Matrix scope resolve", error));
      return false;
    } finally {
      setScopeResolveLoading(false);
    }
  }

  async function proceedToAnalyze() {
    const resolved = await resolveCurrentScope();
    if (resolved) {
      setMode("analyze");
      props.onTelemetry("info", "Matrix mode changed", "Analyze mode activated.");
    }
  }

  async function runAnalysis() {
    if (!currentScope)
      return setAnalysisError("Resolve a scope before analyzing.");
    if (!analysisPrompt.trim())
      return setAnalysisError("Enter an analysis prompt.");
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const response = await analyzeScope({
        scopeId: currentScope.scopeId,
        prompt: analysisPrompt.trim(),
      });
      setAnalysisResult(response);
      setSelectedCandidateId(response.actionCandidates[0]?.candidateId ?? null);
      setProvenanceRoomId(
        response.actionCandidates[0]?.targetRoomId ??
          response.references[0]?.roomId ??
          "",
      );
    } catch (error) {
      setAnalysisError(describeMatrixError("Matrix analysis", error));
    } finally {
      setAnalysisLoading(false);
    }
  }
  async function promote(candidate: MatrixActionCandidate) {
    if (!currentScope || !analysisResult)
      return setPromotionError("Analyze a scope before promoting.");
    setPromotionLoading(true);
    setPromotionError(null);
    setPlanRefreshError(null);
    try {
      const plan = await promoteCandidate({
        candidateId: candidate.candidateId,
        scopeId: currentScope.scopeId,
        snapshotId: analysisResult.snapshotId,
      });
      setPromotedPlan(plan);
      setApprovalPending(false);
      setExecutionResult(null);
      setStalePlanDetected(plan.stale);
      await refreshCanonicalPlan(plan.planId);
      setMode("review");
      props.onTelemetry("info", "Matrix mode changed", "Review mode activated.");
    } catch (error) {
      setPromotionError(describeMatrixError("Matrix promote", error));
    } finally {
      setPromotionLoading(false);
    }
  }

  function dismissReview() {
    setPromotedPlan(null);
    setApprovalPending(false);
    setExecutionResult(null);
    setExecutionError(null);
    setPlanRefreshError(null);
    setMode("analyze");
    props.onTelemetry("info", "Matrix review dismissed", "Returned to Analyze mode without executing.");
  }

  async function execute() {
    if (!promotedPlan)
      return setExecutionError("Promote a plan before execution.");
    if (!approvalPending)
      return setExecutionError(
        "Explicit approval is required before execution.",
      );
    if (planRefreshError)
      return setExecutionError("Refresh the canonical plan before execution.");
    if (planRefreshLoading)
      return setExecutionError(
        "Wait for the canonical plan refresh to finish before execution.",
      );
    if (promotedPlan.stale || stalePlanDetected)
      return setExecutionError(
        "The current plan is stale. Re-run analysis and promote again.",
      );
    if (executionResult)
      return setExecutionError(
        "This plan has already been executed. Promote a fresh plan before executing again.",
      );
    setExecutionLoading(true);
    setExecutionError(null);
    try {
      const response = await executePlan({
        planId: promotedPlan.planId,
        approval: true,
      });
      setExecutionResult(response.result);
      setApprovalPending(false);
      await loadSummary(promotedPlan.scopeId, promotedPlan.targetRoomId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes("stale")
      )
        setStalePlanDetected(true);
      setExecutionError(describeMatrixError("Matrix execute", error));
    } finally {
      setExecutionLoading(false);
    }
  }
  async function verifyTopicUpdate(planId: string) {
    setTopicVerifyLoading(true);
    setTopicVerifyError(null);
    try {
      setTopicVerification(await verifyRoomTopicUpdate(planId));
    } catch (error) {
      setTopicVerifyError(
        describeMatrixError("Matrix room topic verify", error),
      );
    } finally {
      setTopicVerifyLoading(false);
    }
  }

  async function prepareTopicUpdate() {
    const roomId = topicRoomId.trim();
    const topic = topicText.trim();

    if (!roomId) {
      setTopicPrepareError("Wähle zuerst einen Bereich.");
      return;
    }

    if (!topic) {
      setTopicPrepareError("Enter a proposed room topic.");
      return;
    }

    resetTopicWorkflowState();
    setTopicPrepareLoading(true);
    setTopicPrepareError(null);
    setTopicExecuteError(null);
    setTopicVerifyError(null);

    try {
      const plan = await prepareRoomTopicUpdate({
        type: "update_room_topic",
        roomId,
        topic,
      });
      setTopicPlan(plan);
      setTopicApprovalPending(false);
    } catch (error) {
      setTopicPlan(null);
      setTopicPrepareError(
        describeMatrixError("Matrix room topic prepare", error),
      );
    } finally {
      setTopicPrepareLoading(false);
    }
  }

  async function refreshTopicUpdatePlan() {
    if (!topicPlan) {
      setTopicPlanRefreshError(
        "Prepare a topic update before refreshing the plan.",
      );
      return;
    }

    setTopicPlanRefreshLoading(true);
    setTopicPlanRefreshError(null);
    setTopicExecuteError(null);
    setTopicVerifyError(null);

    try {
      const refreshed = await fetchRoomTopicUpdatePlan(topicPlan.planId);
      setTopicPlan(refreshed);
      setTopicApprovalPending(false);
    } catch (error) {
      setTopicPlan(null);
      setTopicApprovalPending(false);
      setTopicExecution(null);
      setTopicVerification(null);
      setTopicPlanRefreshError(
        describeMatrixError("Matrix room topic refresh", error),
      );
    } finally {
      setTopicPlanRefreshLoading(false);
    }
  }

  async function executeTopicUpdate() {
    if (!topicPlan) {
      setTopicExecuteError("Prepare a topic update before execution.");
      return;
    }

    if (topicPlan.status !== "pending_review") {
      setTopicExecuteError("Refresh the plan before execution.");
      return;
    }

    if (topicPlanRefreshLoading) {
      setTopicExecuteError(
        "Wait for the plan refresh to finish before execution.",
      );
      return;
    }

    if (!topicApprovalPending) {
      setTopicExecuteError(
        "Explicit approval is required before execution.",
      );
      return;
    }

    setTopicExecuteLoading(true);
    setTopicExecuteError(null);
    setTopicVerifyError(null);
    setTopicVerification(null);

    try {
      const execution = await executeRoomTopicUpdate({
        planId: topicPlan.planId,
        approval: true,
      });
      setTopicExecution(execution);
      setTopicApprovalPending(false);
      setTopicPlan((current) =>
        current ? { ...current, status: "executed" } : current,
      );
      await verifyTopicUpdate(topicPlan.planId);
    } catch (error) {
      setTopicExecuteError(
        describeMatrixError("Matrix room topic execute", error),
      );
    } finally {
      setTopicExecuteLoading(false);
    }
  }
  return (
    <section className="workspace-panel matrix-workspace" data-testid="matrix-workspace">
      {" "}
      <section className="hero matrix-hero">
        {" "}
        <div>
          {" "}
          <p className={`status-pill status-${status}`} data-testid="matrix-status">
            {status === "ready"
              ? "Matrix backend ready"
              : status === "partial"
                ? "Matrix backend partial"
                : status === "error"
                  ? "Matrix backend error"
                  : "Loading matrix backend"}
          </p>{" "}
          <h1>Matrix Workspace</h1>{" "}
          <p className="hero-copy">
            {" "}
            Backend-owned Explore, Analyze, Review, Execute, and Verify flow
            with approval-gated execution and bounded v1 action candidates.{" "}
          </p>{" "}
          {props.restoredSession ? (
            <div className="restored-banner" data-testid="matrix-restored-banner">
              RESTORED_SESSION: local Matrix selection is visible, but backend
              freshness is not assumed.
            </div>
          ) : null}
          <div className="chip-row">
            {(["explore", "analyze", "review"] as MatrixMode[]).map((itemMode) => (
              <button
                key={itemMode}
                type="button"
                className={
                  mode === itemMode
                    ? "workspace-tab workspace-tab-active"
                    : "workspace-tab"
                }
                onClick={() => {
                  setMode(itemMode);
                  props.onTelemetry(
                    "info",
                    "Matrix mode changed",
                    `${modeLabel(itemMode)} mode activated.`,
                  );
                }}
              >
                {modeLabel(itemMode)}
              </button>
            ))}
          </div>
          <div className="chip-row">
            {" "}
            {[
              [
                "Explore",
                scopeResolveLoading || summaryLoading || Boolean(currentScope),
                Boolean(scopeSummary) &&
                  !scopeResolveLoading &&
                  !summaryLoading &&
                  !scopeError,
              ],
              [
                "Analyze",
                analysisLoading || Boolean(analysisResult),
                Boolean(analysisResult) && !analysisLoading,
              ],
              [
                "Review",
                promotionLoading || planRefreshLoading || Boolean(promotedPlan),
                Boolean(promotedPlan) &&
                  !promotionLoading &&
                  !planRefreshLoading &&
                  !planRefreshError &&
                  !stalePlanDetected &&
                  !promotedPlan?.stale,
              ],
              [
                "Execute",
                executionLoading || approvalPending || Boolean(executionResult),
                Boolean(executionResult) && !executionLoading,
              ],
              [
                "Verify",
                executionLoading ||
                  summaryLoading ||
                  provenanceLoading ||
                  Boolean(executionResult) ||
                  Boolean(provenance),
                Boolean(executionResult) &&
                  Boolean(provenance) &&
                  !summaryLoading &&
                  !provenanceLoading,
              ],
            ].map(([label, active, complete]) => (
              <span
                key={label as string}
                className={`workflow-chip workflow-chip-${complete ? "complete" : active ? "active" : "idle"}`}
              >
                {label as string}
              </span>
            ))}{" "}
          </div>{" "}
        </div>{" "}
        <aside className="workspace-summary-card">
          {" "}
          <strong>
            {currentScope
              ? props.expertMode
                ? `${currentScope.type} scope`
                : "Bereich gewählt"
              : "Noch kein Bereich gewählt"}
          </strong>{" "}
          <div className="summary-stack">
            {props.expertMode ? (
              <>
                <span>User: {whoami?.userId ?? "unresolved"}</span>
                <span>Homeserver: {whoami?.homeserver ?? "unresolved"}</span>
                <span>Origin: {MATRIX_API_BASE_URL}</span>
                <span>Mode: {modeLabel(mode)}</span>
                <span>Scope: {currentScope?.scopeId ?? "none"}</span>
                <span>Rooms: {scopeSummary?.items.length ?? 0}</span>
                <span>
                  Candidates: {analysisResult?.actionCandidates.length ?? 0}
                </span>
              </>
            ) : (
              <>
                <span>Bereichstatus: {currentScope ? "Bereit" : "Wartet"}</span>
                <span>Zusammenfassung: {scopeSummary ? "Vorhanden" : "Noch nicht geladen"}</span>
                <span>Freigabe: {promotedPlan || topicPlan ? "Nötig" : "Nicht erforderlich"}</span>
                <span>Sicherheit: Nur Lesen aktiv</span>
              </>
            )}
          </div>{" "}
        </aside>{" "}
      </section>{" "}
      {status !== "ready" || identityError || roomsError ? (
        <section className="alert-banner">
          {" "}
          <p>
            {props.expertMode
              ? `Matrix bootstrap ${status}. Origin: ${MATRIX_API_BASE_URL}`
              : `Matrix bootstrap ${status}.`}
          </p>{" "}
          {identityError ? <p>{identityError}</p> : null}{" "}
          {roomsError ? <p>{roomsError}</p> : null}{" "}
        </section>
      ) : null}{" "}
      <section className="matrix-grid">
        {" "}
        <section
          className="workspace-card"
          hidden={mode === "analyze"}
          data-testid="matrix-topic-update-panel"
        >
          {" "}
          <header className="card-header">
            <div>
              <span>Room topic update</span>
              <strong>
                Review, approve, execute, and verify a backend-owned topic change
              </strong>
            </div>
          </header>{" "}
          <div className="info-block">
            <p className="info-label">Target room</p>
            <div className="input-row">
              <input
                type="text"
                value={topicRoomId}
                onChange={(event) => setTopicRoomId(event.target.value)}
                placeholder={props.expertMode ? "!room:matrix.org" : "Bereich wählen"}
                aria-label={props.expertMode ? "Room ID" : "Bereich"}
                data-testid="matrix-topic-room-id"
              />
              <button
                type="button"
                className="secondary-button"
                onClick={() => setTopicRoomId(selectedRoomIds[0] ?? "")}
                disabled={!selectedRoomIds[0]}
              >
                {props.expertMode ? "Use selected room" : "Auswahl übernehmen"}
              </button>
            </div>
          </div>{" "}
          <div className="info-block">
            <p className="info-label">Proposed topic</p>
            <textarea
              className="matrix-textarea"
              rows={3}
              value={topicText}
              onChange={(event) => setTopicText(event.target.value)}
              placeholder="Propose a new Matrix room topic."
              aria-label="Proposed topic"
              data-testid="matrix-topic-text"
            />
          </div>{" "}
          <div className="action-row">
            <button
              type="button"
              onClick={() => {
                void prepareTopicUpdate();
              }}
              disabled={topicPrepareLoading}
            >
              {topicPrepareLoading ? "Preparing…" : "Prepare topic update"}
            </button>
            <span className="muted-copy">
              {props.expertMode ? "The browser only sends a room ID, proposed topic text, and approval intent." : "Nur nach Freigabe."}
            </span>
          </div>{" "}
          {topicPrepareError ? (
            <p className="error-banner" data-testid="matrix-topic-prepare-error">
              {topicPrepareError}
            </p>
          ) : null}{" "}
          {topicPlanRefreshError ? (
            <p
              className="error-banner"
              data-testid="matrix-topic-refresh-error"
            >
              {topicPlanRefreshError}
            </p>
          ) : null}{" "}
          {topicPlan ? (
            <div className="plan-card" data-testid="matrix-topic-plan">
              <div className="plan-card-header">
                <div>
                  <strong>Topic update plan</strong>
                  <span>{topicPlan.status}</span>
                </div>
                <div className="plan-badges">
                  <span
                    className={`workflow-chip ${topicPlan.status === "pending_review" ? "workflow-chip-active" : "workflow-chip-complete"}`}
                  >
                    {topicPlan.status === "pending_review"
                      ? "Review pending"
                      : "Plan refreshed"}
                  </span>
                </div>
              </div>
              <div className="detail-grid">
                {props.expertMode ? (
                  <div>
                    <span>Room ID</span>
                    <strong>{topicPlan.roomId}</strong>
                  </div>
                ) : null}
                <div>
                  <span>Status</span>
                  <strong>{topicPlan.status}</strong>
                </div>
                <div>
                  <span>Expires at</span>
                  <strong>{formatDate(topicPlan.expiresAt)}</strong>
                </div>
                <div>
                  <span>Field</span>
                  <strong>{topicPlan.diff.field}</strong>
                </div>
                <div>
                  <span>Requires approval</span>
                  <strong>{String(topicPlan.requiresApproval)}</strong>
                </div>
              </div>
              <div className="delta-grid">
                <div>
                  <p className="info-label">Before topic</p>
                  <pre>{text(topicPlan.diff.before)}</pre>
                </div>
                <div>
                  <p className="info-label">After topic</p>
                  <pre>{text(topicPlan.diff.after)}</pre>
                </div>
              </div>
              <label className="approval-check">
                <input
                  type="checkbox"
                  checked={topicApprovalPending}
                  onChange={(event) =>
                    setTopicApprovalPending(event.target.checked)
                  }
                  disabled={
                    topicExecuteLoading ||
                    topicVerifyLoading ||
                    topicPlanRefreshLoading ||
                    topicPlan.status !== "pending_review"
                  }
                />
                <span>Ich bestätige die Freigabe für diese Änderung.</span>
              </label>
              <div className="action-row">
                <button
                  type="button"
                  onClick={() => {
                    void executeTopicUpdate();
                  }}
                  disabled={
                    !topicApprovalPending ||
                    topicExecuteLoading ||
                    topicVerifyLoading ||
                    topicPlanRefreshLoading ||
                    topicPlan.status !== "pending_review"
                  }
                  data-testid="matrix-topic-execute"
                >
                  {topicExecuteLoading ? "Executing…" : "Approve and execute"}
                </button>
                <span className="muted-copy">
                  Verification runs from backend readback after execution.
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    void refreshTopicUpdatePlan();
                  }}
                  disabled={topicPlanRefreshLoading}
                  data-testid="matrix-topic-refresh"
                >
                  {topicPlanRefreshLoading ? "Refreshing…" : "Refresh plan"}
                </button>
              </div>
              {topicExecution ? (
                <div
                  className="verification-card"
                  data-testid="matrix-topic-execution"
                >
                  <div className="detail-grid">
                    <div>
                      <span>Transaction ID</span>
                      <strong>{topicExecution.transactionId}</strong>
                    </div>
                    <div>
                      <span>Executed at</span>
                      <strong>{formatDate(topicExecution.executedAt)}</strong>
                    </div>
                    <div>
                      <span>Status</span>
                      <strong>{topicExecution.status}</strong>
                    </div>
                  </div>
                </div>
              ) : null}
              {topicVerifyLoading ? (
                <p className="muted-copy">Verifying backend readback…</p>
              ) : null}
              {topicVerification ? (
                <div
                  className="verification-card"
                  data-testid="matrix-topic-verification"
                >
                  <div className="detail-grid">
                    <div>
                      <span>Status</span>
                      <strong>{topicVerification.status}</strong>
                    </div>
                    <div>
                      <span>Expected</span>
                      <strong>{text(topicVerification.expected)}</strong>
                    </div>
                    <div>
                      <span>Actual</span>
                      <strong>{text(topicVerification.actual)}</strong>
                    </div>
                    <div>
                      <span>Checked at</span>
                      <strong>{formatDate(topicVerification.checkedAt)}</strong>
                    </div>
                  </div>
                </div>
              ) : null}
              {topicExecuteError ? (
                <p
                  className="error-banner"
                  data-testid="matrix-topic-execute-error"
                >
                  {topicExecuteError}
                </p>
              ) : null}
              {topicVerifyError ? (
                <p
                  className="error-banner"
                  data-testid="matrix-topic-verify-error"
                >
                  {topicVerifyError}
                </p>
              ) : null}
            </div>
          ) : (
              <p className="empty-state">
              {props.expertMode
                ? "Enter a room ID and proposed topic, then prepare a backend-owned review plan."
                : "Bereich wählen, dann Review vorbereiten."}
            </p>
          )}{" "}
        </section>{" "}
        <section className="workspace-card" hidden={mode !== "explore"}>
          {" "}
          <header className="card-header">
            <div>
              <span>Explore</span>
              <strong>Identity, rooms, scope, and provenance</strong>
            </div>
          </header>{" "}
          <div className="explore-stack">
            {" "}
            <div className="info-block">
              <p className="info-label">Who am I</p>
              <p className="info-value">
                {props.expertMode
                  ? whoami?.userId ?? "Load backend identity to begin"
                  : whoami
                    ? "Identität geladen"
                    : "Backend-Identität wird geladen"}
              </p>
              {props.expertMode ? (
                <p className="info-note">
                  Device: {text(whoami?.deviceId)} · Homeserver:{" "}
                  {text(whoami?.homeserver)}
                </p>
              ) : (
                <p className="info-note">Bereich wählen, um die Übersicht zu laden.</p>
              )}
            </div>{" "}
            {identityError ? (
              <p className="error-banner" data-testid="matrix-identity-error">{identityError}</p>
            ) : null}{" "}
            <div className="info-block">
              {" "}
              <p className="info-label">Joined rooms</p>{" "}
              <div className="room-picker" data-testid="matrix-rooms">
                {" "}
                {joinedRooms.length === 0 ? (
                  <p className="empty-state">No joined rooms loaded yet.</p>
                ) : (
                  joinedRooms.map((room) => {
                    const active = selectedRoomIds.includes(room.roomId);
                    return (
                      <button
                        key={room.roomId}
                        type="button"
                        className={`room-picker-item ${active ? "room-picker-item-active" : ""}`}
                        onClick={() =>
                          setSelectedRoomIds((current) =>
                            current.includes(room.roomId)
                              ? current.filter((value) => value !== room.roomId)
                              : [...current, room.roomId],
                          )
                        }
                        onMouseUp={() => {
                          if (!active) {
                            setTopicRoomId((current) =>
                              current.trim().length > 0 ? current : room.roomId,
                            );
                          }
                        }}
                      >
                        {" "}
                        <span className="room-picker-title">
                          {props.expertMode
                            ? room.name ?? room.canonicalAlias ?? room.roomId
                            : room.name ?? "Bereich"}
                        </span>{" "}
                        <span className="room-picker-meta">
                          {props.expertMode
                            ? `${room.roomType ?? "room"} · ${room.roomId}`
                            : "Bereich auswählen"}
                        </span>{" "}
                      </button>
                    );
                  })
                )}{" "}
              </div>{" "}
              {roomsError ? (
                <p className="error-banner" data-testid="matrix-rooms-error">{roomsError}</p>
              ) : null}{" "}
            </div>{" "}
            <div className="info-block">
              {" "}
              <p className="info-label">Selected scope inputs</p>{" "}
              <div className="input-row">
                {" "}
                <input
                  type="text"
                  value={spaceInput}
                  onChange={(event) => setSpaceInput(event.target.value)}
                  placeholder={props.expertMode ? "Add a space ID" : "Bereich ergänzen"}
                />{" "}
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    const next = spaceInput.trim();
                    if (!next) return;
                    setSelectedSpaceIds((current) =>
                      current.includes(next) ? current : [...current, next],
                    );
                    setSpaceInput("");
                    void loadHierarchy(next);
                  }}
                >
                  Add space
                </button>{" "}
              </div>{" "}
              <div className="chip-list">
                {" "}
                {selectedRoomIds.length === 0 && selectedSpaces.length === 0 ? (
                  <span className="empty-state">
                    No scope inputs selected yet.
                  </span>
                ) : null}{" "}
                {selectedRoomIds.map((roomId, index) => (
                  <span key={roomId} className="scope-chip">
                    <span>{props.expertMode ? `Room: ${roomId}` : `Bereich ${index + 1}`}</span>
                    <button
                      type="button"
                      className="chip-action"
                      onClick={() =>
                        setSelectedRoomIds((current) =>
                          current.filter((value) => value !== roomId),
                        )
                      }
                    >
                      Remove
                    </button>
                  </span>
                ))}{" "}
                {selectedSpaces.map((spaceId, index) => (
                  <span key={spaceId} className="scope-chip">
                    <span>{props.expertMode ? `Space: ${spaceId}` : `Bereich ${index + 1}`}</span>
                    <button
                      type="button"
                      className="chip-action"
                      onClick={() => void loadHierarchy(spaceId)}
                    >
                      Preview hierarchy
                    </button>
                    <button
                      type="button"
                      className="chip-action"
                      onClick={() =>
                        setSelectedSpaceIds((current) =>
                          current.filter((value) => value !== spaceId),
                        )
                      }
                    >
                      Remove
                    </button>
                  </span>
                ))}{" "}
              </div>{" "}
              <div className="action-row">
                <button
                  type="button"
                  onClick={() => {
                    void proceedToAnalyze();
                  }}
                  disabled={
                    scopeResolveLoading ||
                    (selectedRoomIds.length === 0 &&
                      selectedSpaces.length === 0)
                  }
                >
                  {scopeResolveLoading
                    ? "Resolving…"
                    : "Proceed to Analyze"}
                </button>
                <span className="muted-copy">
                  Backend resolves the scope and generates the current snapshot.
                </span>
              </div>{" "}
              {scopeError ? (
                <p className="error-banner">{scopeError}</p>
              ) : null}{" "}
            </div>{" "}
            <div className="info-block">
              {" "}
              <p className="info-label">Current scope summary</p>{" "}
              {scopeSummary ? (
                <div className="scope-summary">
                  <div className="scope-summary-meta">
                    {props.expertMode ? <span>Snapshot: {scopeSummary.snapshotId}</span> : null}
                    <span>
                      Generated: {formatDate(scopeSummary.generatedAt)}
                    </span>
                  </div>
                  <div className="scope-summary-list">
                    {scopeSummary.items.map((item) => (
                      <article
                        key={item.roomId}
                        className={`scope-summary-item ${item.roomId === provenanceRoomId ? "scope-summary-item-active" : ""}`}
                      >
                        <div>
                          <strong>{text(item.name)}</strong>
                          <span>{props.expertMode ? text(item.canonicalAlias) : "Bereich bereit"}</span>
                        </div>
                        <small>
                          {props.expertMode ? `${item.members} members · ${item.lastEventSummary}` : "Übersicht bereit"}
                        </small>
                        <div className="scope-summary-actions">
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => void loadProvenance(item.roomId)}
                          >
                            {props.expertMode ? "View provenance" : "Übersicht ansehen"}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="empty-state">
                  {scopeSummaryStatus === "loading"
                    ? "Loading summary…"
                    : currentScope
                      ? "Scope summary unavailable until the backend responds."
                      : "Resolve a scope to begin analysis."}
                </p>
              )}{" "}
              {scopeSummaryError ? (
                <p className="error-banner">{scopeSummaryError}</p>
              ) : null}{" "}
            </div>{" "}
            <div className="info-block">
              {" "}
              <p className="info-label">Hierarchy preview</p>{" "}
              {spaceHierarchySpace ? (
                <div className="scope-summary">
                  {" "}
                  <div className="scope-summary-meta">
                    {props.expertMode ? <span>Space ID: {spaceHierarchySpace}</span> : <span>Bereich aktiv</span>}
                  </div>{" "}
                  {spaceHierarchyLoading ? (
                    <p className="muted-copy">Loading hierarchy…</p>
                  ) : null}{" "}
                  {spaceHierarchyError ? (
                    <p className="error-banner">{spaceHierarchyError}</p>
                  ) : null}{" "}
                  {spaceHierarchy?.rooms?.length ? (
                    <div className="scope-summary-list">
                      {spaceHierarchy.rooms.map((room, index) => (
                        <article
                          key={room.room_id ?? room.name ?? String(index)}
                          className="scope-summary-item"
                        >
                          <div>
                            <strong>{text(room.name ?? null)}</strong>
                            <span>{props.expertMode ? text(room.canonical_alias ?? null) : "Bereich verbunden"}</span>
                          </div>
                          <small>
                            {props.expertMode
                              ? `${text(room.room_type ?? null)} · ${room.room_id ?? "unknown room"}`
                              : "Übersicht bereit"}
                          </small>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-state">
                      No hierarchy rooms returned yet.
                    </p>
                  )}{" "}
                </div>
              ) : (
                <p className="empty-state">
                  {props.expertMode ? "Add or preview a space ID to inspect hierarchy." : "Bereich wählen, um die Übersicht zu laden."}
                </p>
              )}{" "}
            </div>{" "}
          </div>{" "}
        </section>{" "}
        <div className="matrix-column">
          {" "}
          <section className="workspace-card" hidden={mode !== "analyze"}>
            {" "}
            <header className="card-header">
              <div>
                <span>Analyze</span>
                <strong>Grounded review of the selected scope</strong>
              </div>
            </header>{" "}
            <div className="alert-banner" data-testid="matrix-analyze-contract-only">
              <p>{legacyContractOnlyNotice}</p>
            </div>{" "}
            <textarea
              className="matrix-textarea"
              rows={5}
              value={analysisPrompt}
              onChange={(event) => setAnalysisPrompt(event.target.value)}
              placeholder="Describe what should be reviewed in the resolved scope."
              disabled
            />{" "}
            <div className="action-row">
              <button
                type="button"
                onClick={() => {
                  void runAnalysis();
                }}
                disabled
              >
                Analyze (contract-only)
              </button>
              <span className="muted-copy">
                Analysis remains backend-owned and is not wired for browser execution in this slice.
              </span>
            </div>{" "}
            {analysisError ? (
              <p className="error-banner">{analysisError}</p>
            ) : null}{" "}
            {analysisResult ? (
              <div className="analysis-result">
                <div className="result-block">
                  <p className="info-label">Analysis response</p>
                  <p className="analysis-text">
                    {analysisResult.response.content}
                  </p>
                  <div className="scope-summary-meta">
                    {props.expertMode ? <span>Snapshot: {analysisResult.snapshotId}</span> : null}
                  </div>
                </div>
                <div className="result-block">
                  <p className="info-label">Grounded references</p>
                  <div className="chip-list">
                    {analysisResult.references.length ? (
                      analysisResult.references.map((reference) => (
                        <span
                          key={`${reference.type}:${reference.roomId}`}
                          className="reference-chip"
                        >
                          {reference.label} · {reference.type}
                        </span>
                      ))
                    ) : (
                      <span className="empty-state">
                        No references returned.
                      </span>
                    )}
                  </div>
                </div>
                <div className="result-block">
                  <p className="info-label">Action candidates</p>
                  <div className="candidate-list">
                    {analysisResult.actionCandidates.length ? (
                      analysisResult.actionCandidates.map((candidate) => {
                        const active =
                          candidate.candidateId === selectedCandidateId;
                        return (
                          <article
                            key={candidate.candidateId}
                            className={`candidate-card ${active ? "candidate-card-active" : ""}`}
                            onClick={() =>
                              setSelectedCandidateId(candidate.candidateId)
                            }
                          >
                            <div className="candidate-card-header">
                              <strong>{candidate.summary}</strong>
                              <span>{candidate.type}</span>
                            </div>
                            <p>{candidate.rationale}</p>
                            <small>Target room: {candidate.targetRoomId}</small>
                            <div className="action-row">
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedCandidateId(candidate.candidateId);
                                  void promote(candidate);
                                }}
                                disabled={promotionLoading}
                              >
                                {promotionLoading && active
                                  ? "Promoting…"
                                  : "Promote"}
                              </button>
                            </div>
                          </article>
                        );
                      })
                    ) : (
                      <p className="empty-state">
                        No bounded action candidates were returned for this
                        scope.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="empty-state">
                Run analysis to produce grounded references and bounded
                candidates.
              </p>
            )}{" "}
            {promotionError ? (
              <p className="error-banner">{promotionError}</p>
            ) : null}{" "}
          </section>{" "}
          <section className="workspace-card" hidden={mode !== "review"}>
            {" "}
            <header className="card-header">
              <div>
                <span>Review</span>
                <strong>Plan card and approval gate</strong>
              </div>
            </header>{" "}
            <div className="alert-banner" data-testid="matrix-review-contract-only">
              <p>{legacyContractOnlyNotice}</p>
            </div>{" "}
            {promotedPlan ? (
              <div className="plan-card">
                {" "}
                <div className="plan-card-header">
                  {" "}
                  <div>
                    {" "}
                    <strong>{promotedPlan.summary}</strong>{" "}
                    <span>{promotedPlan.type}</span>{" "}
                  </div>{" "}
                  <div className="plan-badges">
                    {" "}
                    <span className="workflow-chip workflow-chip-active">
                      Risk: {promotedPlan.riskLevel}
                    </span>{" "}
                    <span
                      className={`workflow-chip ${promotedPlan.stale || stalePlanDetected ? "workflow-chip-error" : "workflow-chip-complete"}`}
                    >
                      {" "}
                      {promotedPlan.stale || stalePlanDetected
                        ? "Stale"
                        : "Fresh"}{" "}
                    </span>{" "}
                    {planRefreshError ? (
                      <span className="workflow-chip workflow-chip-error">
                        Canonical refresh failed
                      </span>
                    ) : null}{" "}
                    {planRefreshLoading ? (
                      <span className="workflow-chip workflow-chip-idle">
                        Refreshing canonical plan
                      </span>
                    ) : null}{" "}
                  </div>{" "}
                </div>{" "}
                <p>{promotedPlan.rationale}</p>{" "}
                {props.expertMode ? (
                  <>
                    <div className="delta-grid">
                      {" "}
                      <div>
                        {" "}
                        <p className="info-label">Before</p>{" "}
                        <pre>
                          {JSON.stringify(
                            promotedPlan.payloadDelta.before,
                            null,
                            2,
                          )}
                        </pre>{" "}
                      </div>{" "}
                      <div>
                        {" "}
                        <p className="info-label">After</p>{" "}
                        <pre>
                          {JSON.stringify(promotedPlan.payloadDelta.after, null, 2)}
                        </pre>{" "}
                      </div>{" "}
                    </div>{" "}
                    <div className="detail-grid">
                      {" "}
                      <div>
                        <span>Plan ID</span>
                        <strong>{promotedPlan.planId}</strong>
                      </div>{" "}
                      <div>
                        <span>Scope ID</span>
                        <strong>{promotedPlan.scopeId}</strong>
                      </div>{" "}
                      <div>
                        <span>Snapshot ID</span>
                        <strong>{promotedPlan.snapshotId}</strong>
                      </div>{" "}
                      <div>
                        <span>Target room</span>
                        <strong>{promotedPlan.targetRoomId}</strong>
                      </div>{" "}
                      <div>
                        <span>Preflight</span>
                        <strong>{promotedPlan.preflightStatus}</strong>
                      </div>{" "}
                      <div>
                        <span>Required approval</span>
                        <strong>{String(promotedPlan.requiredApproval)}</strong>
                      </div>{" "}
                    </div>{" "}
                  </>
                ) : (
                  <p className="muted-copy">Vorschlag bereit. Technische Details im Expert Mode.</p>
                )}{" "}
                <div className="list-block">
                  {" "}
                  <p className="info-label">Expected permissions</p>{" "}
                  <div className="chip-list">
                    {promotedPlan.expectedPermissions.map((permission) => (
                      <span key={permission} className="reference-chip">
                        {permission}
                      </span>
                    ))}
                  </div>{" "}
                </div>{" "}
                <div className="list-block">
                  {" "}
                  <p className="info-label">Authorization requirements</p>{" "}
                  <div className="chip-list">
                    {promotedPlan.authorizationRequirements.map((item) => (
                      <span key={item} className="reference-chip">
                        {item}
                      </span>
                    ))}
                  </div>{" "}
                </div>{" "}
                <div className="list-block">
                  {" "}
                  <p className="info-label">Impact summary</p>{" "}
                  <ul className="plain-list">
                    {promotedPlan.impactSummary.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>{" "}
                </div>{" "}
                {planRefreshError ? (
                  <div className="alert-banner">
                    <p>{planRefreshError}</p>
                  </div>
                ) : null}{" "}
                <div className="approval-panel">
                  {" "}
                  <label className="approval-check">
                    {" "}
                    <input
                      type="checkbox"
                      checked={approvalPending}
                      onChange={(event) =>
                        setApprovalPending(event.target.checked)
                      }
                      disabled
                    />{" "}
                    <span>I approve backend execution of this plan (contract-only).</span>{" "}
                  </label>{" "}
                  <div className="action-row">
                    {" "}
                    <button
                      type="button"
                      onClick={() => {
                        void execute();
                      }}
                      disabled
                    >
                      {" "}
                      Approve and execute (contract-only){" "}
                    </button>{" "}
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        void refreshCanonicalPlan(promotedPlan.planId);
                      }}
                      disabled
                    >
                      {" "}
                      Refresh plan (contract-only){" "}
                    </button>{" "}
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={dismissReview}
                      disabled
                    >
                      Dismiss (contract-only)
                    </button>{" "}
                  </div>{" "}
                </div>{" "}
              </div>
            ) : (
              <p className="empty-state">
                Promote a candidate to create a bounded review plan. The legacy review controls remain contract-only.
              </p>
            )}{" "}
            {stalePlanDetected ? (
              <div className="alert-banner">
                <p>
                  The current plan is stale. Re-run analysis and promote again
                  before executing.
                </p>
              </div>
            ) : null}{" "}
            {executionError ? (
              <p className="error-banner">{executionError}</p>
            ) : null}{" "}
          </section>{" "}
          <section className="workspace-card" hidden={mode !== "review"}>
            {" "}
            <header className="card-header">
              <div>
                <span>Verify</span>
                <strong>Execution result, provenance, and refresh</strong>
              </div>
            </header>{" "}
            {executionResult ? (
              <div className="verification-card">
                {props.expertMode ? (
                  <div className="detail-grid">
                    <div>
                      <span>Execution ID</span>
                      <strong>{executionResult.executionId}</strong>
                    </div>
                    <div>
                      <span>Plan ID</span>
                      <strong>{executionResult.planId}</strong>
                    </div>
                    <div>
                      <span>Status</span>
                      <strong>{executionResult.status}</strong>
                    </div>
                    <div>
                      <span>Verified</span>
                      <strong>{String(executionResult.verified)}</strong>
                    </div>
                  </div>
                ) : null}
                <p className="analysis-text">
                  {executionResult.verificationSummary}
                </p>
                {props.expertMode ? (
                  <div className="delta-grid">
                    <div>
                      <p className="info-label">Before</p>
                      <pre>{JSON.stringify(executionResult.before, null, 2)}</pre>
                    </div>
                    <div>
                      <p className="info-label">After</p>
                      <pre>{JSON.stringify(executionResult.after, null, 2)}</pre>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="empty-state">
                Execution results will appear here after approval-gated
                execution.
              </p>
            )}{" "}
            <div className="verification-actions">
              {" "}
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  if (currentScope)
                    void loadSummary(
                      currentScope.scopeId,
                      promotedPlan?.targetRoomId,
                    );
                }}
                disabled={!currentScope || summaryLoading}
              >
                Refresh scope summary
              </button>{" "}
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  if (provenanceRoomId) void loadProvenance(provenanceRoomId);
                }}
                disabled={!provenanceRoomId || provenanceLoading}
              >
                Refresh provenance
              </button>{" "}
            </div>{" "}
            {executionResult && (summaryLoading || provenanceLoading) ? (
              <div className="alert-banner">
                <p>Verification is pending backend readback.</p>
              </div>
            ) : null}{" "}
            {scopeSummaryError ? (
              <p className="error-banner">{scopeSummaryError}</p>
            ) : null}{" "}
            {summaryLoading ? (
              <p className="muted-copy">Refreshing scope summary…</p>
            ) : null}{" "}
            {provenanceError ? (
              <p className="error-banner">{provenanceError}</p>
            ) : null}{" "}
            {provenance ? (
              <div className="provenance-card">
                <p className="info-label">Provenance</p>
                {props.expertMode ? (
                  <div className="detail-grid">
                    <div>
                      <span>Room ID</span>
                      <strong>{provenance.roomId}</strong>
                    </div>
                    <div>
                      <span>Snapshot</span>
                      <strong>{text(provenance.snapshotId)}</strong>
                    </div>
                    <div>
                      <span>State event</span>
                      <strong>{text(provenance.stateEventId)}</strong>
                    </div>
                    <div>
                      <span>Origin server</span>
                      <strong>{provenance.originServer}</strong>
                    </div>
                    <div>
                      <span>Auth chain index</span>
                      <strong>{provenance.authChainIndex}</strong>
                    </div>
                    <div>
                      <span>Integrity</span>
                      <strong>{provenance.integrityNotice}</strong>
                    </div>
                  </div>
                ) : (
                  <p className="muted-copy">{provenance.integrityNotice}</p>
                )}
                <div className="list-block">
                  <p className="info-label">Signatures</p>
                  <div className="chip-list">
                    {provenance.signatures.map((signature) => (
                      <span
                        key={`${signature.signer}:${signature.status}`}
                        className="reference-chip"
                      >
                        {signature.signer} · {signature.status}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="empty-state">
                Load provenance from the Explore or Verify stage.
              </p>
            )}{" "}
            {provenanceLoading ? (
              <p className="muted-copy">Loading provenance…</p>
            ) : null}{" "}
          </section>{" "}
        </div>{" "}
      </section>{" "}
    </section>
  );
}
