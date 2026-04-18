import { useEffect, useMemo, useState } from "react";
import { ExpertDetails } from "./ExpertDetails.js";
import {
  MATRIX_API_BASE_URL,
  analyzeScope,
  analyzeRoomTopicUpdate,
  executePlan,
  executeRoomTopicUpdate,
  fetchJoinedRooms,
  fetchMatrixWhoAmI,
  fetchPlan,
  fetchProvenance,
  fetchRoomHierarchy,
  fetchScopeSummary,
  promoteCandidate,
  fetchRoomTopicAnalysisPlan,
  resolveScope,
  MatrixRequestError,
  type MatrixActionCandidate,
  type MatrixAnalysisResponse,
  type MatrixExecutionResult,
  type MatrixJoinedRoom,
  type MatrixPlan,
  type MatrixProvenance,
  type MatrixRoomTopicAgentPlan,
  type MatrixRoomTopicExecutionResult,
  type MatrixRoomTopicVerificationResult,
  type MatrixScope,
  type MatrixScopeSummary,
  type MatrixSpaceHierarchy,
  type MatrixWhoAmI,
  verifyRoomTopicUpdate,
} from "../lib/matrix-api.js";
import type { ReviewItem } from "./ReviewWorkspace.js";
import {
  deriveSessionStatus,
  deriveSessionTitle,
  type MatrixComposerTarget,
  type MatrixSession,
} from "../lib/workspace-state.js";

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
  session: MatrixSession;
  restoredSession: boolean;
  expertMode: boolean;
  onTelemetry: (
    kind: "info" | "warning" | "error",
    label: string,
    detail?: string,
  ) => void;
  onContextChange: (status: MatrixWorkspaceStatus) => void;
  onReviewItemsChange?: (items: ReviewItem[]) => void;
  onSessionChange: (session: MatrixSession) => void;
};
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
const releaseScopeNotice =
  "Matrix topic updates are wired end-to-end for Explore, scope summary, provenance, analyze, review, execute, and verify.";

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
  const persisted = props.session.metadata;
  const [mode, setMode] = useState<MatrixMode>(persisted.mode as MatrixMode);
  const [status, setStatus] = useState<WorkflowStatus>("loading");
  const [whoami, setWhoami] = useState<MatrixWhoAmI | null>(null);
  const [joinedRooms, setJoinedRooms] = useState<MatrixJoinedRoom[]>([]);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>(
    persisted.selectedRoomIds,
  );
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<string[]>(
    persisted.selectedSpaceIds,
  );
  const [spaceInput, setSpaceInput] = useState("");
  const [currentScope, setCurrentScope] = useState<MatrixScope | null>(persisted.currentScope);
  const [scopeSummary, setScopeSummary] = useState<MatrixScopeSummary | null>(
    persisted.scopeSummary,
  );
  const [scopeSummaryStatus, setScopeSummaryStatus] =
    useState<LoadStatus>(persisted.scopeSummaryStatus);
  const [scopeSummaryError, setScopeSummaryError] = useState<string | null>(
    persisted.scopeSummaryError,
  );
  const [scopeResolveLoading, setScopeResolveLoading] = useState(persisted.scopeResolveLoading);
  const [scopeError, setScopeError] = useState<string | null>(persisted.scopeError);
  const [spaceHierarchy, setSpaceHierarchy] =
    useState<MatrixSpaceHierarchy | null>(persisted.spaceHierarchy);
  const [spaceHierarchySpace, setSpaceHierarchySpace] = useState<string | null>(
    persisted.spaceHierarchySpace,
  );
  const [spaceHierarchyLoading, setSpaceHierarchyLoading] = useState(persisted.spaceHierarchyLoading);
  const [spaceHierarchyError, setSpaceHierarchyError] = useState<string | null>(
    persisted.spaceHierarchyError,
  );
  const [analysisPrompt, setAnalysisPrompt] = useState(persisted.analysisPrompt);
  const [analysisResult, setAnalysisResult] = useState<MatrixAnalysisResponse | null>(
    persisted.analysisResult,
  );
  const [analysisError, setAnalysisError] = useState<string | null>(persisted.analysisError);
  const [analysisLoading, setAnalysisLoading] = useState(persisted.analysisLoading);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    persisted.selectedCandidateId,
  );
  const [promotedPlan, setPromotedPlan] = useState<MatrixPlan | null>(persisted.promotedPlan);
  const [promotionLoading, setPromotionLoading] = useState(persisted.promotionLoading);
  const [promotionError, setPromotionError] = useState<string | null>(persisted.promotionError);
  const [planRefreshError, setPlanRefreshError] = useState<string | null>(persisted.planRefreshError);
  const [planRefreshLoading, setPlanRefreshLoading] = useState(persisted.planRefreshLoading);
  const [approvalPending, setApprovalPending] = useState(persisted.approvalPending);
  const [executionResult, setExecutionResult] =
    useState<MatrixExecutionResult | null>(persisted.executionResult);
  const [executionLoading, setExecutionLoading] = useState(persisted.executionLoading);
  const [executionError, setExecutionError] = useState<string | null>(persisted.executionError);
  const [stalePlanDetected, setStalePlanDetected] = useState(persisted.stalePlanDetected);
  const [provenanceRoomId, setProvenanceRoomId] = useState(persisted.provenanceRoomId);
  const [provenance, setProvenance] = useState<MatrixProvenance | null>(persisted.provenance);
  const [provenanceError, setProvenanceError] = useState<string | null>(persisted.provenanceError);
  const [provenanceLoading, setProvenanceLoading] = useState(persisted.provenanceLoading);
  const [topicRoomId, setTopicRoomId] = useState(
    persisted.topicRoomId,
  );
  const [topicText, setTopicText] = useState(persisted.topicText);
  const [topicPlan, setTopicPlan] = useState<MatrixRoomTopicAgentPlan | null>(persisted.topicPlan);
  const [topicApprovalPending, setTopicApprovalPending] = useState(persisted.topicApprovalPending);
  const [topicExecution, setTopicExecution] =
    useState<MatrixRoomTopicExecutionResult | null>(persisted.topicExecution);
  const [topicVerification, setTopicVerification] =
    useState<MatrixRoomTopicVerificationResult | null>(persisted.topicVerification);
  const [topicPrepareLoading, setTopicPrepareLoading] = useState(persisted.topicPrepareLoading);
  const [topicPrepareError, setTopicPrepareError] = useState<string | null>(
    persisted.topicPrepareError,
  );
  const [topicExecuteLoading, setTopicExecuteLoading] = useState(persisted.topicExecuteLoading);
  const [topicExecuteError, setTopicExecuteError] = useState<string | null>(
    persisted.topicExecuteError,
  );
  const [topicVerifyLoading, setTopicVerifyLoading] = useState(persisted.topicVerifyLoading);
  const [topicVerifyError, setTopicVerifyError] = useState<string | null>(
    persisted.topicVerifyError,
  );
  const [topicPlanRefreshLoading, setTopicPlanRefreshLoading] =
    useState(persisted.topicPlanRefreshLoading);
  const [topicPlanRefreshError, setTopicPlanRefreshError] = useState<
    string | null
  >(persisted.topicPlanRefreshError);
  const [roomId, setRoomId] = useState<string | null>(persisted.roomId);
  const [roomName, setRoomName] = useState<string | null>(persisted.roomName);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(persisted.selectedEventId);
  const [selectedThreadRootId, setSelectedThreadRootId] = useState<string | null>(persisted.selectedThreadRootId);
  const [composerMode, setComposerMode] = useState<"post" | "reply" | "thread">(persisted.composerMode);
  const [composerTarget, setComposerTarget] = useState<MatrixComposerTarget>(persisted.composerTarget);
  const [draftContent, setDraftContent] = useState<string>(persisted.draftContent);
  const [lastActionResult, setLastActionResult] = useState<string | null>(persisted.lastActionResult);
  const summaryLoading = scopeSummaryStatus === "loading";
  const selectedSpaces = useMemo(
    () => selectedSpaceIds.filter((value) => value.trim().length > 0),
    [selectedSpaceIds],
  );
  const matrixReviewItems = useMemo<ReviewItem[]>(() => {
    const items: ReviewItem[] = [];

    if (promotedPlan) {
      const stale = Boolean(promotedPlan.stale || stalePlanDetected);
      items.push({
        id: promotedPlan.planId,
        source: "matrix" as const,
        title: promotedPlan.summary ?? "Matrix Vorschlag",
        summary: promotedPlan.rationale ?? "Freigabe erforderlich.",
        status: stale ? "stale" : "pending_review",
        stale,
        sourceLabel: "Matrix Workspace",
      });
    }

    if (topicPlan) {
      items.push({
        id: topicPlan.planId,
        source: "matrix" as const,
        title: "Room topic update plan",
        summary: `Current value: ${text(topicPlan.currentValue)} · Proposed value: ${text(topicPlan.proposedValue)} · Risk: ${topicPlan.risk}`,
        status: topicPlan.status === "executed" ? "executed" : "pending_review",
        stale: false,
        sourceLabel: "Matrix Workspace",
      });
    }

    return items;
  }, [promotedPlan, stalePlanDetected, topicPlan]);
  const matrixExpertDetails = useMemo(
    () => ({
      route: "/api/matrix/*",
      requestId: null,
      planId: promotedPlan?.planId ?? topicPlan?.planId ?? null,
      roomId: promotedPlan?.targetRoomId ?? topicPlan?.roomId ?? (topicRoomId || null),
      spaceId: selectedSpaces[0] ?? null,
      eventId: null,
      httpStatus: null,
      latency: null,
      backendRouteStatus: status === "error" ? "Nicht verfügbar" : "Aktiv",
      runtimeEventTrail: [
        currentScope ? "Bereich gewählt" : "Noch kein Bereich gewählt",
        scopeSummary ? "Zusammenfassung bereit" : "Zusammenfassung ausstehend",
        topicPlan ? "Topic plan ready" : "No topic plan",
      ],
      sseLifecycle: "n/a",
      rawPayload: topicPlan ? JSON.stringify(topicPlan, null, 2) : analysisResult ? JSON.stringify(analysisResult, null, 2) : null,
    }),
    [
      analysisResult,
      currentScope,
      promotedPlan?.planId,
      promotedPlan?.targetRoomId,
      scopeSummary,
      selectedSpaces,
      status,
      topicPlan,
      topicRoomId,
    ],
  );
  const matrixContextPayload = useMemo<MatrixWorkspaceStatus>(
    () => ({
      scopeLabel: currentScope ? "Bereich gewählt" : "Noch kein Bereich gewählt",
      summaryLabel: scopeSummary ? "Zusammenfassung bereit" : "Noch keine Zusammenfassung",
      approvalLabel:
        (promotedPlan && !promotedPlan.stale) || topicPlan?.status === "pending_review"
          ? "Freigabe erforderlich"
          : "Nicht erforderlich",
      safetyText: "Die App kann Informationen ansehen, aber nichts verändern.",
      expertDetails: matrixExpertDetails,
      reviewItems: matrixReviewItems,
    }),
    [currentScope, matrixExpertDetails, matrixReviewItems, promotedPlan, scopeSummary, topicPlan],
  );

  useEffect(() => {
    props.onContextChange(matrixContextPayload);
    props.onReviewItemsChange?.(matrixReviewItems);
  }, [matrixContextPayload, matrixReviewItems, props.onContextChange, props.onReviewItemsChange]);

  useEffect(() => {
    const snapshotMetadata = {
      ...props.session.metadata,
      mode,
      selectedRoomIds,
      selectedSpaceIds,
      analysisPrompt,
      currentScope,
      scopeSummary,
      scopeSummaryStatus,
      scopeSummaryError,
      scopeResolveLoading,
      scopeError,
      spaceHierarchy,
      spaceHierarchySpace,
      spaceHierarchyLoading,
      spaceHierarchyError,
      analysisResult,
      analysisError,
      analysisLoading,
      selectedCandidateId,
      promotedPlan,
      promotionLoading,
      promotionError,
      planRefreshError,
      planRefreshLoading,
      stalePlanDetected,
      approvalPending,
      executionResult,
      executionLoading,
      executionError,
      provenanceRoomId,
      provenance,
      provenanceError,
      provenanceLoading,
      topicRoomId,
      topicText,
      topicPlan,
      topicApprovalPending,
      topicExecution,
      topicVerification,
      topicPrepareLoading,
      topicPrepareError,
      topicExecuteLoading,
      topicExecuteError,
      topicVerifyLoading,
      topicVerifyError,
      topicPlanRefreshLoading,
      topicPlanRefreshError,
      roomId,
      roomName,
      selectedEventId,
      selectedThreadRootId,
      composerMode,
      composerTarget,
      draftContent,
      lastActionResult,
    };

    const nextSession: MatrixSession = {
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
    analysisError,
    analysisLoading,
    analysisPrompt,
    analysisResult,
    approvalPending,
    composerMode,
    composerTarget,
    currentScope,
    draftContent,
    executionError,
    executionLoading,
    executionResult,
    lastActionResult,
    mode,
    planRefreshError,
    planRefreshLoading,
    promotedPlan,
    provenance,
    provenanceError,
    provenanceLoading,
    provenanceRoomId,
    props.onSessionChange,
    props.session.id,
    promotionError,
    promotionLoading,
    roomId,
    roomName,
    scopeError,
    scopeResolveLoading,
    scopeSummary,
    scopeSummaryError,
    scopeSummaryStatus,
    selectedCandidateId,
    selectedEventId,
    selectedRoomIds,
    selectedSpaceIds,
    selectedThreadRootId,
    spaceHierarchy,
    spaceHierarchyError,
    spaceHierarchyLoading,
    spaceHierarchySpace,
    stalePlanDetected,
    topicApprovalPending,
    topicExecuteError,
    topicExecuteLoading,
    topicExecution,
    topicPlan,
    topicPlanRefreshError,
    topicPlanRefreshLoading,
    topicPrepareError,
    topicPrepareLoading,
    topicRoomId,
    topicText,
    topicVerification,
    topicVerifyError,
    topicVerifyLoading,
  ]);

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

  function getComposerRoomId() {
    const nextRoomId = roomId?.trim() || topicRoomId.trim() || selectedRoomIds[0]?.trim() || "";
    return nextRoomId;
  }

  function describeComposerTarget(target: MatrixComposerTarget) {
    switch (target.kind) {
      case "post":
        return target.previewLabel ?? `Neuer Post in Raum ${target.roomId}`;
      case "reply":
        return target.previewLabel ?? `Antwort auf Beitrag ${target.postId}`;
      case "thread":
        return target.previewLabel ?? `Antwort im Thread ${target.threadRootId}`;
      default:
        return target.previewLabel ?? "Neuer Post";
    }
  }

  function startNewPost(nextRoomId?: string) {
    const room = (nextRoomId ?? getComposerRoomId()).trim();
    if (!room) {
      setLastActionResult("Composer blockiert: kein Raum für einen neuen Post ausgewählt.");
      return;
    }

    setRoomId(room);
    const nextRoomName = roomName ?? (topicRoomId.trim().length > 0 ? topicRoomId.trim() : null);
    setRoomName(nextRoomName);
    setSelectedEventId(null);
    setSelectedThreadRootId(null);
    setComposerMode("post");
    setComposerTarget({
      kind: "post",
      roomId: room,
      postId: null,
      threadRootId: null,
      previewLabel: `Neuer Post in Raum ${room}`,
    });
    setLastActionResult(`Composer bereit: Neuer Post in Raum ${room}.`);
  }

  function startReplyToPost(postId: string, nextRoomId?: string) {
    const room = (nextRoomId ?? getComposerRoomId()).trim();
    if (!room || !postId.trim()) {
      setLastActionResult("Composer blockiert: Raum und Beitrag-ID sind für eine Antwort erforderlich.");
      return;
    }

    setRoomId(room);
    setSelectedEventId(postId);
    setSelectedThreadRootId(null);
    setComposerMode("reply");
    setComposerTarget({
      kind: "reply",
      roomId: room,
      postId,
      threadRootId: null,
      previewLabel: `Antwort auf Beitrag ${postId}`,
    });
    setLastActionResult(`Composer bereit: Antwort auf Beitrag ${postId}.`);
  }

  function startThreadFromPost(postId: string, nextRoomId?: string) {
    const room = (nextRoomId ?? getComposerRoomId()).trim();
    if (!room || !postId.trim()) {
      setLastActionResult("Composer blockiert: Raum und Beitrag-ID sind für einen Thread erforderlich.");
      return;
    }

    setRoomId(room);
    setSelectedEventId(postId);
    setSelectedThreadRootId(postId);
    setComposerMode("thread");
    setComposerTarget({
      kind: "thread",
      roomId: room,
      postId: null,
      threadRootId: postId,
      previewLabel: `Neuer Thread zu Beitrag ${postId}`,
    });
    setLastActionResult(`Composer bereit: Neuer Thread zu Beitrag ${postId}.`);
  }

  function startReplyInThread(threadRootId: string, eventId?: string, nextRoomId?: string) {
    const room = (nextRoomId ?? getComposerRoomId()).trim();
    if (!room || !threadRootId.trim()) {
      setLastActionResult("Composer blockiert: Raum und Thread-Root sind für eine Thread-Antwort erforderlich.");
      return;
    }

    setRoomId(room);
    setSelectedEventId(eventId?.trim() || null);
    setSelectedThreadRootId(threadRootId);
    setComposerMode("thread");
    setComposerTarget({
      kind: "thread",
      roomId: room,
      postId: null,
      threadRootId,
      previewLabel: eventId?.trim()
        ? `Antwort im Thread ${threadRootId} auf Ereignis ${eventId}`
        : `Antwort im Thread ${threadRootId}`,
    });
    setLastActionResult(`Composer bereit: Antwort im Thread ${threadRootId}.`);
  }

  function cancelComposerTarget() {
    setComposerMode("post");
    setComposerTarget({
      kind: "none",
      roomId: null,
      previewLabel: null,
    });
    setRoomId(null);
    setRoomName(null);
    setSelectedEventId(null);
    setSelectedThreadRootId(null);
    setLastActionResult("Composer-Ziel zurückgesetzt.");
  }

  function buildComposerPayload() {
    const targetRoomId = composerTarget.kind === "none" ? getComposerRoomId() : composerTarget.roomId;
    return {
      composerMode,
      targetContext: composerTarget,
      roomId: targetRoomId || null,
      selectedEventId,
      selectedThreadRootId,
      draftContent: draftContent.trim(),
    };
  }

  function submitMatrixComposer() {
    const payload = buildComposerPayload();
    if (composerTarget.kind === "none") {
      setLastActionResult("Composer blockiert: Kein explizites Ziel gesetzt.");
      return false;
    }

    if (!payload.roomId) {
      setLastActionResult("Composer blockiert: Kein Raum für den Submit verfügbar.");
      return false;
    }

    if (!payload.draftContent) {
      setLastActionResult("Composer blockiert: Inhalt fehlt.");
      return false;
    }

    setLastActionResult(
      `Composer-Submit blockiert: Kein Backend-Write-Contract für ${payload.composerMode} ist verdrahtet. fail-closed. Payload: ${JSON.stringify(payload)}`,
    );
    props.onTelemetry(
      "warning",
      "Matrix composer blocked",
      `Submit für ${payload.composerMode} bleibt fail-closed, bis ein Write-Contract existiert.`,
    );
    return false;
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
      props.onTelemetry(
        "info",
        "Matrix scope resolved",
        "Scope summary and provenance are ready.",
      );
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
      const plan = await analyzeRoomTopicUpdate({
        roomId,
        proposedValue: topic,
        scopeId: currentScope?.scopeId ?? null,
      });
      setTopicPlan(plan);
      setTopicApprovalPending(false);
    } catch (error) {
      setTopicPlan(null);
      setTopicPrepareError(
        describeMatrixError("Matrix room topic analyze", error),
      );
    } finally {
      setTopicPrepareLoading(false);
    }
  }

  async function refreshTopicUpdatePlan() {
    if (!topicPlan) {
      setTopicPlanRefreshError(
        "Analyze a topic update before refreshing the plan.",
      );
      return;
    }

    setTopicPlanRefreshLoading(true);
    setTopicPlanRefreshError(null);
    setTopicExecuteError(null);
    setTopicVerifyError(null);

    try {
      const refreshed = await fetchRoomTopicAnalysisPlan(topicPlan.planId);
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
      setTopicExecuteError("Analyze a topic update before execution.");
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
              ? "Matrix topic slice ready"
              : status === "partial"
                ? "Matrix topic slice partial"
                : status === "error"
                  ? "Matrix topic slice error"
                  : "Loading matrix topic slice"}
          </p>{" "}
          <h1>Matrix Workspace</h1>{" "}
          <p className="hero-copy">
            {" "}
            Backend-owned Explore, scope summary, provenance, analyze,
            review, approval, execute, and verify flow for Matrix topic
            updates only.{" "}
          </p>{" "}
          {props.restoredSession ? (
            <div className="restored-banner" data-testid="matrix-restored-banner">
              RESTORED_SESSION: local Matrix selection is visible, but backend
              freshness is not assumed.
            </div>
          ) : null}
          <div className="chip-row" aria-label="Matrix release scope">
            <span className="workflow-chip workflow-chip-complete">Explore</span>
            <span className="workflow-chip workflow-chip-complete">Scope summary</span>
            <span className="workflow-chip workflow-chip-complete">Provenance</span>
              <span className={`workflow-chip ${topicPlan ? "workflow-chip-active" : "workflow-chip-idle"}`}>
              Topic plan
            </span>
            <span className={`workflow-chip ${topicPlan && !topicApprovalPending ? "workflow-chip-active" : "workflow-chip-idle"}`}>
              Approval
            </span>
            <span className={`workflow-chip ${topicExecution ? "workflow-chip-complete" : "workflow-chip-idle"}`}>
              Execute
            </span>
            <span className={`workflow-chip ${topicVerification ? "workflow-chip-complete" : "workflow-chip-idle"}`}>
              Verify
            </span>
          </div>
          <div className="alert-banner">
            <p>{releaseScopeNotice}</p>
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
                "Scope summary",
                Boolean(scopeSummary) && !scopeSummaryError && !summaryLoading,
                Boolean(scopeSummary) && !scopeSummaryError && !summaryLoading,
              ],
              [
                "Provenance",
                Boolean(provenance) || provenanceLoading,
                Boolean(provenance) && !provenanceLoading,
              ],
              [
                "Topic plan",
                Boolean(topicPlan) || topicPrepareLoading,
                topicPlan?.status === "executed",
              ],
              [
                "Approval",
                Boolean(topicPlan) || topicApprovalPending,
                topicPlan?.status === "executed",
              ],
              [
                "Execute",
                topicExecuteLoading || Boolean(topicExecution),
                Boolean(topicExecution) && !topicExecuteLoading,
              ],
              [
                "Verify",
                topicVerifyLoading || Boolean(topicVerification),
                Boolean(topicVerification) && !topicVerifyLoading,
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
                <span>Slice: Topic update</span>
                <span>Scope: {currentScope?.scopeId ?? "none"}</span>
                <span>Rooms: {scopeSummary?.items.length ?? 0}</span>
                <span>Topic plan: {topicPlan ? (topicPlan.status === "executed" ? "Executed" : "Ready") : "None"}</span>
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
          data-testid="matrix-topic-update-panel"
        >
          {" "}
          <header className="card-header">
            <div>
              <span>Room topic update</span>
              <strong>
                Analyze, approve, execute, and verify a backend-owned topic change
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
              {topicPrepareLoading ? "Analyzing…" : "Analyze topic update"}
            </button>
            <span className="muted-copy">
              {props.expertMode ? "The browser only sends a room ID, proposed topic text, and approval intent. The backend reads the current room state and builds the plan." : "Nur nach Freigabe."}
            </span>
          </div>{" "}
          {topicPrepareError ? (
            <p className="error-banner" data-testid="matrix-topic-analyze-error">
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
                      ? "Approval pending"
                      : "Plan executed"}
                  </span>
                </div>
              </div>
              <div className="detail-grid">
                {props.expertMode ? (
                  <>
                    <div>
                      <span>Room ID</span>
                      <strong>{topicPlan.roomId}</strong>
                    </div>
                    <div>
                      <span>Scope ID</span>
                      <strong>{text(topicPlan.scopeId)}</strong>
                    </div>
                    <div>
                      <span>Snapshot ID</span>
                      <strong>{text(topicPlan.snapshotId)}</strong>
                    </div>
                  </>
                ) : null}
                <div>
                  <span>Status</span>
                  <strong>{topicPlan.status}</strong>
                </div>
                <div>
                  <span>Risk</span>
                  <strong>{topicPlan.risk}</strong>
                </div>
                <div>
                  <span>Requires approval</span>
                  <strong>{String(topicPlan.requiresApproval)}</strong>
                </div>
                <div>
                  <span>Actions</span>
                  <strong>{topicPlan.actions.length}</strong>
                </div>
                <div>
                  <span>Expires at</span>
                  <strong>{formatDate(topicPlan.expiresAt)}</strong>
                </div>
              </div>
              <div className="delta-grid">
                <div>
                  <p className="info-label">Current value</p>
                  <pre>{text(topicPlan.currentValue)}</pre>
                </div>
                <div>
                  <p className="info-label">Proposed value</p>
                  <pre>{text(topicPlan.proposedValue)}</pre>
                </div>
              </div>
              <div className="list-block">
                <p className="info-label">Actions</p>
                <div className="chip-list">
                  {topicPlan.actions.map((action, index) => (
                    <span key={`${action.type}:${index}`} className="reference-chip">
                      {action.type} · {action.roomId}
                    </span>
                  ))}
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
                ? "Enter a room ID and proposed topic, then analyze a backend-owned topic update plan."
                : "Bereich wählen, dann Topic Update analysieren."}
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
                    : "Resolve scope"}
                </button>
                <span className="muted-copy">
                  Backend resolves the scope and loads the current summary.
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
        <section className="workspace-card" data-testid="matrix-composer-panel">
          <header className="card-header">
            <div>
              <span>Composer</span>
              <strong>Matrix post, reply, thread, or thread reply</strong>
            </div>
          </header>

          <div className="info-block">
            <p className="info-label">Composer mode</p>
            <div className="chip-list" data-testid="matrix-composer-mode">
              <span className="workflow-chip workflow-chip-active" data-testid="matrix-composer-mode-label">
                {composerMode}
              </span>
              <span className="reference-chip">{describeComposerTarget(composerTarget)}</span>
            </div>
          </div>

          <div className="action-row">
            <button
              type="button"
              className="secondary-button"
              onClick={() => startNewPost()}
              data-testid="matrix-new-post"
            >
              Neuer Post
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => startReplyToPost(selectedEventId ?? "")}
              disabled={!selectedEventId}
              data-testid="matrix-reply"
            >
              Auf Post antworten
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => startThreadFromPost(selectedEventId ?? selectedThreadRootId ?? "")}
              disabled={!(selectedEventId || selectedThreadRootId)}
              data-testid="matrix-thread"
            >
              Thread starten
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => startReplyInThread(selectedThreadRootId ?? "", selectedEventId ?? undefined)}
              disabled={!selectedThreadRootId}
              data-testid="matrix-reply-in-thread"
            >
              Im Thread antworten
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={cancelComposerTarget}
              data-testid="matrix-composer-cancel"
            >
              Ziel löschen
            </button>
          </div>

          <div className="info-block">
            <p className="info-label">Target context</p>
            <div className="detail-grid">
              <div>
                <span>Room ID</span>
                <input
                  type="text"
                  value={roomId ?? ""}
                  onChange={(event) => setRoomId(event.target.value.trim().length > 0 ? event.target.value : null)}
                  placeholder="!room:matrix.example"
                  data-testid="matrix-composer-room-id"
                />
              </div>
              <div>
                <span>Room name</span>
                <input
                  type="text"
                  value={roomName ?? ""}
                  onChange={(event) => setRoomName(event.target.value.trim().length > 0 ? event.target.value : null)}
                  placeholder="Room name"
                  data-testid="matrix-composer-room-name"
                />
              </div>
              <div>
                <span>Post ID</span>
                <input
                  type="text"
                  value={selectedEventId ?? ""}
                  onChange={(event) => setSelectedEventId(event.target.value.trim().length > 0 ? event.target.value : null)}
                  placeholder="event id"
                  data-testid="matrix-composer-post-id"
                />
              </div>
              <div>
                <span>Thread root ID</span>
                <input
                  type="text"
                  value={selectedThreadRootId ?? ""}
                  onChange={(event) => setSelectedThreadRootId(event.target.value.trim().length > 0 ? event.target.value : null)}
                  placeholder="thread root id"
                  data-testid="matrix-composer-thread-root-id"
                />
              </div>
            </div>
          </div>

          <div className="info-block">
            <p className="info-label">Draft</p>
            <textarea
              className="matrix-textarea"
              rows={4}
              value={draftContent}
              onChange={(event) => setDraftContent(event.target.value)}
              placeholder="Composer draft content"
              aria-label="Matrix composer draft"
              data-testid="matrix-composer-draft"
            />
          </div>

          <div className="action-row">
            <button type="button" onClick={submitMatrixComposer} data-testid="matrix-composer-submit">
              Submit composer
            </button>
            <span className="muted-copy">
              {composerTarget.kind === "none"
                ? "Der Submit bleibt blockiert, bis ein Ziel explizit gesetzt ist."
                : "Der Submit ist derzeit fail-closed, weil kein Write-Contract im Backend verdrahtet ist."}
            </span>
          </div>

          {lastActionResult ? (
            <p className="info-note" data-testid="matrix-composer-result">
              {lastActionResult}
            </p>
          ) : null}
        </section>{" "}
        <div className="matrix-column">
          {" "}
          <section className="workspace-card">
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
