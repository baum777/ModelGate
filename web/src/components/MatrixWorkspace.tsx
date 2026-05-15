import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useLocalization, type Locale } from "../lib/localization.js";
import { GuideOverlay, getWorkspaceGuide } from "./GuideOverlay.js";
import { EmptyStateCTA } from "./EmptyStateCTA.js";
import { getWorkModeCopy, type WorkMode } from "../lib/work-mode.js";

type WorkflowStatus = "loading" | "partial" | "ready" | "error";
type LoadStatus = "idle" | "loading" | "ready" | "error";

const MATRIX_VISIBLE_LIST_LIMIT = 80;
const MATRIX_SESSION_SYNC_INTERVAL_MS = 220;

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
  workMode: WorkMode;
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

type MatrixLocaleText = {
  reviewSourceLabel: string;
  reviewReceiptPending: string;
  reviewReceiptExecutionPending: string;
  reviewReceiptVerification: (status: string) => string;
  governanceAuthorityDomain: string;
  governanceExecutionDomain: string;
  governanceSnapshotSummary: (snapshotId: string | null) => string;
  governanceExecutionTargetTransaction: (transactionId: string) => string;
  metadataRiskLabel: string;
  metadataExpiresLabel: string;
  metadataTransactionIdLabel: string;
  roomTypeFallback: string;
  unknownRoomFallback: string;
  runtimeTopicPlanReady: string;
  runtimeNoTopicPlan: string;
  operationWhoAmI: string;
  operationJoinedRooms: string;
  operationProvenance: string;
  operationHierarchy: string;
  operationScopeSummary: string;
  operationScopeResolve: string;
  operationTopicVerify: string;
  operationTopicAnalyze: string;
  operationTopicRefresh: string;
  operationTopicExecute: string;
  telemetryStateRestored: string;
  telemetryStateRestoredDetail: string;
  telemetryComposerBlocked: string;
  telemetryComposerBlockedDetail: (mode: MatrixComposerMode) => string;
  telemetryScopeResolved: string;
  telemetryScopeResolvedDetail: string;
  telemetryProposalRejected: string;
  telemetryProposalRejectedDetail: string;
};

function getMatrixLocaleText(locale: Locale): MatrixLocaleText {
  if (locale === "de") {
    return {
      reviewSourceLabel: "Matrix-Workspace",
      reviewReceiptPending: "Vorschlag wartet auf Freigabe",
      reviewReceiptExecutionPending: "Ausführung protokolliert, Prüfung ausstehend",
      reviewReceiptVerification: (status) => `Prüfung ${status}`,
      governanceAuthorityDomain: "Matrix-Backend-Aktionsrouten",
      governanceExecutionDomain: "Matrix-Raumtopic-Ausführung/Prüfung",
      governanceSnapshotSummary: (snapshotId) =>
        snapshotId ? `Snapshot ${snapshotId}` : "Scope-Snapshot wurde vom Backend nicht geliefert",
      governanceExecutionTargetTransaction: (transactionId) => `Transaktion ${transactionId}`,
      metadataRiskLabel: "Risiko",
      metadataExpiresLabel: "Läuft ab",
      metadataTransactionIdLabel: "Transaktions-ID",
      roomTypeFallback: "Raum",
      unknownRoomFallback: "unbekannter Raum",
      runtimeTopicPlanReady: "Topic-Plan bereit",
      runtimeNoTopicPlan: "Kein Topic-Plan",
      operationWhoAmI: "Matrix WhoAmI",
      operationJoinedRooms: "Matrix beigetretene Räume",
      operationProvenance: "Matrix Provenienz",
      operationHierarchy: "Matrix Hierarchie",
      operationScopeSummary: "Matrix Scope-Zusammenfassung",
      operationScopeResolve: "Matrix Scope-Auflösung",
      operationTopicVerify: "Matrix Raumtopic-Verifikation",
      operationTopicAnalyze: "Matrix Raumtopic-Analyse",
      operationTopicRefresh: "Matrix Raumtopic-Aktualisierung",
      operationTopicExecute: "Matrix Raumtopic-Ausführung",
      telemetryStateRestored: "Matrix-Zustand wiederhergestellt",
      telemetryStateRestoredDetail: "Lokale Matrix-Auswahl und Modus wurden im Browser wiederhergestellt.",
      telemetryComposerBlocked: "Matrix-Composer blockiert",
      telemetryComposerBlockedDetail: (mode) => `Submit für ${mode} bleibt fail-closed, bis ein Write-Contract existiert.`,
      telemetryScopeResolved: "Matrix-Scope aufgelöst",
      telemetryScopeResolvedDetail: "Scope-Zusammenfassung und Provenienz sind bereit.",
      telemetryProposalRejected: "Matrix-Vorschlag abgelehnt",
      telemetryProposalRejectedDetail: "Die lokale Freigabeabsicht wurde verworfen.",
    };
  }

  return {
    reviewSourceLabel: "Matrix workspace",
    reviewReceiptPending: "Proposal pending approval",
    reviewReceiptExecutionPending: "Execution recorded, verification pending",
    reviewReceiptVerification: (status) => `verification ${status}`,
    governanceAuthorityDomain: "Matrix backend action routes",
    governanceExecutionDomain: "Matrix room topic execute/verify routes",
    governanceSnapshotSummary: (snapshotId) =>
      snapshotId ? `snapshot ${snapshotId}` : "scope snapshot not provided by backend",
    governanceExecutionTargetTransaction: (transactionId) => `transaction ${transactionId}`,
    metadataRiskLabel: "Risk",
    metadataExpiresLabel: "Expires",
    metadataTransactionIdLabel: "Transaction ID",
    roomTypeFallback: "room",
    unknownRoomFallback: "unknown room",
    runtimeTopicPlanReady: "Topic plan ready",
    runtimeNoTopicPlan: "No topic plan",
    operationWhoAmI: "Matrix whoami",
    operationJoinedRooms: "Matrix joined rooms",
    operationProvenance: "Matrix provenance",
    operationHierarchy: "Matrix hierarchy",
    operationScopeSummary: "Matrix scope summary",
    operationScopeResolve: "Matrix scope resolve",
    operationTopicVerify: "Matrix room topic verify",
    operationTopicAnalyze: "Matrix room topic analyze",
    operationTopicRefresh: "Matrix room topic refresh",
    operationTopicExecute: "Matrix room topic execute",
    telemetryStateRestored: "Matrix state restored",
    telemetryStateRestoredDetail: "Local Matrix selection and mode were restored from the browser.",
    telemetryComposerBlocked: "Matrix composer blocked",
    telemetryComposerBlockedDetail: (mode) => `Submit for ${mode} stays fail-closed until a write contract exists.`,
    telemetryScopeResolved: "Matrix scope resolved",
    telemetryScopeResolvedDetail: "Scope summary and provenance are ready.",
    telemetryProposalRejected: "Matrix proposal rejected",
    telemetryProposalRejectedDetail: "The local approval intent was discarded.",
  };
}

