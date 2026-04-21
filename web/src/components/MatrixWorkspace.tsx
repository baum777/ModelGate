import { useEffect, useMemo, useState } from "react";
import {
  ApprovalTransitionCard,
  DecisionZone,
  ExecutionReceiptCard,
  ProposalCard,
} from "./ApprovalPrimitives.js";
import { ExpertDetails } from "./ExpertDetails.js";
import {
  MATRIX_API_BASE_URL,
  analyzeRoomTopicUpdate,
  executeRoomTopicUpdate,
  fetchJoinedRooms,
  fetchMatrixWhoAmI,
  fetchProvenance,
  fetchRoomHierarchy,
  fetchScopeSummary,
  fetchRoomTopicAnalysisPlan,
  resolveScope,
  MatrixRequestError,
  type MatrixJoinedRoom,
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
  type MatrixComposerMode,
  type MatrixComposerTarget,
  type MatrixSession,
} from "../lib/workspace-state.js";
import {
  BACKEND_TRUTH_UNAVAILABLE,
  buildGovernanceMetadataRows,
  mergeMetadataRows,
} from "../lib/governance-metadata.js";

type WorkflowStatus = "loading" | "partial" | "ready" | "error";
type LoadStatus = "idle" | "loading" | "ready" | "error";

export type MatrixWorkspaceStatus = {
  identityLabel: string;
  connectionLabel: string;
  homeserverLabel: string;
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
    composerMode: MatrixComposerMode;
    composerRoomId: string | null;
    composerEventId: string | null;
    composerThreadRootId: string | null;
    composerTargetLabel: string;
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
  "Backend-gesteuerte Matrix-Topic-Updates sind für Explore, Scope-Summary, read-only Provenienz, Analyse, Review, Freigabe, Ausführung und Verifikation verfügbar.";

export function buildMatrixReviewItems(
  topicPlan: MatrixRoomTopicAgentPlan | null,
  topicExecution: MatrixRoomTopicExecutionResult | null,
  topicVerification: MatrixRoomTopicVerificationResult | null,
  actingIdentity: string | null
): ReviewItem[] {
  if (!topicPlan) {
    return [];
  }

  const status = topicVerification?.status === "verified"
    ? "executed"
    : topicVerification?.status === "failed" || topicVerification?.status === "mismatch"
      ? "rejected"
      : topicExecution
        ? "approved"
        : topicPlan.status === "executed"
          ? "approved"
          : "pending_review";
  const receiptSummary = topicVerification
    ? `verification ${topicVerification.status}`
    : topicExecution
      ? "execution recorded, verification pending"
      : "proposal pending approval";

  return [
    {
      id: topicPlan.planId,
      source: "matrix",
      title: "Plan zur Raumtopic-Aktualisierung",
      summary: `Aktuell: ${text(topicPlan.currentValue)} · Vorgeschlagen: ${text(topicPlan.proposedValue)} · Risiko: ${topicPlan.risk} · ${receiptSummary}`,
      status,
      stale: false,
      sourceLabel: "Matrix Workspace",
      provenanceRows: mergeMetadataRows(
        buildGovernanceMetadataRows({
          actingIdentity: actingIdentity ?? BACKEND_TRUTH_UNAVAILABLE,
          activeScope: topicPlan.scopeId ?? BACKEND_TRUTH_UNAVAILABLE,
          authorityDomain: "matrix backend action routes",
          targetScope: topicPlan.roomId,
          executionDomain: "matrix room topic execute/verify routes",
          executionTarget: topicExecution ? `transaction ${topicExecution.transactionId}` : topicPlan.roomId,
          provenanceSummary: topicPlan.snapshotId ? `snapshot ${topicPlan.snapshotId}` : "scope snapshot not provided by backend",
          receiptSummary
        }),
        [{ label: "Risk", value: topicPlan.risk }]
      ),
    },
  ];
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
  const matrixReviewItems = useMemo<ReviewItem[]>(
    () => buildMatrixReviewItems(topicPlan, topicExecution, topicVerification, whoami?.userId ?? null),
    [topicExecution, topicPlan, topicVerification, whoami?.userId]
  );
  const activeComposerRoomId = roomId?.trim() || topicRoomId.trim() || selectedRoomIds[0]?.trim() || null;
  const threadOpenSourceId = selectedThreadRootId?.trim() || selectedEventId?.trim() || null;
  const activeThreadRootId = selectedThreadRootId?.trim() || null;
  const identityLabel = whoami
    ? whoami.userId
    : identityError
      ? "Identität nicht aufgelöst"
      : "Identität wird geladen";
  const connectionLabel = status === "ready"
    ? "Verbunden"
    : status === "partial"
      ? "Teilweise verbunden"
      : status === "error"
        ? "Nicht verbunden"
        : "Wird geprüft";
  const homeserverLabel = whoami?.homeserver ?? "n/a";
  const matrixExpertDetails = useMemo(
    () => ({
      route: "/api/matrix/*",
      requestId: null,
      planId: topicPlan?.planId ?? null,
      roomId: topicPlan?.roomId ?? (topicRoomId || null),
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
      rawPayload: topicPlan ? JSON.stringify(topicPlan, null, 2) : null,
      composerMode,
      composerRoomId: activeComposerRoomId,
      composerEventId: selectedEventId,
      composerThreadRootId: activeThreadRootId,
      composerTargetLabel: describeComposerTarget(composerTarget),
    }),
    [
      currentScope,
      scopeSummary,
      selectedSpaces,
      status,
      topicPlan,
      topicRoomId,
      composerMode,
      activeComposerRoomId,
      selectedEventId,
      activeThreadRootId,
      composerTarget,
    ],
  );
  const matrixContextPayload = useMemo<MatrixWorkspaceStatus>(
    () => ({
      identityLabel,
      connectionLabel,
      homeserverLabel,
      scopeLabel: currentScope ? "Bereich gewählt" : "Noch kein Bereich gewählt",
      summaryLabel: scopeSummary ? "Zusammenfassung bereit" : "Noch keine Zusammenfassung",
      approvalLabel: topicPlan
        ? topicPlan.status === "pending_review"
          ? "Freigabe erforderlich"
          : topicVerification?.status === "verified"
            ? "Beleg verifiziert"
            : topicVerification?.status === "failed" || topicVerification?.status === "mismatch"
              ? "Beleg mit Abweichung"
              : topicExecution
                ? "Ausführungsbeleg offen"
                : "Prüfung gesperrt"
        : "Nicht erforderlich",
      safetyText: "Der Browser kann Daten ansehen und Freigabeabsichten senden; backend-gesteuerte Writes bleiben freigabegeschützt.",
      expertDetails: matrixExpertDetails,
      reviewItems: matrixReviewItems,
    }),
    [connectionLabel, currentScope, identityLabel, homeserverLabel, matrixExpertDetails, matrixReviewItems, scopeSummary, topicExecution, topicPlan, topicVerification],
  );

  useEffect(() => {
    props.onContextChange(matrixContextPayload);
    props.onReviewItemsChange?.(matrixReviewItems);
  }, [matrixContextPayload, matrixReviewItems, props.onContextChange, props.onReviewItemsChange]);

  useEffect(() => {
    const snapshotMetadata = {
      ...props.session.metadata,
      selectedRoomIds,
      selectedSpaceIds,
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
    composerMode,
    composerTarget,
    currentScope,
    draftContent,
    lastActionResult,
    provenance,
    provenanceError,
    provenanceLoading,
    provenanceRoomId,
    props.onSessionChange,
    props.session.id,
    roomId,
    roomName,
    scopeError,
    scopeResolveLoading,
    scopeSummary,
    scopeSummaryError,
    scopeSummaryStatus,
    selectedEventId,
    selectedRoomIds,
    selectedSpaceIds,
    selectedThreadRootId,
    spaceHierarchy,
    spaceHierarchyError,
    spaceHierarchyLoading,
    spaceHierarchySpace,
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

  function describeComposerMode(mode: MatrixComposerMode) {
    switch (mode) {
      case "reply":
        return "Antwort auf einen Beitrag";
      case "thread":
        return "Thread-Kontext";
      default:
        return "Neuer Post";
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

  function openThreadContext(nextRoomId?: string) {
    const room = (nextRoomId ?? getComposerRoomId()).trim();
    const threadRootId = selectedThreadRootId?.trim() || selectedEventId?.trim() || "";

    if (!room || !threadRootId) {
      setLastActionResult("Thread öffnen blockiert: Raum und Beitrag oder Thread-Root sind erforderlich.");
      return;
    }

    setRoomId(room);
    setComposerMode("thread");
    setComposerTarget({
      kind: "thread",
      roomId: room,
      postId: null,
      threadRootId,
      previewLabel: `Thread geöffnet zu Beitrag ${threadRootId}`,
    });
    setSelectedThreadRootId(threadRootId);
    setLastActionResult(`Thread-Kontext geöffnet: Beitrag ${threadRootId} im Raum ${room}.`);
  }

  function leaveThreadContext() {
    const room = getComposerRoomId().trim();

    setSelectedThreadRootId(null);
    setComposerMode("post");

    if (room) {
      setRoomId(room);
      setComposerTarget({
        kind: "post",
        roomId: room,
        postId: null,
        threadRootId: null,
        previewLabel: `Neuer Post in Raum ${room}`,
      });
      setLastActionResult(`Thread-Kontext verlassen: zurück im Raum ${room}.`);
      return;
    }

    setComposerTarget({
      kind: "none",
      roomId: null,
      previewLabel: null,
    });
    setLastActionResult("Thread-Kontext verlassen.");
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

  async function handleResolveScope() {
    const resolved = await resolveCurrentScope();
    if (resolved) {
      props.onTelemetry(
        "info",
        "Matrix scope resolved",
        "Scope summary and provenance are ready.",
      );
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
        "Analysiere zuerst ein Topic-Update, bevor du den Plan aktualisierst.",
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

  async function executeTopicUpdate(approvalIntent = topicApprovalPending) {
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

    if (!approvalIntent) {
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
      setTopicApprovalPending(false);
      setTopicExecuteError(
        describeMatrixError("Matrix room topic execute", error),
      );
    } finally {
      setTopicExecuteLoading(false);
    }
  }
  return (
    <section
      className="workspace-panel matrix-workspace"
      data-testid="matrix-workspace"
      aria-busy={status !== "ready" || scopeResolveLoading || spaceHierarchyLoading || provenanceLoading || topicPrepareLoading || topicExecuteLoading || topicVerifyLoading}
    >
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
            Backend-gesteuerter Explore-, Scope-Summary-, Provenienz-, Analyse-,
            Review-, Freigabe-, Ausführungs- und Verifikationsfluss für
            Matrix-Topic-Updates.{" "}
          </p>{" "}
          {props.restoredSession ? (
            <div className="restored-banner" data-testid="matrix-restored-banner">
              RESTORED_SESSION: lokale Matrix-Auswahl ist sichtbar, aber
              Backend-Frische wird nicht angenommen.
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
                <span>Freigabe: {topicPlan ? "Nötig" : "Nicht erforderlich"}</span>
                <span>Sicherheit: Nur Lesen aktiv</span>
              </>
            )}
          </div>{" "}
          <p className="workspace-summary-note">{releaseScopeNotice}</p>
        </aside>{" "}
      </section>{" "}
      {status !== "ready" || identityError || roomsError ? (
        <section className="alert-banner" role="status" aria-live="polite">
          <p>
            {props.expertMode
              ? `Matrix bootstrap ${status}. Origin: ${MATRIX_API_BASE_URL}.`
              : `Matrix bootstrap ${status}.`}
            {identityError || roomsError
              ? ` ${identityError ? "Identity check failed." : ""}${identityError && roomsError ? " " : ""}${roomsError ? "Joined rooms could not be loaded." : ""}`
              : ""}
          </p>
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
              <span>Raumtopic-Aktualisierung</span>
              <strong>
                Analysieren, freigeben, ausführen und verifizieren eines backend-gesteuerten Topic-Wechsels
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
            <ProposalCard
              testId="matrix-topic-plan"
              title="Raumtopic aktualisieren"
              summary={topicPlan.proposedValue}
              consequence="Der Backend-Readback aktualisiert das Raumtopic erst nach expliziter Freigabe."
              statusLabel={
                topicPlan.status === "pending_review"
                  ? "Freigabe erforderlich"
                  : topicVerification?.status === "verified"
                    ? "Beleg verifiziert"
                    : topicExecution
                      ? "Ausführungsbeleg offen"
                      : "Plan ausgeführt"
              }
              statusTone={
                topicPlan.status === "pending_review"
                  ? "partial"
                  : topicVerification?.status === "failed"
                    ? "error"
                    : topicVerification?.status === "mismatch"
                      ? "error"
                      : "ready"
              }
              metadata={mergeMetadataRows(
                buildGovernanceMetadataRows({
                  actingIdentity: whoami?.userId ?? BACKEND_TRUTH_UNAVAILABLE,
                  activeScope: topicPlan.scopeId ?? BACKEND_TRUTH_UNAVAILABLE,
                  authorityDomain: "matrix backend action routes",
                  targetScope: topicPlan.roomId,
                  executionDomain: "matrix room topic execute/verify routes",
                  executionTarget: topicPlan.roomId,
                  provenanceSummary: topicPlan.snapshotId ? `snapshot ${topicPlan.snapshotId}` : "scope snapshot not provided by backend",
                  receiptSummary: topicVerification?.status ?? "proposal pending approval",
                }),
                [
                  { label: "Risk", value: topicPlan.risk },
                  { label: "Expires", value: formatDate(topicPlan.expiresAt) },
                ]
              )}
            >
              <div className="detail-grid">
                {props.expertMode ? (
                  <>
                    <div>
                      <span>Status</span>
                      <strong>{topicPlan.status}</strong>
                    </div>
                    <div>
                      <span>Requires approval</span>
                      <strong>{String(topicPlan.requiresApproval)}</strong>
                    </div>
                    <div>
                      <span>Actions</span>
                      <strong>{topicPlan.actions.length}</strong>
                    </div>
                  </>
                ) : null}
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

              {topicPlan.status === "pending_review" ? (
                <>
                  {topicExecuteLoading || topicVerifyLoading ? (
                    <ApprovalTransitionCard
                      testId="matrix-topic-transition"
                      title="Matrix topic approval is being applied"
                      detail="Backend-Ausführung und Verifikation laufen für den ausgewählten Raum."
                    />
                  ) : null}
                  <DecisionZone
                    testId="matrix-topic-decision"
                    approveLabel={topicExecuteLoading ? "Ausführung läuft…" : "Freigeben und ausführen"}
                    rejectLabel="Vorschlag ablehnen"
                    onApprove={() => {
                      setTopicApprovalPending(true);
                      void executeTopicUpdate(true);
                    }}
                    onReject={() => {
                      setTopicApprovalPending(false);
                      setLastActionResult("Freigabe verworfen: keine Ausführung gestartet.");
                      props.onTelemetry("warning", "Matrix proposal rejected", "Die lokale Freigabeabsicht wurde verworfen.");
                    }}
                    approveDisabled={
                      topicExecuteLoading ||
                      topicVerifyLoading ||
                      topicPlanRefreshLoading ||
                      topicPlan.status !== "pending_review"
                    }
                    rejectDisabled={
                      topicExecuteLoading ||
                      topicVerifyLoading ||
                      topicPlanRefreshLoading ||
                      topicPlan.status !== "pending_review"
                    }
                    busy={topicExecuteLoading || topicVerifyLoading}
                    helperText="Freigeben sendet eine Backend-Freigabeabsicht. Ablehnen löscht nur die lokale Freigabeabsicht."
                  />
                </>
              ) : null}

              <div className="action-row">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    void refreshTopicUpdatePlan();
                  }}
                  disabled={topicPlanRefreshLoading}
                  data-testid="matrix-topic-refresh"
                >
                  {topicPlanRefreshLoading ? "Aktualisiere…" : "Plan aktualisieren"}
                </button>
                <span className="muted-copy">
                  Die Verifikation läuft als Backend-Readback nach der Ausführung.
                </span>
              </div>

              {topicExecution ? (
                <ExecutionReceiptCard
                  title="Ausführungsbeleg für Raumtopic"
                  detail="Der Backend-Readback bleibt die Quelle der Wahrheit."
                  outcome={
                    topicVerification?.status === "failed"
                      ? "failed"
                      : topicVerification?.status === "mismatch"
                        ? "unverifiable"
                        : "executed"
                  }
                  metadata={mergeMetadataRows(
                    buildGovernanceMetadataRows({
                      actingIdentity: whoami?.userId ?? BACKEND_TRUTH_UNAVAILABLE,
                      activeScope: topicPlan.scopeId ?? BACKEND_TRUTH_UNAVAILABLE,
                      authorityDomain: "matrix backend action routes",
                      targetScope: topicPlan.roomId,
                      executionDomain: "matrix room topic execute/verify routes",
                      executionTarget: `transaction ${topicExecution.transactionId}`,
                      provenanceSummary: topicPlan.snapshotId ? `snapshot ${topicPlan.snapshotId}` : "scope snapshot not provided by backend",
                      receiptSummary: topicVerification?.status ?? topicExecution.status,
                    }),
                    [
                      { label: "Transaction ID", value: topicExecution.transactionId },
                      { label: "Executed at", value: formatDate(topicExecution.executedAt) },
                      { label: "Status", value: topicExecution.status },
                    ]
                  )}
                  testId="matrix-topic-execution"
                >
                  {topicVerifyLoading ? (
                    <p className="muted-copy">Backend-Readback wird verifiziert…</p>
                  ) : null}
                </ExecutionReceiptCard>
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
            </ProposalCard>
          ) : (
              <p className="empty-state">
              {props.expertMode
                ? "Raum-ID und Vorschlag eintragen, dann den backend-gesteuerten Topic-Update-Plan analysieren."
                : "Bereich wählen, dann Topic Update analysieren."}
            </p>
          )}{" "}
        </section>{" "}
        <section className="workspace-card">
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
                    {props.expertMode ? (
                      <button
                        type="button"
                        className="chip-action"
                        onClick={() => void loadHierarchy(spaceId)}
                      >
                        Browser-Vorschau
                      </button>
                    ) : null}
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
                    void handleResolveScope();
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
            {props.expertMode ? (
              <div className="info-block">
                {" "}
                <p className="info-label">Hierarchy preview (advisory)</p>{" "}
                <p className="muted-copy">
                  Browser-side mock only. Not backend-verified or write-authoritative.
                </p>{" "}
                {spaceHierarchySpace ? (
                  <div className="scope-summary">
                    {" "}
                    <div className="scope-summary-meta">
                      <span>Space ID: {spaceHierarchySpace}</span>
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
                              <span>{text(room.canonical_alias ?? null)}</span>
                            </div>
                            <small>
                              {`${text(room.room_type ?? null)} · ${room.room_id ?? "unknown room"}`}
                            </small>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-state">
                        No preview rooms returned yet.
                      </p>
                    )}{" "}
                  </div>
                ) : (
                  <p className="empty-state">
                    Add or preview a space ID to inspect the browser-side hierarchy mock.
                  </p>
                )}{" "}
              </div>
            ) : null}{" "}
          </div>{" "}
        </section>{" "}
        <section className="workspace-card" data-testid="matrix-composer-panel">
          <header className="card-header">
            <div>
              <span>Composer</span>
              <strong>Matrix post, reply, thread, or thread reply</strong>
            </div>
          </header>

          <div className="matrix-thread-context-card" data-testid="matrix-thread-context">
            <div className="matrix-thread-context-copy">
              <p className="info-label">Thread-Kontext</p>
              <strong>
                {activeThreadRootId
                  ? `Thread zu Beitrag ${activeThreadRootId}`
                  : "Noch kein Thread geöffnet"}
              </strong>
              <p className="muted-copy">
                {activeThreadRootId
                  ? "Der Composer schreibt in den geöffneten Thread. Mit Thread verlassen kehrst du in den Raumkontext zurück."
                  : "Wähle einen Beitrag oder Root, um explizit in einen Thread-Kontext zu wechseln."}
              </p>
            </div>
            <div className="matrix-thread-context-meta">
              <span className="reference-chip">Raum: {activeComposerRoomId ?? "n/a"}</span>
              <span className="reference-chip">Beitrag: {selectedEventId?.trim() || "n/a"}</span>
              <span className="reference-chip">Root: {activeThreadRootId ?? "n/a"}</span>
            </div>
            <div className="matrix-thread-context-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  openThreadContext();
                }}
                disabled={!threadOpenSourceId}
                data-testid="matrix-thread-open"
              >
                Thread öffnen
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={leaveThreadContext}
                disabled={!selectedThreadRootId}
                data-testid="matrix-thread-leave"
              >
                Thread verlassen
              </button>
            </div>
          </div>

          <div className="matrix-composer-banner">
            <div>
              <p className="info-label">Composer-Kontext</p>
              <strong>{describeComposerMode(composerMode)}</strong>
              <p className="muted-copy">{describeComposerTarget(composerTarget)}</p>
            </div>
            <div className="matrix-composer-banner-meta">
              <span className={`status-pill status-${composerTarget.kind === "none" ? "partial" : "ready"}`}>
                {composerTarget.kind === "none" ? "Ziel fehlt" : "Ziel gesetzt"}
              </span>
              <span className="reference-chip">
                Raum: {roomName ?? roomId ?? topicRoomId ?? selectedRoomIds[0] ?? "n/a"}
              </span>
            </div>
          </div>

          <div className="info-block">
            <p className="info-label">Composer mode</p>
            <div className="chip-list" data-testid="matrix-composer-mode">
              <span className="workflow-chip workflow-chip-active" data-testid="matrix-composer-mode-label">
                {composerMode}
              </span>
              <span className="reference-chip">{describeComposerTarget(composerTarget)}</span>
            </div>
          </div>

          <div className="matrix-composer-actions">
            <button
              type="button"
              className="matrix-composer-primary-action"
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
              Antworten
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
              rows={5}
              value={draftContent}
              onChange={(event) => setDraftContent(event.target.value)}
              placeholder="Composer draft content"
              aria-label="Matrix composer draft"
              data-testid="matrix-composer-draft"
            />
          </div>

          <div className="action-row">
            <button type="button" onClick={submitMatrixComposer} data-testid="matrix-composer-submit">
              Submit (fail-closed)
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
      </section>{" "}
    </section>
  );
}