export function buildMatrixReviewItems(
  topicPlan: MatrixRoomTopicAgentPlan | null,
  topicExecution: MatrixRoomTopicExecutionResult | null,
  topicVerification: MatrixRoomTopicVerificationResult | null,
  actingIdentity: string | null,
  locale: Locale = "de",
): ReviewItem[] {
  const localText = getMatrixLocaleText(locale);

  if (!topicPlan) {
    return [];
  }

  const status = topicVerification?.status === "verified"
    ? "executed"
    : topicVerification?.status === "failed"
      ? "failed"
      : topicVerification?.status === "mismatch"
        ? "rejected"
      : topicExecution
        ? "approved"
        : topicPlan.status === "executed"
          ? "approved"
          : "pending_review";
  const receiptSummary = topicVerification
    ? localText.reviewReceiptVerification(topicVerification.status)
    : topicExecution
      ? localText.reviewReceiptExecutionPending
      : localText.reviewReceiptPending;

  return [
    {
      id: topicPlan.planId,
      source: "matrix",
      title: locale === "de" ? "Plan zur Raumtopic-Aktualisierung" : "Room topic update plan",
      summary: locale === "de"
        ? `Aktuell: ${text(topicPlan.currentValue)} · Vorgeschlagen: ${text(topicPlan.proposedValue)} · Risiko: ${topicPlan.risk} · ${receiptSummary}`
        : `Current: ${text(topicPlan.currentValue)} · Proposed: ${text(topicPlan.proposedValue)} · Risk: ${topicPlan.risk} · ${receiptSummary}`,
      status,
      stale: false,
      sourceLabel: localText.reviewSourceLabel,
      provenanceRows: mergeMetadataRows(
        buildGovernanceMetadataRows({
          actingIdentity: actingIdentity ?? BACKEND_TRUTH_UNAVAILABLE,
          activeScope: topicPlan.scopeId ?? BACKEND_TRUTH_UNAVAILABLE,
          authorityDomain: localText.governanceAuthorityDomain,
          targetScope: topicPlan.roomId,
          executionDomain: localText.governanceExecutionDomain,
          executionTarget: topicExecution ? localText.governanceExecutionTargetTransaction(topicExecution.transactionId) : topicPlan.roomId,
          provenanceSummary: localText.governanceSnapshotSummary(topicPlan.snapshotId ?? null),
          receiptSummary
        }),
        [{ label: localText.metadataRiskLabel, value: topicPlan.risk }]
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
  const { locale, copy: ui } = useLocalization();
  const localText = useMemo(() => getMatrixLocaleText(locale), [locale]);
  const workModeCopy = getWorkModeCopy(locale, props.workMode);
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
  const [mobileActionSheet, setMobileActionSheet] = useState<"scope" | "topic" | "verify" | null>(null);
  const [roomId, setRoomId] = useState<string | null>(persisted.roomId);
  const [roomName, setRoomName] = useState<string | null>(persisted.roomName);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(persisted.selectedEventId);
  const [selectedThreadRootId, setSelectedThreadRootId] = useState<string | null>(persisted.selectedThreadRootId);
  const [composerMode, setComposerMode] = useState<"post" | "reply" | "thread">(persisted.composerMode);
  const [composerTarget, setComposerTarget] = useState<MatrixComposerTarget>(persisted.composerTarget);
  const [draftContent, setDraftContent] = useState<string>(persisted.draftContent);
  const [lastActionResult, setLastActionResult] = useState<string | null>(persisted.lastActionResult);
  const sessionSyncHandleRef = useRef<number | null>(null);
  const latestSessionRef = useRef<MatrixSession | null>(null);
  const flushSessionSync = useCallback(() => {
    if (sessionSyncHandleRef.current !== null) {
      globalThis.clearTimeout(sessionSyncHandleRef.current);
      sessionSyncHandleRef.current = null;
    }

    if (latestSessionRef.current) {
      props.onSessionChange(latestSessionRef.current);
    }
  }, [props.onSessionChange]);
  const summaryLoading = scopeSummaryStatus === "loading";
  const selectedSpaces = useMemo(
    () => selectedSpaceIds.filter((value) => value.trim().length > 0),
    [selectedSpaceIds],
  );
  const selectedRoomIdSet = useMemo(() => new Set(selectedRoomIds), [selectedRoomIds]);
  const visibleJoinedRooms = useMemo(
    () => joinedRooms.slice(0, MATRIX_VISIBLE_LIST_LIMIT),
    [joinedRooms],
  );
  const visibleScopeSummaryItems = useMemo(
    () => scopeSummary?.items.slice(0, MATRIX_VISIBLE_LIST_LIMIT) ?? [],
    [scopeSummary],
  );
  const visibleHierarchyRooms = useMemo(
    () => spaceHierarchy?.rooms?.slice(0, MATRIX_VISIBLE_LIST_LIMIT) ?? [],
    [spaceHierarchy],
  );
  const matrixReviewItems = useMemo<ReviewItem[]>(
    () => buildMatrixReviewItems(topicPlan, topicExecution, topicVerification, whoami?.userId ?? null, locale),
    [locale, topicExecution, topicPlan, topicVerification, whoami?.userId]
  );
  const releaseScopeNotice = ui.matrix.scopeNotice;
  const activeComposerRoomId = roomId?.trim() || topicRoomId.trim() || selectedRoomIds[0]?.trim() || null;
  const threadOpenSourceId = selectedThreadRootId?.trim() || selectedEventId?.trim() || null;
  const activeThreadRootId = selectedThreadRootId?.trim() || null;
  const identityLabel = whoami
    ? whoami.userId
    : identityError
      ? ui.shell.statusError
      : ui.shell.healthChecking;
  const connectionLabel = status === "ready"
    ? ui.shell.statusReady
    : status === "partial"
      ? ui.shell.statusPartial
      : status === "error"
        ? ui.shell.statusError
        : ui.shell.healthChecking;
  const homeserverLabel = whoami?.homeserver ?? ui.common.na;
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
      backendRouteStatus: status === "error" ? ui.shell.statusError : ui.shell.statusReady,
      runtimeEventTrail: [
        currentScope ? ui.matrix.scopeSelected : ui.matrix.scopeUnresolved,
        scopeSummary ? ui.matrix.scopeSummaryReady : ui.matrix.scopeSummaryUnavailable,
        topicPlan ? localText.runtimeTopicPlanReady : localText.runtimeNoTopicPlan,
      ],
      sseLifecycle: ui.common.na,
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
      scopeLabel: currentScope ? ui.matrix.scopeSelected : ui.matrix.scopeUnresolved,
      summaryLabel: scopeSummary ? ui.matrix.scopeSummaryReady : ui.matrix.scopeSummaryUnavailable,
      approvalLabel: topicPlan
        ? topicPlan.status === "pending_review"
          ? ui.matrix.topicStatusApproval
          : topicVerification?.status === "verified"
            ? ui.matrix.topicStatusVerified
            : topicVerification?.status === "failed" || topicVerification?.status === "mismatch"
              ? ui.matrix.topicStatusMismatch
              : topicExecution
                ? ui.matrix.topicStatusOpen
                : ui.matrix.topicStatusBlocked
        : ui.common.none,
      safetyText: ui.matrix.scopeNotice,
      expertDetails: matrixExpertDetails,
      reviewItems: matrixReviewItems,
    }),
    [connectionLabel, currentScope, homeserverLabel, identityLabel, matrixExpertDetails, matrixReviewItems, scopeSummary, topicExecution, topicPlan, topicVerification, ui],
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

    latestSessionRef.current = nextSession;

    if (sessionSyncHandleRef.current !== null) {
      return;
    }

    sessionSyncHandleRef.current = globalThis.setTimeout(() => {
      sessionSyncHandleRef.current = null;
      if (latestSessionRef.current) {
        props.onSessionChange(latestSessionRef.current);
      }
    }, MATRIX_SESSION_SYNC_INTERVAL_MS);
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

  useEffect(() => () => {
    flushSessionSync();
  }, [flushSessionSync]);

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
          describeMatrixError(localText.operationWhoAmI, whoamiResult.reason),
        );
      if (roomsResult.status === "fulfilled") setJoinedRooms(roomsResult.value);
      else
        setRoomsError(
          describeMatrixError(localText.operationJoinedRooms, roomsResult.reason),
        );
      if (persisted) {
        props.onTelemetry(
          "info",
          localText.telemetryStateRestored,
          localText.telemetryStateRestoredDetail,
        );
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [localText.operationJoinedRooms, localText.operationWhoAmI, localText.telemetryStateRestored, localText.telemetryStateRestoredDetail, persisted, props.onTelemetry, props.restoredSession]);
  async function loadProvenance(roomId: string) {
    setProvenanceLoading(true);
    setProvenanceError(null);
    try {
      const response = await fetchProvenance(roomId);
      setProvenance(response);
      setProvenanceRoomId(roomId);
    } catch (error) {
      setProvenance(null);
      setProvenanceError(describeMatrixError(localText.operationProvenance, error));
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
      setSpaceHierarchyError(describeMatrixError(localText.operationHierarchy, error));
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
        return target.previewLabel ?? `${ui.matrix.newPost}: ${target.roomId}`;
      case "reply":
        return target.previewLabel ?? `${ui.matrix.reply}: ${target.postId}`;
      case "thread":
        return target.previewLabel ?? `${ui.matrix.replyInThread}: ${target.threadRootId}`;
      default:
        return target.previewLabel ?? ui.matrix.newPost;
    }
  }

  function describeComposerMode(mode: MatrixComposerMode) {
    switch (mode) {
      case "reply":
        return ui.matrix.composerModeReply;
      case "thread":
        return ui.matrix.composerModeThreadReply;
      default:
        return ui.matrix.composerModePost;
    }
  }

  function startNewPost(nextRoomId?: string) {
    const room = (nextRoomId ?? getComposerRoomId()).trim();
    if (!room) {
      setLastActionResult(ui.matrix.submitBlocked);
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
      previewLabel: `${ui.matrix.newPost}: ${room}`,
    });
    setLastActionResult(`${ui.matrix.composerTargetSet}: ${room}`);
  }

  function startReplyToPost(postId: string, nextRoomId?: string) {
    const room = (nextRoomId ?? getComposerRoomId()).trim();
    if (!room || !postId.trim()) {
      setLastActionResult(ui.matrix.submitBlocked);
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
      previewLabel: `${ui.matrix.reply}: ${postId}`,
    });
    setLastActionResult(`${ui.matrix.composerTargetSet}: ${postId}`);
  }

  function startThreadFromPost(postId: string, nextRoomId?: string) {
    const room = (nextRoomId ?? getComposerRoomId()).trim();
    if (!room || !postId.trim()) {
      setLastActionResult(ui.matrix.submitBlocked);
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
      previewLabel: `${ui.matrix.thread}: ${postId}`,
    });
    setLastActionResult(`${ui.matrix.composerTargetSet}: ${postId}`);
  }

  function startReplyInThread(threadRootId: string, eventId?: string, nextRoomId?: string) {
    const room = (nextRoomId ?? getComposerRoomId()).trim();
    if (!room || !threadRootId.trim()) {
      setLastActionResult(ui.matrix.submitBlocked);
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
        ? `${ui.matrix.replyInThread}: ${threadRootId} (${eventId})`
        : `${ui.matrix.replyInThread}: ${threadRootId}`,
    });
    setLastActionResult(`${ui.matrix.composerTargetSet}: ${threadRootId}`);
  }

  function openThreadContext(nextRoomId?: string) {
    const room = (nextRoomId ?? getComposerRoomId()).trim();
    const threadRootId = selectedThreadRootId?.trim() || selectedEventId?.trim() || "";

    if (!room || !threadRootId) {
      setLastActionResult(ui.matrix.threadOpenHint);
      return;
    }

    setRoomId(room);
    setComposerMode("thread");
    setComposerTarget({
      kind: "thread",
      roomId: room,
      postId: null,
      threadRootId,
      previewLabel: `${ui.matrix.threadOpen}: ${threadRootId}`,
    });
    setSelectedThreadRootId(threadRootId);
    setLastActionResult(`${ui.matrix.threadOpen}: ${threadRootId}`);
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
        previewLabel: `${ui.matrix.newPost}: ${room}`,
      });
      setLastActionResult(`${ui.matrix.threadLeave}: ${room}`);
      return;
    }

    setComposerTarget({
      kind: "none",
      roomId: null,
      previewLabel: null,
    });
    setLastActionResult(ui.matrix.threadLeave);
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
    setLastActionResult(ui.matrix.clearTarget);
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
      setLastActionResult(ui.matrix.submitBlocked);
      return false;
    }

    if (!payload.roomId) {
      setLastActionResult(ui.matrix.submitBlocked);
      return false;
    }

    if (!payload.draftContent) {
      setLastActionResult(ui.matrix.submitBlocked);
      return false;
    }

    setLastActionResult(
      `${ui.matrix.submitFailClosed} Payload: ${JSON.stringify(payload)}`,
    );
    props.onTelemetry(
      "warning",
      localText.telemetryComposerBlocked,
      localText.telemetryComposerBlockedDetail(payload.composerMode),
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
      setScopeSummaryError(describeMatrixError(localText.operationScopeSummary, error));
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
      setScopeError(describeMatrixError(localText.operationScopeResolve, error));
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
        localText.telemetryScopeResolved,
        localText.telemetryScopeResolvedDetail,
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
        describeMatrixError(localText.operationTopicVerify, error),
      );
    } finally {
      setTopicVerifyLoading(false);
    }
  }

  async function prepareTopicUpdate() {
    const roomId = topicRoomId.trim();
    const topic = topicText.trim();

    if (!roomId) {
      setTopicPrepareError(ui.matrix.roomPickerChoose);
      return;
    }

    if (!topic) {
      setTopicPrepareError(ui.matrix.draftPlaceholder);
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
        describeMatrixError(localText.operationTopicAnalyze, error),
      );
    } finally {
      setTopicPrepareLoading(false);
    }
  }

  async function refreshTopicUpdatePlan() {
    if (!topicPlan) {
      setTopicPlanRefreshError(
        ui.matrix.topicStatusLoading,
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
        describeMatrixError(localText.operationTopicRefresh, error),
      );
    } finally {
      setTopicPlanRefreshLoading(false);
    }
  }

  async function executeTopicUpdate(approvalIntent = topicApprovalPending) {
    if (!topicPlan) {
      setTopicExecuteError(ui.matrix.topicStatusPending);
      return;
    }

    if (topicPlan.status !== "pending_review") {
      setTopicExecuteError(ui.matrix.topicStatusLoading);
      return;
    }

    if (topicPlanRefreshLoading) {
      setTopicExecuteError(
        ui.matrix.topicStatusLoading,
      );
      return;
    }

    if (!approvalIntent) {
      setTopicExecuteError(
        ui.matrix.topicStatusApproval,
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
        describeMatrixError(localText.operationTopicExecute, error),
      );
    } finally {
      setTopicExecuteLoading(false);
    }
  }
  const showMatrixConnectionEmptyState = status === "error" && Boolean(identityError || roomsError);
  return (
    <section
      className="workspace-panel matrix-workspace"
      data-testid="matrix-workspace"
      aria-busy={status !== "ready" || scopeResolveLoading || spaceHierarchyLoading || provenanceLoading || topicPrepareLoading || topicExecuteLoading || topicVerifyLoading}
    >
      <section className="matrix-mobile-panel mobile-panel-scroll" aria-label={locale === "de" ? "Matrix mobile Arbeitsfläche" : "Matrix mobile workspace"}>
        <header className="matrix-mobile-summary matrix-mobile-summary-elevated">
          <span className="mobile-mono">MATRIX KNOWLEDGE</span>
          <strong>{connectionLabel}</strong>
          <p>{identityLabel} · {homeserverLabel}</p>
        </header>

        <div className="matrix-mobile-status-grid">
          <div>
            <span>{ui.matrix.scopeTitle}</span>
            <strong>{currentScope ? ui.matrix.scopeSelected : ui.matrix.scopeUnresolved}</strong>
          </div>
          <div>
            <span>{ui.matrix.scopeSummaryTitle}</span>
            <strong>{scopeSummary ? ui.matrix.scopeSummaryReady : ui.matrix.scopeSummaryUnavailable}</strong>
          </div>
          <div>
            <span>{ui.matrix.topicTitle}</span>
            <strong>{topicPlan ? localText.runtimeTopicPlanReady : localText.runtimeNoTopicPlan}</strong>
          </div>
          <div>
            <span>{ui.matrix.submit}</span>
            <strong>{ui.matrix.submitFailClosed}</strong>
          </div>
        </div>

        <div className="matrix-mobile-action-row" aria-label={locale === "de" ? "Matrix Aktionen" : "Matrix actions"}>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setMobileActionSheet("scope")}
          >
            {locale === "de" ? "Scope öffnen" : "Open scope"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setMobileActionSheet("topic")}
          >
            {locale === "de" ? "Topic planen" : "Plan topic"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setMobileActionSheet("verify")}
          >
            {locale === "de" ? "Prüfen" : "Verify"}
          </button>
        </div>

        <section className="matrix-mobile-list">
          <span className="mobile-mono">{ui.matrix.joinedRoomsTitle}</span>
          {visibleJoinedRooms.slice(0, 5).length > 0 ? visibleJoinedRooms.slice(0, 5).map((room) => (
            <button
              type="button"
              key={room.roomId}
              className="matrix-mobile-row"
              onClick={() => {
                setSelectedRoomIds((current) => current.includes(room.roomId) ? current : [...current, room.roomId]);
                setRoomId((current) => (current ?? "").trim().length > 0 ? current : room.roomId);
              }}
            >
              <strong>{room.name ?? room.canonicalAlias ?? ui.matrix.roomPickerRoom}</strong>
              <span>{props.expertMode ? room.roomId : ui.github.readOnlyActive}</span>
            </button>
          )) : (
            <p>{status === "loading" ? ui.matrix.scopeSummaryLoading : ui.matrix.roomPickerEmpty}</p>
          )}
        </section>

        <section className="matrix-mobile-list">
          <span className="mobile-mono">{ui.matrix.scopeSummaryTitle}</span>
          {visibleScopeSummaryItems.slice(0, 5).length > 0 ? visibleScopeSummaryItems.slice(0, 5).map((item) => (
            <button
              type="button"
              key={item.roomId}
              className="matrix-mobile-row"
              onClick={() => void loadProvenance(item.roomId)}
            >
              <strong>{props.expertMode ? text(item.canonicalAlias) : ui.matrix.scopeSummaryReady}</strong>
              <span>{props.expertMode ? `${item.members} · ${item.lastEventSummary}` : ui.github.readOnlyActive}</span>
            </button>
          )) : (
            <p>{scopeSummaryStatus === "loading" ? ui.matrix.scopeSummaryLoading : ui.matrix.scopeSummaryUnavailable}</p>
          )}
        </section>

        {mobileActionSheet ? (
          <>
            <button
              type="button"
              className="mobile-bottom-sheet-backdrop"
              aria-label={locale === "de" ? "Overlay schließen" : "Close overlay"}
              onClick={() => setMobileActionSheet(null)}
            />
            <section
              className="mobile-bottom-sheet matrix-mobile-sheet"
              aria-label={
                mobileActionSheet === "scope"
                  ? (locale === "de" ? "Scope Overlay" : "Scope overlay")
                  : mobileActionSheet === "topic"
                    ? (locale === "de" ? "Topic Overlay" : "Topic overlay")
                    : (locale === "de" ? "Verify Overlay" : "Verify overlay")
              }
            >
              <span className="mobile-bottom-sheet-handle" aria-hidden="true" />
              <div className="matrix-mobile-sheet-body">
                {mobileActionSheet === "scope" ? (
                  <>
                    <strong>{locale === "de" ? "Scope mit Backend auflösen" : "Resolve scope via backend"}</strong>
                    <p>{locale === "de" ? "Wähle einen Raum, setze ihn in den Scope und löse dann die Zusammenfassung auf." : "Select a room, add it to scope, then resolve the summary."}</p>
                    <label className="mobile-mono" htmlFor="matrix-room-id-mobile">
                      {ui.matrix.roomId}
                    </label>
                    <input
                      id="matrix-room-id-mobile"
                      value={roomId ?? ""}
                      onChange={(event) => setRoomId(event.target.value.trim().length > 0 ? event.target.value : null)}
                      placeholder={ui.matrix.roomPickerRoom}
                    />
                    <div className="mobile-sheet-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          const nextRoomId = (roomId ?? "").trim();
                          if (!nextRoomId) {
                            return;
                          }
                          setSelectedRoomIds((current) => current.includes(nextRoomId) ? current : [...current, nextRoomId]);
                        }}
                      >
                        {locale === "de" ? "In Scope übernehmen" : "Add to scope"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void handleResolveScope();
                          setMobileActionSheet(null);
                        }}
                        disabled={scopeResolveLoading || (selectedRoomIds.length === 0 && selectedSpaces.length === 0)}
                      >
                        {scopeResolveLoading ? ui.matrix.resolvingScope : ui.matrix.resolveScope}
                      </button>
                    </div>
                  </>
                ) : null}

                {mobileActionSheet === "topic" ? (
                  <>
                    <strong>{locale === "de" ? "Topic-Plan vorbereiten" : "Prepare topic plan"}</strong>
                    <p>{locale === "de" ? "Raum-ID und Zieltext eingeben, dann Analyse starten." : "Enter room id and target text, then run analysis."}</p>
                    <label className="mobile-mono" htmlFor="matrix-topic-room-mobile">
                      {ui.matrix.roomId}
                    </label>
                    <input
                      id="matrix-topic-room-mobile"
                      value={topicRoomId}
                      onChange={(event) => setTopicRoomId(event.target.value)}
                      placeholder={ui.matrix.roomPickerRoom}
                    />
                    <label className="mobile-mono" htmlFor="matrix-topic-text-mobile">
                      {ui.matrix.topicTitle}
                    </label>
                    <textarea
                      id="matrix-topic-text-mobile"
                      className="matrix-mobile-topic-textarea"
                      value={topicText}
                      onChange={(event) => setTopicText(event.target.value)}
                      placeholder={ui.matrix.draftPlaceholder}
                    />
                    <div className="mobile-sheet-actions">
                      <button
                        type="button"
                        onClick={() => {
                          void prepareTopicUpdate();
                          setMobileActionSheet(null);
                        }}
                        disabled={topicPrepareLoading}
                      >
                        {topicPrepareLoading ? ui.matrix.topicStatusLoading : ui.matrix.topicStatusPending}
                      </button>
                    </div>
                  </>
                ) : null}

                {mobileActionSheet === "verify" ? (
                  <>
                    <strong>{locale === "de" ? "Ausführung und Prüfung" : "Execution and verification"}</strong>
                    <p>
                      {topicPlan
                        ? `${locale === "de" ? "Plan" : "Plan"} ${topicPlan.planId} · ${topicPlan.status}`
                        : (locale === "de" ? "Kein Topic-Plan vorhanden." : "No topic plan available.")}
                    </p>
                    <div className="mobile-sheet-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          void refreshTopicUpdatePlan();
                        }}
                        disabled={!topicPlan || topicPlanRefreshLoading}
                      >
                        {topicPlanRefreshLoading ? ui.matrix.topicStatusLoading : ui.matrix.topicStatusPending}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void executeTopicUpdate(true);
                          setMobileActionSheet(null);
                        }}
                        disabled={!topicPlan || topicPlan.status !== "pending_review" || topicExecuteLoading}
                      >
                        {topicExecuteLoading ? ui.approval.running : ui.approval.approve}
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          if (!topicPlan) {
                            return;
                          }
                          void verifyTopicUpdate(topicPlan.planId);
                          setMobileActionSheet(null);
                        }}
                        disabled={!topicPlan || topicVerifyLoading}
                      >
                        {topicVerifyLoading ? ui.matrix.topicStatusLoading : ui.github.verifyResult}
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </section>
          </>
        ) : null}
      </section>

      {" "}
      <section className="hero matrix-hero">
        {" "}
        <div>
          {" "}
          <p className={`status-pill status-${status}`} data-testid="matrix-status">
            {status === "ready"
              ? ui.matrix.topicStatusReady
              : status === "partial"
                ? ui.shell.statusPartial
                : status === "error"
                  ? ui.shell.statusError
                  : ui.matrix.topicStatusLoading}
          </p>{" "}
          <h1>{ui.matrix.title}</h1>{" "}
          {props.expertMode ? (
            <p className="hero-copy">
              {ui.matrix.intro}
            </p>
          ) : (
            <p className="hero-copy">{workModeCopy.controlHint}</p>
          )}{" "}
          <div className="workspace-hero-actions">
            <GuideOverlay content={getWorkspaceGuide(locale, "matrix")} testId="guide-matrix" />
          </div>{" "}
          {props.expertMode ? (
            <div className="chip-row" aria-label={ui.matrix.scopeNotice}>
              <span className="workflow-chip workflow-chip-complete">{ui.matrix.scopeTitle}</span>
              <span className="workflow-chip workflow-chip-complete">{ui.matrix.scopeSummaryTitle}</span>
              <span className="workflow-chip workflow-chip-complete">{ui.matrix.scopePreview}</span>
              <span className={`workflow-chip ${topicPlan ? "workflow-chip-active" : "workflow-chip-idle"}`}>
                {ui.matrix.topicTitle}
              </span>
              <span className={`workflow-chip ${topicPlan && !topicApprovalPending ? "workflow-chip-active" : "workflow-chip-idle"}`}>
                {ui.matrix.topicStatusApproval}
              </span>
              <span className={`workflow-chip ${topicExecution ? "workflow-chip-complete" : "workflow-chip-idle"}`}>
                {ui.approval.executionSection}
              </span>
              <span className={`workflow-chip ${topicVerification ? "workflow-chip-complete" : "workflow-chip-idle"}`}>
                {ui.github.verifyResult}
              </span>
            </div>
          ) : null}
        </div>{" "}
        <aside className="workspace-summary-card">
          {" "}
          <strong>
            {currentScope
              ? props.expertMode
                ? `${currentScope.type} scope`
                : ui.matrix.scopeSelected
              : ui.matrix.scopeUnresolved}
          </strong>{" "}
          <div className="summary-stack">
            {props.expertMode ? (
              <>
                <span>User: {whoami?.userId ?? ui.common.na}</span>
                <span>Homeserver: {whoami?.homeserver ?? ui.common.na}</span>
                <span>Origin: {MATRIX_API_BASE_URL}</span>
                <span>{ui.matrix.topicTitle}</span>
                <span>Scope: {currentScope?.scopeId ?? ui.common.none}</span>
                <span>Rooms: {scopeSummary?.items.length ?? 0}</span>
                <span>{ui.matrix.topicTitle}: {topicPlan ? (topicPlan.status === "executed" ? ui.shell.statusReady : ui.matrix.topicStatusPending) : ui.common.none}</span>
              </>
            ) : (
              <>
                <span>{ui.matrix.scopeSelectedLabel}: {currentScope ? ui.shell.statusReady : ui.shell.healthChecking}</span>
                <span>{ui.matrix.scopeSummaryTitle}: {scopeSummary ? ui.shell.statusReady : ui.matrix.scopeSummaryUnavailable}</span>
                <span>{ui.matrix.topicStatusApproval}: {topicPlan ? ui.review.approvalNeeded : ui.common.none}</span>
                <span>{ui.github.readOnlyActive}</span>
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
              ? `${ui.matrix.title} bootstrap ${status}. Origin: ${MATRIX_API_BASE_URL}.`
              : `${ui.matrix.title} bootstrap ${status}.`}
            {identityError || roomsError
              ? ` ${identityError ? ui.shell.statusError : ""}${identityError && roomsError ? " " : ""}${roomsError ? ui.matrix.roomPickerEmpty : ""}`
              : ""}
          </p>
        </section>
      ) : null}{" "}
      {showMatrixConnectionEmptyState ? (
        <section className="empty-state-card">
          <EmptyStateCTA
            icon="⊛"
            iconColor="var(--ms-teal)"
            title={locale === "de" ? "Matrix noch nicht verbunden" : "Matrix not connected yet"}
            description={locale === "de"
              ? "Matrix ist dein persistenter Wissensfluss. Verbinde Matrix, um Outputs direkt als Posts zu sichern."
              : "Matrix is your persistent knowledge flow. Connect Matrix to store outputs directly as posts."}
            primaryLabel={locale === "de" ? "⊛ Matrix verbinden" : "⊛ Connect Matrix"}
            primaryVariant="matrix"
            primaryAction={() => {
              if (typeof window !== "undefined") {
                window.location.assign("/console?mode=settings");
              }
            }}
            secondaryLabel={locale === "de" ? "Später einrichten →" : "Set up later →"}
            secondaryVariant="text-link"
            secondaryAction={() => undefined}
          />
        </section>
      ) : null}
      <section className="matrix-grid">
        {" "}
        <details
          className="workspace-card matrix-topic-card matrix-secondary-panel"
          data-testid="matrix-topic-update-panel"
        >
          {" "}
          <summary className="matrix-dropdown-summary">
            <div>
              <span>{ui.matrix.topicTitle}</span>
              <strong>{ui.matrix.scopeNotice}</strong>
            </div>
            <span className="matrix-dropdown-chevron" aria-hidden="true">v</span>
          </summary>{" "}
          <div className="matrix-dropdown-body">
          <div className="info-block">
            <p className="info-label">{props.expertMode ? ui.matrix.roomId : ui.matrix.roomPickerRoom}</p>
            <div className="input-row">
              <input
                type="text"
                value={topicRoomId}
                onChange={(event) => setTopicRoomId(event.target.value)}
                placeholder={props.expertMode ? "!room:matrix.org" : ui.matrix.roomPickerChoose}
                aria-label={props.expertMode ? ui.matrix.roomId : ui.matrix.roomPickerChoose}
                data-testid="matrix-topic-room-id"
              />
              <button
                type="button"
                className="secondary-button"
                onClick={() => setTopicRoomId(selectedRoomIds[0] ?? "")}
                disabled={!selectedRoomIds[0]}
              >
                {props.expertMode ? ui.matrix.roomPickerRoom : ui.matrix.roomPickerChoose}
              </button>
            </div>
          </div>{" "}
          <div className="info-block">
            <p className="info-label">{ui.matrix.topicTitle}</p>
            <textarea
              className="matrix-textarea"
              rows={3}
              value={topicText}
              onChange={(event) => setTopicText(event.target.value)}
              placeholder={ui.matrix.draftPlaceholder}
              aria-label={ui.matrix.topicTitle}
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
              {topicPrepareLoading ? ui.matrix.topicStatusLoading : ui.matrix.topicTitle}
            </button>
            <span className="muted-copy">
              {props.expertMode ? ui.matrix.scopeSummaryInfo : ui.review.approvalNeeded}
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
              title={ui.matrix.topicTitle}
              summary={topicPlan.proposedValue}
              consequence={ui.matrix.submitFailClosed}
              statusLabel={
                topicPlan.status === "pending_review"
                  ? ui.matrix.topicStatusApproval
                  : topicVerification?.status === "verified"
                    ? ui.matrix.topicStatusVerified
                    : topicExecution
                      ? ui.matrix.topicStatusOpen
                      : ui.matrix.topicStatusReady
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
                  authorityDomain: localText.governanceAuthorityDomain,
                  targetScope: topicPlan.roomId,
                  executionDomain: localText.governanceExecutionDomain,
                  executionTarget: topicPlan.roomId,
                  provenanceSummary: localText.governanceSnapshotSummary(topicPlan.snapshotId ?? null),
                  receiptSummary: topicVerification?.status ?? localText.reviewReceiptPending,
                }),
                [
                  { label: localText.metadataRiskLabel, value: topicPlan.risk },
                  { label: localText.metadataExpiresLabel, value: formatDate(topicPlan.expiresAt) },
                ]
              )}
            >
              <div className="detail-grid">
                {props.expertMode ? (
                  <>
                    <div>
                      <span>{ui.shell.statusReady}</span>
                      <strong>{topicPlan.status}</strong>
                    </div>
                    <div>
                      <span>{ui.matrix.topicStatusApproval}</span>
                      <strong>{String(topicPlan.requiresApproval)}</strong>
                    </div>
                    <div>
                      <span>{ui.review.rowOpen}</span>
                      <strong>{topicPlan.actions.length}</strong>
                    </div>
                  </>
                ) : null}
              </div>
              <div className="delta-grid">
                <div>
                  <p className="info-label">{ui.matrix.topicStatusLoaded}</p>
                  <pre>{text(topicPlan.currentValue)}</pre>
                </div>
                <div>
                  <p className="info-label">{ui.matrix.topicTitle}</p>
                  <pre>{text(topicPlan.proposedValue)}</pre>
                </div>
              </div>
              <div className="list-block">
                <p className="info-label">{ui.review.rowOpen}</p>
                <div className="chip-list">
                  {topicPlan.actions.map((action, index) => (
                    <span key={`${action.type}:${index}`} className="reference-chip">
                      {props.expertMode ? `${action.type} · ${action.roomId}` : `${ui.review.rowOpen} ${index + 1}`}
                    </span>
                  ))}
                </div>
              </div>

                  {topicPlan.status === "pending_review" ? (
                <>
                  {topicExecuteLoading || topicVerifyLoading ? (
                    <ApprovalTransitionCard
                      testId="matrix-topic-transition"
                      title={ui.matrix.topicStatusApproval}
                      detail={ui.approval.runningDetail}
                    />
                  ) : null}
                  <DecisionZone
                    testId="matrix-topic-decision"
                    approveLabel={topicExecuteLoading ? ui.approval.running : ui.github.approveLabel}
                    rejectLabel={ui.github.rejectLabel}
                    onApprove={() => {
                      setTopicApprovalPending(true);
                      void executeTopicUpdate(true);
                    }}
                    onReject={() => {
                      setTopicApprovalPending(false);
                      setLastActionResult(ui.github.rejectLabel);
                      props.onTelemetry("warning", localText.telemetryProposalRejected, localText.telemetryProposalRejectedDetail);
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
                    helperText={ui.github.approveHelper}
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
                  {topicPlanRefreshLoading ? ui.matrix.topicStatusLoading : ui.matrix.topicStatusPending}
                </button>
                <span className="muted-copy">
                  {ui.matrix.scopeSummaryInfo}
                </span>
              </div>

              {topicExecution ? (
                <ExecutionReceiptCard
                  title={ui.approval.receiptSection}
                  detail={ui.matrix.scopeNotice}
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
                      authorityDomain: localText.governanceAuthorityDomain,
                      targetScope: topicPlan.roomId,
                      executionDomain: localText.governanceExecutionDomain,
                      executionTarget: localText.governanceExecutionTargetTransaction(topicExecution.transactionId),
                      provenanceSummary: localText.governanceSnapshotSummary(topicPlan.snapshotId ?? null),
                      receiptSummary: topicVerification?.status ?? topicExecution.status,
                    }),
                    [
                      { label: localText.metadataTransactionIdLabel, value: topicExecution.transactionId },
                      { label: ui.approval.executionSection, value: formatDate(topicExecution.executedAt) },
                      { label: ui.shell.statusReady, value: topicExecution.status },
                    ]
                  )}
                  testId="matrix-topic-execution"
                >
                  {topicVerifyLoading ? (
                    <p className="muted-copy">{ui.github.verifyBusy}</p>
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
                      <span>{ui.shell.statusReady}</span>
                      <strong>{topicVerification.status}</strong>
                    </div>
                    <div>
                      <span>{ui.matrix.topicStatusLoaded}</span>
                      <strong>{text(topicVerification.expected)}</strong>
                    </div>
                    <div>
                      <span>{ui.matrix.topicTitle}</span>
                      <strong>{text(topicVerification.actual)}</strong>
                    </div>
                    <div>
                      <span>{ui.github.verifyResult}</span>
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
                ? ui.matrix.scopeSummaryInfo
                : ui.matrix.roomPickerChoose}
            </p>
          )}{" "}
          </div>
        </details>{" "}
        <details className="workspace-card matrix-scope-card matrix-secondary-panel">
          {" "}
          <summary className="matrix-dropdown-summary">
            <div>
              <span>{ui.matrix.scopeTitle}</span>
              <strong>{ui.matrix.scopeNotice}</strong>
            </div>
            <span className="matrix-dropdown-chevron" aria-hidden="true">v</span>
          </summary>{" "}
          <div className="matrix-dropdown-body">
          <div className="explore-stack">
            {" "}
            <div className="info-block">
              <p className="info-label">{ui.settings.matrixIdentity}</p>
              <p className="info-value">
                {props.expertMode
                  ? whoami?.userId ?? ui.shell.healthChecking
                  : whoami
                    ? ui.shell.statusReady
                    : ui.shell.healthChecking}
              </p>
              {props.expertMode ? (
                <p className="info-note">
                  {ui.settings.matrixHomeserver}: {text(whoami?.deviceId)} · {ui.settings.matrixHomeserver}:{" "}
                  {text(whoami?.homeserver)}
                </p>
              ) : (
                <p className="info-note">{ui.matrix.scopeSummaryInfo}</p>
              )}
            </div>{" "}
            {identityError ? (
              <p className="error-banner" data-testid="matrix-identity-error">{identityError}</p>
            ) : null}{" "}
            <div className="info-block">
              {" "}
              <p className="info-label">{ui.matrix.joinedRoomsTitle}</p>{" "}
              <div className="room-picker" data-testid="matrix-rooms">
                {" "}
                {joinedRooms.length === 0 ? (
                  <p className="empty-state">{ui.matrix.roomPickerEmpty}</p>
                ) : (
                  visibleJoinedRooms.map((room) => {
                    const active = selectedRoomIdSet.has(room.roomId);
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
                            : room.name ?? ui.matrix.roomPickerRoom}
                        </span>{" "}
                        <span className="room-picker-meta">
                          {props.expertMode
                            ? `${room.roomType ?? localText.roomTypeFallback} · ${room.roomId}`
                            : ui.matrix.roomPickerChoose}
                        </span>{" "}
                      </button>
                    );
                  })
                )}{" "}
                {joinedRooms.length > visibleJoinedRooms.length ? (
                  <p className="muted-copy">+{joinedRooms.length - visibleJoinedRooms.length}</p>
                ) : null}{" "}
              </div>{" "}
              {roomsError ? (
                <p className="error-banner" data-testid="matrix-rooms-error">{roomsError}</p>
              ) : null}{" "}
            </div>{" "}
            <div className="info-block">
              {" "}
              <p className="info-label">{ui.matrix.selectedScopeTitle}</p>{" "}
              <div className="input-row">
                {" "}
                <input
                  type="text"
                  value={spaceInput}
                  onChange={(event) => setSpaceInput(event.target.value)}
                  placeholder={props.expertMode ? ui.matrix.scopeAddSpace : ui.matrix.roomPickerChoose}
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
                  {ui.matrix.scopeAddSpace}
                </button>{" "}
              </div>{" "}
              <div className="chip-list">
                {" "}
                {selectedRoomIds.length === 0 && selectedSpaces.length === 0 ? (
                  <span className="empty-state">
                    {ui.matrix.scopeUnresolved}
                  </span>
                ) : null}{" "}
                {selectedRoomIds.map((roomId, index) => (
                  <span key={roomId} className="scope-chip">
                    <span>{props.expertMode ? `${ui.matrix.roomId}: ${roomId}` : `${ui.matrix.roomPickerRoom} ${index + 1}`}</span>
                    <button
                      type="button"
                      className="chip-action"
                      onClick={() =>
                        setSelectedRoomIds((current) =>
                          current.filter((value) => value !== roomId),
                        )
                      }
                    >
                      {ui.matrix.scopeRemove}
                    </button>
                  </span>
                ))}{" "}
                {selectedSpaces.map((spaceId, index) => (
                  <span key={spaceId} className="scope-chip">
                    <span>{props.expertMode ? `${ui.matrix.roomPickerSpace}: ${spaceId}` : `${ui.matrix.roomPickerSpace} ${index + 1}`}</span>
                    {props.expertMode ? (
                      <button
                        type="button"
                        className="chip-action"
                        onClick={() => void loadHierarchy(spaceId)}
                      >
                        {ui.matrix.topicStatusBrowserPreview}
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
                      {ui.matrix.scopeRemove}
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
                    ? ui.matrix.resolvingScope
                    : ui.matrix.resolveScope}
                </button>
                <span className="muted-copy">
                  {ui.matrix.scopeSummaryInfo}
                </span>
              </div>{" "}
              {scopeError ? (
                <p className="error-banner">{scopeError}</p>
              ) : null}{" "}
            </div>{" "}
            <div className="info-block">
              {" "}
              <p className="info-label">{ui.matrix.scopeSummaryTitle}</p>{" "}
              {scopeSummary ? (
                <div className="scope-summary">
                  <div className="scope-summary-meta">
                    {props.expertMode ? <span>Snapshot: {scopeSummary.snapshotId}</span> : null}
                    <span>
                      {ui.common.ready}: {formatDate(scopeSummary.generatedAt)}
                    </span>
                  </div>
                  <div className="scope-summary-list">
                    {visibleScopeSummaryItems.map((item) => (
                      <article
                        key={item.roomId}
                        className={`scope-summary-item ${item.roomId === provenanceRoomId ? "scope-summary-item-active" : ""}`}
                      >
                        <div>
                          <strong>{text(item.name)}</strong>
                          <span>{props.expertMode ? text(item.canonicalAlias) : ui.matrix.scopeSummaryReady}</span>
                        </div>
                        <small>
                          {props.expertMode ? `${item.members} · ${item.lastEventSummary}` : ui.matrix.scopeSummaryReady}
                        </small>
                        <div className="scope-summary-actions">
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => void loadProvenance(item.roomId)}
                          >
                            {props.expertMode ? ui.matrix.scopePreview : ui.matrix.scopePreview}
                          </button>
                        </div>
                      </article>
                    ))}
                    {scopeSummary.items.length > visibleScopeSummaryItems.length ? (
                      <p className="muted-copy">+{scopeSummary.items.length - visibleScopeSummaryItems.length}</p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="empty-state">
                  {scopeSummaryStatus === "loading"
                    ? ui.matrix.scopeSummaryLoading
                    : currentScope
                      ? ui.matrix.scopeSummaryUnavailable
                      : ui.matrix.resolveScope}
                </p>
              )}{" "}
              {scopeSummaryError ? (
                <p className="error-banner">{scopeSummaryError}</p>
              ) : null}{" "}
            </div>{" "}
            {props.expertMode ? (
              <div className="info-block">
                {" "}
                <p className="info-label">{ui.matrix.hierarchyTitle}</p>{" "}
                <p className="muted-copy">
                  {ui.matrix.hierarchyAdvisory}
                </p>{" "}
                {spaceHierarchySpace ? (
                  <div className="scope-summary">
                    {" "}
                    <div className="scope-summary-meta">
                      <span>{ui.matrix.hierarchySpaceId}: {spaceHierarchySpace}</span>
                    </div>{" "}
                    {spaceHierarchyLoading ? (
                      <p className="muted-copy">{ui.matrix.scopeSummaryLoading}</p>
                    ) : null}{" "}
                    {spaceHierarchyError ? (
                      <p className="error-banner">{spaceHierarchyError}</p>
                    ) : null}{" "}
                    {spaceHierarchy?.rooms?.length ? (
                      <div className="scope-summary-list">
                        {visibleHierarchyRooms.map((room, index) => (
                          <article
                            key={room.room_id ?? room.name ?? String(index)}
                            className="scope-summary-item"
                          >
                            <div>
                              <strong>{text(room.name ?? null)}</strong>
                              <span>{text(room.canonical_alias ?? null)}</span>
                            </div>
                            <small>
                              {`${text(room.room_type ?? null)} · ${room.room_id ?? localText.unknownRoomFallback}`}
                            </small>
                          </article>
                        ))}
                        {spaceHierarchy.rooms.length > visibleHierarchyRooms.length ? (
                          <p className="muted-copy">+{spaceHierarchy.rooms.length - visibleHierarchyRooms.length}</p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="empty-state">
                        {ui.matrix.hierarchyRoomsEmpty}
                      </p>
                    )}{" "}
                  </div>
                ) : (
                  <p className="empty-state">
                    {ui.matrix.hierarchyEmpty}
                  </p>
                )}{" "}
              </div>
            ) : null}{" "}
          </div>{" "}
          </div>
        </details>{" "}
        <section className="workspace-card matrix-composer-panel matrix-composer-focus-card" data-testid="matrix-composer-panel">
          <header className="card-header">
            <div>
              <span>{ui.matrix.composerTitle}</span>
              <strong>{ui.matrix.composerModeLabel}</strong>
            </div>
          </header>

          <div className="matrix-thread-context-card" data-testid="matrix-thread-context">
            <div className="matrix-thread-context-copy">
              <p className="info-label">{ui.matrix.threadContextTitle}</p>
              <strong>
                {activeThreadRootId
                  ? (props.expertMode ? `${ui.matrix.thread}: ${activeThreadRootId}` : ui.matrix.thread)
                  : ui.matrix.threadNone}
              </strong>
              <p className="muted-copy">
                {activeThreadRootId
                  ? ui.matrix.threadLeaveHint
                  : ui.matrix.threadOpenHint}
              </p>
            </div>
            {props.expertMode ? (
              <div className="matrix-thread-context-meta">
                <span className="reference-chip">{ui.matrix.roomId}: {activeComposerRoomId ?? ui.common.na}</span>
                <span className="reference-chip">{ui.matrix.postId}: {selectedEventId?.trim() || ui.common.na}</span>
                <span className="reference-chip">{ui.matrix.threadRootId}: {activeThreadRootId ?? ui.common.na}</span>
              </div>
            ) : null}
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
                {ui.matrix.threadOpen}
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={leaveThreadContext}
                disabled={!selectedThreadRootId}
                data-testid="matrix-thread-leave"
              >
                {ui.matrix.threadLeave}
              </button>
            </div>
          </div>

          <div className="matrix-composer-banner">
            <div>
              <p className="info-label">{ui.matrix.composerTargetLabel}</p>
              <strong>{describeComposerMode(composerMode)}</strong>
              <p className="muted-copy">
                {props.expertMode
                  ? describeComposerTarget(composerTarget)
                  : (composerTarget.kind === "none" ? ui.matrix.composerTargetMissing : ui.matrix.composerTargetSet)}
              </p>
            </div>
            <div className="matrix-composer-banner-meta">
              <span className={`status-pill status-${composerTarget.kind === "none" ? "partial" : "ready"}`}>
                {composerTarget.kind === "none" ? ui.matrix.composerTargetMissing : ui.matrix.composerTargetSet}
              </span>
              <span className="reference-chip">
                {props.expertMode
                  ? `${ui.matrix.roomId}: ${roomId ?? topicRoomId ?? selectedRoomIds[0] ?? ui.common.na}`
                  : `${ui.matrix.roomPickerRoom}: ${roomName ?? (activeComposerRoomId ? ui.matrix.composerTargetSet : ui.common.na)}`}
              </span>
            </div>
          </div>

          <div className="info-block">
            <p className="info-label">{ui.matrix.composerModeLabel}</p>
            <div className="chip-list" data-testid="matrix-composer-mode">
              <span className="workflow-chip workflow-chip-active" data-testid="matrix-composer-mode-label">
                {composerMode}
              </span>
              <span className="reference-chip">
                {props.expertMode
                  ? describeComposerTarget(composerTarget)
                  : (composerTarget.kind === "none" ? ui.matrix.composerTargetMissing : ui.matrix.composerTargetSet)}
              </span>
            </div>
          </div>

          <div className="matrix-composer-actions">
            <button
              type="button"
              className="matrix-composer-primary-action"
              onClick={() => startNewPost()}
              data-testid="matrix-new-post"
            >
              {ui.matrix.newPost}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => startReplyToPost(selectedEventId ?? "")}
              disabled={!selectedEventId}
              data-testid="matrix-reply"
            >
              {ui.matrix.reply}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => startThreadFromPost(selectedEventId ?? selectedThreadRootId ?? "")}
              disabled={!(selectedEventId || selectedThreadRootId)}
              data-testid="matrix-thread"
            >
              {ui.matrix.thread}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => startReplyInThread(selectedThreadRootId ?? "", selectedEventId ?? undefined)}
              disabled={!selectedThreadRootId}
              data-testid="matrix-reply-in-thread"
            >
              {ui.matrix.replyInThread}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={cancelComposerTarget}
              data-testid="matrix-composer-cancel"
            >
              {ui.matrix.clearTarget}
            </button>
          </div>

          <div className="info-block matrix-target-context">
            <p className="info-label">{ui.matrix.targetContextTitle}</p>
            <div className="detail-grid">
              <div>
                <span>{props.expertMode ? ui.matrix.roomId : ui.matrix.roomPickerRoom}</span>
                <input
                  type="text"
                  value={roomId ?? ""}
                  onChange={(event) => setRoomId(event.target.value.trim().length > 0 ? event.target.value : null)}
                  placeholder={props.expertMode ? "!room:matrix.example" : ui.matrix.roomPickerChoose}
                  data-testid="matrix-composer-room-id"
                />
              </div>
              <div>
                <span>{ui.matrix.roomName}</span>
                <input
                  type="text"
                  value={roomName ?? ""}
                  onChange={(event) => setRoomName(event.target.value.trim().length > 0 ? event.target.value : null)}
                  placeholder={ui.matrix.roomName}
                  data-testid="matrix-composer-room-name"
                />
              </div>
              {props.expertMode ? (
                <div>
                  <span>{ui.matrix.postId}</span>
                  <input
                    type="text"
                    value={selectedEventId ?? ""}
                    onChange={(event) => setSelectedEventId(event.target.value.trim().length > 0 ? event.target.value : null)}
                    placeholder={ui.matrix.postId}
                    data-testid="matrix-composer-post-id"
                  />
                </div>
              ) : null}
              {props.expertMode ? (
                <div>
                  <span>{ui.matrix.threadRootId}</span>
                  <input
                    type="text"
                    value={selectedThreadRootId ?? ""}
                    onChange={(event) => setSelectedThreadRootId(event.target.value.trim().length > 0 ? event.target.value : null)}
                    placeholder={ui.matrix.threadRootId}
                    data-testid="matrix-composer-thread-root-id"
                  />
                </div>
              ) : null}
            </div>
          </div>

          <div className="info-block">
            <p className="info-label">{ui.matrix.draft}</p>
            <textarea
              className="matrix-textarea"
              rows={5}
              value={draftContent}
              onChange={(event) => setDraftContent(event.target.value)}
              placeholder={ui.matrix.draftPlaceholder}
              aria-label={ui.matrix.composerDraftLabel}
              data-testid="matrix-composer-draft"
            />
          </div>

          <div className="action-row">
            <button type="button" onClick={submitMatrixComposer} data-testid="matrix-composer-submit">
              {ui.matrix.submit}
            </button>
            <span className="muted-copy">
              {composerTarget.kind === "none"
                ? ui.matrix.submitBlocked
                : ui.matrix.submitFailClosed}
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
