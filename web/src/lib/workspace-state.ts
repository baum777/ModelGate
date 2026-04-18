import { createInitialChatState, type ChatDraft, type ChatMessage, type ChatState, type ConnectionState } from "./chat-workflow.js";
import type {
  GitHubChangePlan,
  GitHubContextBundle,
  GitHubExecuteResult,
  GitHubVerifyResult
} from "./github-api.js";
import type {
  MatrixExecutionResult,
  MatrixPlan,
  MatrixProvenance,
  MatrixRoomTopicAgentPlan,
  MatrixRoomTopicExecutionResult,
  MatrixRoomTopicVerificationResult,
  MatrixScope,
  MatrixScopeSummary,
  MatrixSpaceHierarchy
} from "./matrix-api.js";

export type WorkspaceKind = "chat" | "github" | "matrix";

export type SessionStatus = "draft" | "in_progress" | "review_required" | "done" | "failed";

export type SessionBase = {
  id: string;
  workspace: WorkspaceKind;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  status: SessionStatus;
  resumable: boolean;
  archived: boolean;
};

export type WorkspaceSession<TMetadata> = SessionBase & {
  metadata: TMetadata;
};

export type ChatSessionMetadata = {
  chatState: ChatState;
  selectedModelAlias: string | null;
};

export type GitHubSessionMetadata = {
  selectedRepoFullName: string;
  analysisBundle: GitHubContextBundle | null;
  proposalPlan: GitHubChangePlan | null;
  requestId: string | null;
  eventTrail: string[];
  approvalChecked: boolean;
  executionResult: GitHubExecuteResult | null;
  verificationResult: GitHubVerifyResult | null;
  executionError: string | null;
  verificationError: string | null;
};

export type MatrixComposerMode = "post" | "reply" | "thread";

export type MatrixComposerTarget =
  | {
      kind: "none";
      roomId: string | null;
      previewLabel: string | null;
    }
  | {
      kind: "post";
      roomId: string;
      postId: null;
      threadRootId: null;
      previewLabel: string | null;
    }
  | {
      kind: "reply";
      roomId: string;
      postId: string;
      threadRootId: null;
      previewLabel: string | null;
    }
  | {
      kind: "thread";
      roomId: string;
      postId: null;
      threadRootId: string;
      previewLabel: string | null;
    };

export type MatrixSessionMetadata = {
  mode: string;
  selectedRoomIds: string[];
  selectedSpaceIds: string[];
  currentScope: MatrixScope | null;
  scopeSummary: MatrixScopeSummary | null;
  scopeSummaryStatus: "idle" | "loading" | "ready" | "error";
  scopeSummaryError: string | null;
  scopeResolveLoading: boolean;
  scopeError: string | null;
  spaceHierarchy: MatrixSpaceHierarchy | null;
  spaceHierarchySpace: string | null;
  spaceHierarchyLoading: boolean;
  spaceHierarchyError: string | null;
  promotedPlan: MatrixPlan | null;
  promotionLoading: boolean;
  promotionError: string | null;
  planRefreshError: string | null;
  planRefreshLoading: boolean;
  stalePlanDetected: boolean;
  approvalPending: boolean;
  executionResult: MatrixExecutionResult | null;
  executionLoading: boolean;
  executionError: string | null;
  provenanceRoomId: string;
  provenance: MatrixProvenance | null;
  provenanceError: string | null;
  provenanceLoading: boolean;
  topicRoomId: string;
  topicText: string;
  topicPlan: MatrixRoomTopicAgentPlan | null;
  topicApprovalPending: boolean;
  topicExecution: MatrixRoomTopicExecutionResult | null;
  topicVerification: MatrixRoomTopicVerificationResult | null;
  topicPrepareLoading: boolean;
  topicPrepareError: string | null;
  topicExecuteLoading: boolean;
  topicExecuteError: string | null;
  topicVerifyLoading: boolean;
  topicVerifyError: string | null;
  topicPlanRefreshLoading: boolean;
  topicPlanRefreshError: string | null;
  roomId: string | null;
  roomName: string | null;
  selectedEventId: string | null;
  selectedThreadRootId: string | null;
  composerMode: MatrixComposerMode;
  composerTarget: MatrixComposerTarget;
  draftContent: string;
  lastActionResult: string | null;
};

export type ChatSession = WorkspaceSession<ChatSessionMetadata>;
export type GitHubSession = WorkspaceSession<GitHubSessionMetadata>;
export type MatrixSession = WorkspaceSession<MatrixSessionMetadata>;

export type WorkspaceSessionMap = {
  chat: ChatSession[];
  github: GitHubSession[];
  matrix: MatrixSession[];
};

export type WorkspaceState = {
  version: 1;
  activeWorkspace: WorkspaceKind;
  activeSessionIdByWorkspace: Record<WorkspaceKind, string>;
  sessionsByWorkspace: WorkspaceSessionMap;
};

const STORAGE_KEY = "modelgate.console.workspaces.v1";
const LEGACY_MATRIX_STORAGE_KEY = "modelgate.console.matrix.v1";
const WORKSPACE_VALUES: WorkspaceKind[] = ["chat", "github", "matrix"];
const SESSION_STATUS_VALUES: SessionStatus[] = ["draft", "in_progress", "review_required", "done", "failed"];

function createId() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readNullableString(value: unknown) {
  return value === null || value === undefined ? null : readString(value);
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : null;
}

function isWorkspaceKind(value: unknown): value is WorkspaceKind {
  return value === "chat" || value === "github" || value === "matrix";
}

function isSessionStatus(value: unknown): value is SessionStatus {
  return value === "draft" || value === "in_progress" || value === "review_required" || value === "done" || value === "failed";
}

function validateChatMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value.id);
  const role = value.role === "user" || value.role === "assistant" ? value.role : null;
  const content = readString(value.content);

  if (!id || !role || !content) {
    return null;
  }

  const message: ChatMessage = {
    id,
    role,
    content
  };

  if (typeof value.modelAlias === "string" || value.modelAlias === null) {
    message.modelAlias = value.modelAlias;
  }

  if (typeof value.createdAt === "string" && value.createdAt.trim().length > 0) {
    message.createdAt = value.createdAt;
  }

  return message;
}

function normalizeChatState(value: unknown): ChatState | null {
  if (!isRecord(value)) {
    return null;
  }

  const messagesValue = readArray(value.messages);
  const input = typeof value.input === "string" ? value.input : "";
  const connectionState = value.connectionState === "idle"
    || value.connectionState === "submitting"
    || value.connectionState === "streaming"
    || value.connectionState === "completed"
    || value.connectionState === "error"
      ? value.connectionState
      : null;
  const currentAssistantDraft = value.currentAssistantDraft === null || value.currentAssistantDraft === undefined
    ? null
    : isRecord(value.currentAssistantDraft)
      ? {
          text: typeof value.currentAssistantDraft.text === "string" ? value.currentAssistantDraft.text : "",
          model: value.currentAssistantDraft.model === null || typeof value.currentAssistantDraft.model === "string"
            ? value.currentAssistantDraft.model
            : null,
          started: Boolean(value.currentAssistantDraft.started)
        }
      : null;
  const lastError = readNullableString(value.lastError);
  const lastStreamWarning = readNullableString(value.lastStreamWarning);
  const autoScrollEnabled = readBoolean(value.autoScrollEnabled);

  if (!messagesValue || !connectionState || autoScrollEnabled === null) {
    return null;
  }

  const messages = messagesValue.map(validateChatMessage);

  if (messages.some((message) => message === null)) {
    return null;
  }

  const normalized: ChatState = {
    messages: messages.filter((message): message is ChatMessage => Boolean(message)),
    input,
    connectionState: connectionState === "submitting" || connectionState === "streaming"
      ? "error"
      : connectionState,
    currentAssistantDraft:
      connectionState === "submitting" || connectionState === "streaming"
        ? null
        : currentAssistantDraft,
    lastError,
    lastStreamWarning:
      connectionState === "submitting" || connectionState === "streaming"
        ? "A chat stream was in progress and was not resumed after reload."
        : lastStreamWarning,
    autoScrollEnabled
  };

  return normalized;
}

function normalizeChatSessionMetadata(value: unknown): ChatSessionMetadata | null {
  if (!isRecord(value)) {
    return null;
  }

  const chatState = normalizeChatState(value.chatState);
  const selectedModelAlias = value.selectedModelAlias === null || typeof value.selectedModelAlias === "string"
    ? value.selectedModelAlias
    : null;

  if (!chatState) {
    return null;
  }

  return {
    chatState,
    selectedModelAlias
  };
}

function normalizeGitHubSessionMetadata(value: unknown): GitHubSessionMetadata | null {
  if (!isRecord(value)) {
    return null;
  }

  const selectedRepoFullName = typeof value.selectedRepoFullName === "string" ? value.selectedRepoFullName : "";
  const eventTrail = readArray(value.eventTrail);

  if (!eventTrail || !eventTrail.every((item) => typeof item === "string")) {
    return null;
  }

  return {
    selectedRepoFullName,
    analysisBundle: value.analysisBundle === null || isRecord(value.analysisBundle) ? value.analysisBundle as GitHubContextBundle | null : null,
    proposalPlan: value.proposalPlan === null || isRecord(value.proposalPlan) ? value.proposalPlan as GitHubChangePlan | null : null,
    requestId: value.requestId === null || typeof value.requestId === "string" ? value.requestId : null,
    eventTrail,
    approvalChecked: Boolean(value.approvalChecked),
    executionResult: value.executionResult === null || isRecord(value.executionResult) ? value.executionResult as GitHubExecuteResult | null : null,
    verificationResult: value.verificationResult === null || isRecord(value.verificationResult) ? value.verificationResult as GitHubVerifyResult | null : null,
    executionError: value.executionError === null || typeof value.executionError === "string" ? value.executionError : null,
    verificationError: value.verificationError === null || typeof value.verificationError === "string" ? value.verificationError : null
  };
}

function normalizeMatrixComposerTarget(value: unknown): MatrixComposerTarget {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return {
      kind: "none",
      roomId: null,
      previewLabel: null
    };
  }

  if (value.kind === "none") {
    return {
      kind: "none",
      roomId: value.roomId === null || typeof value.roomId === "string" ? value.roomId ?? null : null,
      previewLabel: value.previewLabel === null || typeof value.previewLabel === "string" ? value.previewLabel ?? null : null
    };
  }

  if (value.kind === "post") {
    return {
      kind: "post",
      roomId: typeof value.roomId === "string" ? value.roomId : "",
      postId: null,
      threadRootId: null,
      previewLabel: value.previewLabel === null || typeof value.previewLabel === "string" ? value.previewLabel ?? null : null
    };
  }

  if (value.kind === "reply") {
    return {
      kind: "reply",
      roomId: typeof value.roomId === "string" ? value.roomId : "",
      postId: typeof value.postId === "string" ? value.postId : "",
      threadRootId: null,
      previewLabel: value.previewLabel === null || typeof value.previewLabel === "string" ? value.previewLabel ?? null : null
    };
  }

  if (value.kind === "thread") {
    return {
      kind: "thread",
      roomId: typeof value.roomId === "string" ? value.roomId : "",
      postId: null,
      threadRootId: typeof value.threadRootId === "string" ? value.threadRootId : "",
      previewLabel: value.previewLabel === null || typeof value.previewLabel === "string" ? value.previewLabel ?? null : null
    };
  }

  return {
    kind: "none",
    roomId: null,
    previewLabel: null
  };
}

function normalizeMatrixSessionMetadata(value: unknown): MatrixSessionMetadata | null {
  if (!isRecord(value)) {
    return null;
  }

  const selectedRoomIds = readArray(value.selectedRoomIds);
  const selectedSpaceIds = readArray(value.selectedSpaceIds);

  if (!selectedRoomIds || !selectedSpaceIds) {
    return null;
  }

  if (!selectedRoomIds.every((item) => typeof item === "string") || !selectedSpaceIds.every((item) => typeof item === "string")) {
    return null;
  }

  const scopeSummaryStatus = value.scopeSummaryStatus === "idle" || value.scopeSummaryStatus === "loading" || value.scopeSummaryStatus === "ready" || value.scopeSummaryStatus === "error"
    ? value.scopeSummaryStatus
    : null;

  if (!scopeSummaryStatus) {
    return null;
  }

  return {
    mode: typeof value.mode === "string" ? value.mode : "explore",
    selectedRoomIds,
    selectedSpaceIds,
    currentScope: value.currentScope === null || isRecord(value.currentScope) ? value.currentScope as MatrixScope | null : null,
    scopeSummary: value.scopeSummary === null || isRecord(value.scopeSummary) ? value.scopeSummary as MatrixScopeSummary | null : null,
    scopeSummaryStatus,
    scopeSummaryError: value.scopeSummaryError === null || typeof value.scopeSummaryError === "string" ? value.scopeSummaryError : null,
    scopeResolveLoading: Boolean(value.scopeResolveLoading),
    scopeError: value.scopeError === null || typeof value.scopeError === "string" ? value.scopeError : null,
    spaceHierarchy: value.spaceHierarchy === null || isRecord(value.spaceHierarchy) ? value.spaceHierarchy as MatrixSpaceHierarchy | null : null,
    spaceHierarchySpace: value.spaceHierarchySpace === null || typeof value.spaceHierarchySpace === "string" ? value.spaceHierarchySpace : null,
    spaceHierarchyLoading: Boolean(value.spaceHierarchyLoading),
    spaceHierarchyError: value.spaceHierarchyError === null || typeof value.spaceHierarchyError === "string" ? value.spaceHierarchyError : null,
    promotedPlan: value.promotedPlan === null || isRecord(value.promotedPlan) ? value.promotedPlan as MatrixPlan | null : null,
    promotionLoading: Boolean(value.promotionLoading),
    promotionError: value.promotionError === null || typeof value.promotionError === "string" ? value.promotionError : null,
    planRefreshError: value.planRefreshError === null || typeof value.planRefreshError === "string" ? value.planRefreshError : null,
    planRefreshLoading: Boolean(value.planRefreshLoading),
    stalePlanDetected: Boolean(value.stalePlanDetected),
    approvalPending: Boolean(value.approvalPending),
    executionResult: value.executionResult === null || isRecord(value.executionResult) ? value.executionResult as MatrixExecutionResult | null : null,
    executionLoading: Boolean(value.executionLoading),
    executionError: value.executionError === null || typeof value.executionError === "string" ? value.executionError : null,
    provenanceRoomId: typeof value.provenanceRoomId === "string" ? value.provenanceRoomId : "",
    provenance: value.provenance === null || isRecord(value.provenance) ? value.provenance as MatrixProvenance | null : null,
    provenanceError: value.provenanceError === null || typeof value.provenanceError === "string" ? value.provenanceError : null,
    provenanceLoading: Boolean(value.provenanceLoading),
    topicRoomId: typeof value.topicRoomId === "string" ? value.topicRoomId : "",
    topicText: typeof value.topicText === "string" ? value.topicText : "",
    topicPlan: value.topicPlan === null || isRecord(value.topicPlan) ? value.topicPlan as MatrixRoomTopicAgentPlan | null : null,
    topicApprovalPending: Boolean(value.topicApprovalPending),
    topicExecution: value.topicExecution === null || isRecord(value.topicExecution) ? value.topicExecution as MatrixRoomTopicExecutionResult | null : null,
    topicVerification: value.topicVerification === null || isRecord(value.topicVerification) ? value.topicVerification as MatrixRoomTopicVerificationResult | null : null,
    topicPrepareLoading: Boolean(value.topicPrepareLoading),
    topicPrepareError: value.topicPrepareError === null || typeof value.topicPrepareError === "string" ? value.topicPrepareError : null,
    topicExecuteLoading: Boolean(value.topicExecuteLoading),
    topicExecuteError: value.topicExecuteError === null || typeof value.topicExecuteError === "string" ? value.topicExecuteError : null,
    topicVerifyLoading: Boolean(value.topicVerifyLoading),
    topicVerifyError: value.topicVerifyError === null || typeof value.topicVerifyError === "string" ? value.topicVerifyError : null,
    topicPlanRefreshLoading: Boolean(value.topicPlanRefreshLoading),
    topicPlanRefreshError: value.topicPlanRefreshError === null || typeof value.topicPlanRefreshError === "string" ? value.topicPlanRefreshError : null,
    roomId: value.roomId === null || typeof value.roomId === "string" ? value.roomId : null,
    roomName: value.roomName === null || typeof value.roomName === "string" ? value.roomName : null,
    selectedEventId: value.selectedEventId === null || typeof value.selectedEventId === "string" ? value.selectedEventId : null,
    selectedThreadRootId: value.selectedThreadRootId === null || typeof value.selectedThreadRootId === "string" ? value.selectedThreadRootId : null,
    composerMode: value.composerMode === "post" || value.composerMode === "reply" || value.composerMode === "thread"
      ? value.composerMode
      : "post",
    composerTarget: normalizeMatrixComposerTarget(value.composerTarget),
    draftContent: typeof value.draftContent === "string" ? value.draftContent : "",
    lastActionResult: value.lastActionResult === null || typeof value.lastActionResult === "string" ? value.lastActionResult : null
  };
}

function normalizeSessionBase(value: unknown): SessionBase | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value.id);
  const workspace = isWorkspaceKind(value.workspace) ? value.workspace : null;
  const title = readString(value.title) ?? "Untitled session";
  const createdAt = readString(value.createdAt);
  const updatedAt = readString(value.updatedAt);
  const lastOpenedAt = readString(value.lastOpenedAt);
  const status = isSessionStatus(value.status) ? value.status : null;
  const resumable = readBoolean(value.resumable);
  const archived = readBoolean(value.archived);

  if (!id || !workspace || !createdAt || !updatedAt || !lastOpenedAt || !status || resumable === null || archived === null) {
    return null;
  }

  return {
    id,
    workspace,
    title,
    createdAt,
    updatedAt,
    lastOpenedAt,
    status,
    resumable,
    archived
  };
}

function normalizeSession<TMetadata>(
  value: unknown,
  workspace: WorkspaceKind,
  normalizeMetadata: (value: unknown) => TMetadata | null
): WorkspaceSession<TMetadata> | null {
  if (!isRecord(value)) {
    return null;
  }

  const base = normalizeSessionBase(value);
  const metadata = normalizeMetadata(value.metadata);

  if (!base || base.workspace !== workspace || !metadata) {
    return null;
  }

  return {
    ...base,
    metadata
  };
}

export function createChatSessionMetadata(): ChatSessionMetadata {
  return {
    chatState: createInitialChatState(),
    selectedModelAlias: null
  };
}

export function createGitHubSessionMetadata(): GitHubSessionMetadata {
  return {
    selectedRepoFullName: "",
    analysisBundle: null,
    proposalPlan: null,
    requestId: null,
    eventTrail: [],
    approvalChecked: false,
    executionResult: null,
    verificationResult: null,
    executionError: null,
    verificationError: null
  };
}

export function createMatrixSessionMetadata(): MatrixSessionMetadata {
  return {
    mode: "explore",
    selectedRoomIds: [],
    selectedSpaceIds: [],
    currentScope: null,
    scopeSummary: null,
    scopeSummaryStatus: "idle",
    scopeSummaryError: null,
    scopeResolveLoading: false,
    scopeError: null,
    spaceHierarchy: null,
    spaceHierarchySpace: null,
    spaceHierarchyLoading: false,
    spaceHierarchyError: null,
    promotedPlan: null,
    promotionLoading: false,
    promotionError: null,
    planRefreshError: null,
    planRefreshLoading: false,
    stalePlanDetected: false,
    approvalPending: false,
    executionResult: null,
    executionLoading: false,
    executionError: null,
    provenanceRoomId: "",
    provenance: null,
    provenanceError: null,
    provenanceLoading: false,
    topicRoomId: "",
    topicText: "",
    topicPlan: null,
    topicApprovalPending: false,
    topicExecution: null,
    topicVerification: null,
    topicPrepareLoading: false,
    topicPrepareError: null,
    topicExecuteLoading: false,
    topicExecuteError: null,
    topicVerifyLoading: false,
    topicVerifyError: null,
    topicPlanRefreshLoading: false,
    topicPlanRefreshError: null,
    roomId: null,
    roomName: null,
    selectedEventId: null,
    selectedThreadRootId: null,
    composerMode: "post",
    composerTarget: {
      kind: "none",
      roomId: null,
      previewLabel: null
    },
    draftContent: "",
    lastActionResult: null
  };
}

function createDefaultSessions(): WorkspaceSessionMap {
  const createdAt = nowIso();

  const chat = createSession("chat", createChatSessionMetadata(), { createdAt });
  const github = createSession("github", createGitHubSessionMetadata(), { createdAt });
  const matrix = createSession("matrix", createMatrixSessionMetadata(), { createdAt });

  return {
    chat: [chat],
    github: [github],
    matrix: [matrix]
  };
}

function createBaseSession<TMetadata>(workspace: WorkspaceKind, metadata: TMetadata, overrides: Partial<SessionBase> = {}): WorkspaceSession<TMetadata> {
  const timestamp = overrides.createdAt ?? nowIso();
  const base: SessionBase = {
    id: overrides.id ?? createId(),
    workspace,
    title: overrides.title ?? "",
    createdAt: timestamp,
    updatedAt: overrides.updatedAt ?? timestamp,
    lastOpenedAt: overrides.lastOpenedAt ?? timestamp,
    status: overrides.status ?? "draft",
    resumable: overrides.resumable ?? true,
    archived: overrides.archived ?? false
  };

  const session: WorkspaceSession<typeof metadata> = {
    ...base,
    metadata
  };

  return {
    ...session,
    title: overrides.title ?? deriveSessionTitle(session),
    status: overrides.status ?? deriveSessionStatus(session)
  };
}

function normalizeSessionForSave<TMetadata>(session: WorkspaceSession<TMetadata>): WorkspaceSession<TMetadata> {
  const title = deriveSessionTitle(session);
  const status = deriveSessionStatus(session);

  return {
    ...session,
    title,
    status,
    resumable: !session.archived
  };
}

function validateSessionList<TMetadata>(
  value: unknown,
  workspace: WorkspaceKind,
  normalizeMetadata: (value: unknown) => TMetadata | null
): WorkspaceSession<TMetadata>[] | null {
  const items = readArray(value);

  if (!items) {
    return null;
  }

  const normalized = items.map((item) => normalizeSession(item, workspace, normalizeMetadata));

  if (normalized.some((session) => session === null)) {
    return null;
  }

  return normalized.filter((session): session is WorkspaceSession<TMetadata> => Boolean(session));
}

function ensureActiveSessionId<TMetadata>(sessions: WorkspaceSession<TMetadata>[], preferredId: string | null | undefined) {
  if (preferredId && sessions.some((session) => session.id === preferredId)) {
    return preferredId;
  }

  return sessions[0]?.id ?? "";
}

export function createSession<TMetadata>(
  workspace: WorkspaceKind,
  metadata: TMetadata,
  overrides: Partial<SessionBase> = {}
): WorkspaceSession<TMetadata> {
  return createBaseSession(workspace, metadata, overrides);
}

export function updateSession<TMetadata>(
  state: WorkspaceState,
  workspace: WorkspaceKind,
  sessionId: string,
  updater: (session: WorkspaceSession<TMetadata>) => WorkspaceSession<TMetadata>
): WorkspaceState {
  const sessions = state.sessionsByWorkspace[workspace] as WorkspaceSession<TMetadata>[];
  const index = sessions.findIndex((session) => session.id === sessionId);

  if (index < 0) {
    return state;
  }

  const nextSession = normalizeSessionForSave({
    ...updater(sessions[index] as WorkspaceSession<TMetadata>),
    workspace: sessions[index].workspace
  });

  const nextSessions = sessions.slice();
  nextSessions[index] = nextSession as WorkspaceSession<TMetadata>;

  return {
    ...state,
    sessionsByWorkspace: {
      ...state.sessionsByWorkspace,
      [workspace]: nextSessions
    }
  };
}

export function selectSession(
  state: WorkspaceState,
  workspace: WorkspaceKind,
  sessionId: string
): WorkspaceState {
  const sessions = state.sessionsByWorkspace[workspace];

  if (!sessions.some((session) => session.id === sessionId)) {
    return state;
  }

  const now = nowIso();

  return {
    ...state,
    activeWorkspace: workspace,
    activeSessionIdByWorkspace: {
      ...state.activeSessionIdByWorkspace,
      [workspace]: sessionId
    },
    sessionsByWorkspace: {
      ...state.sessionsByWorkspace,
      [workspace]: sessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              lastOpenedAt: now,
              updatedAt: now
            }
          : session
      )
    }
  };
}

export function deleteSession(
  state: WorkspaceState,
  workspace: WorkspaceKind,
  sessionId: string
): WorkspaceState {
  const sessions = state.sessionsByWorkspace[workspace];
  const filtered = sessions.filter((session) => session.id !== sessionId);

  if (filtered.length === sessions.length) {
    return state;
  }

  const nextSessions = filtered.length > 0
    ? filtered
    : [createSession(workspace, workspace === "chat"
        ? createChatSessionMetadata()
        : workspace === "github"
          ? createGitHubSessionMetadata()
          : createMatrixSessionMetadata())];

  const activeSessionId = ensureActiveSessionId(nextSessions, state.activeSessionIdByWorkspace[workspace]);

  return {
    ...state,
    activeWorkspace: workspace,
    activeSessionIdByWorkspace: {
      ...state.activeSessionIdByWorkspace,
      [workspace]: activeSessionId
    },
    sessionsByWorkspace: {
      ...state.sessionsByWorkspace,
      [workspace]: nextSessions
    }
  };
}

export function deriveSessionTitle<TMetadata>(session: WorkspaceSession<TMetadata>): string {
  if (session.archived) {
    return `${workspaceLabel(session.workspace)} archive`;
  }

  if (session.workspace === "chat") {
    const metadata = session.metadata as ChatSessionMetadata;
    const firstUserMessage = metadata.chatState.messages.find((message) => message.role === "user");
    const text = firstUserMessage?.content ?? metadata.chatState.input;
    return text.trim().length > 0 ? text.trim().slice(0, 48) : "New chat";
  }

  if (session.workspace === "github") {
    const metadata = session.metadata as GitHubSessionMetadata;
    if (metadata.selectedRepoFullName.trim().length > 0) {
      return metadata.selectedRepoFullName;
    }
    if (metadata.proposalPlan?.summary) {
      return metadata.proposalPlan.summary;
    }
    return "GitHub session";
  }

  const metadata = session.metadata as MatrixSessionMetadata;
  if (metadata.composerTarget.kind !== "none" && metadata.composerTarget.previewLabel) {
    return metadata.composerTarget.previewLabel;
  }
  if (metadata.roomName && metadata.roomName.trim().length > 0) {
    return metadata.roomName;
  }
  if (metadata.topicText.trim().length > 0) {
    return metadata.topicText;
  }

  return "Matrix session";
}

export function deriveSessionStatus<TMetadata>(session: WorkspaceSession<TMetadata>): SessionStatus {
  if (session.archived) {
    return "done";
  }

  if (session.workspace === "chat") {
    const metadata = session.metadata as ChatSessionMetadata;
    if (metadata.chatState.connectionState === "error" || metadata.chatState.lastError) {
      return "failed";
    }
    if (metadata.chatState.connectionState === "submitting" || metadata.chatState.connectionState === "streaming") {
      return "in_progress";
    }
    return metadata.chatState.messages.length > 0 ? "done" : "draft";
  }

  if (session.workspace === "github") {
    const metadata = session.metadata as GitHubSessionMetadata;
    if (metadata.executionError || metadata.verificationError) {
      return "failed";
    }
    if (metadata.executionResult?.status === "executed") {
      return metadata.verificationResult?.status === "verified" ? "done" : "review_required";
    }
    if (metadata.proposalPlan) {
      return "review_required";
    }
    return metadata.selectedRepoFullName.trim().length > 0 ? "draft" : "draft";
  }

  const metadata = session.metadata as MatrixSessionMetadata;
  if (metadata.executionError || metadata.topicExecuteError || metadata.topicVerifyError || metadata.promotionError) {
    return "failed";
  }
  if (metadata.topicExecution || metadata.executionResult || metadata.topicVerification?.status === "verified") {
    return "done";
  }
  if (metadata.promotedPlan || metadata.topicPlan) {
    return "review_required";
  }
  if (metadata.draftContent.trim().length > 0 || metadata.composerTarget.kind !== "none") {
    return "in_progress";
  }
  return "draft";
}

export function getActiveSession<TMetadata>(
  state: WorkspaceState,
  workspace: WorkspaceKind
): WorkspaceSession<TMetadata> | null {
  const sessions = state.sessionsByWorkspace[workspace] as WorkspaceSession<TMetadata>[];
  return sessions.find((session) => session.id === state.activeSessionIdByWorkspace[workspace]) ?? sessions[0] ?? null;
}

export function createDefaultWorkspaceState(): WorkspaceState {
  const sessionsByWorkspace = createDefaultSessions();
  return {
    version: 1,
    activeWorkspace: "chat",
    activeSessionIdByWorkspace: {
      chat: sessionsByWorkspace.chat[0]?.id ?? "",
      github: sessionsByWorkspace.github[0]?.id ?? "",
      matrix: sessionsByWorkspace.matrix[0]?.id ?? ""
    },
    sessionsByWorkspace
  };
}

export function loadWorkspaceState(): WorkspaceState {
  if (typeof window === "undefined") {
    return createDefaultWorkspaceState();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (isRecord(parsed) && parsed.version === 1) {
        const parsedSessionsByWorkspace = isRecord(parsed.sessionsByWorkspace) ? parsed.sessionsByWorkspace : null;
        const parsedActiveSessionIdByWorkspace = isRecord(parsed.activeSessionIdByWorkspace)
          ? parsed.activeSessionIdByWorkspace
          : null;

        if (!parsedSessionsByWorkspace || !parsedActiveSessionIdByWorkspace) {
          return createDefaultWorkspaceState();
        }

        const chatSessions = validateSessionList(parsedSessionsByWorkspace.chat, "chat", normalizeChatSessionMetadata);
        const githubSessions = validateSessionList(parsedSessionsByWorkspace.github, "github", normalizeGitHubSessionMetadata);
        const matrixSessions = validateSessionList(parsedSessionsByWorkspace.matrix, "matrix", normalizeMatrixSessionMetadata);

        if (!chatSessions || !githubSessions || !matrixSessions) {
          return createDefaultWorkspaceState();
        }

        const sessionsByWorkspace: WorkspaceSessionMap = {
          chat: chatSessions,
          github: githubSessions,
          matrix: matrixSessions
        };

        const activeWorkspace = isWorkspaceKind(parsed.activeWorkspace) ? parsed.activeWorkspace : "chat";
        const activeSessionIdByWorkspace = {
          chat: ensureActiveSessionId(sessionsByWorkspace.chat, readString(parsedActiveSessionIdByWorkspace.chat)),
          github: ensureActiveSessionId(sessionsByWorkspace.github, readString(parsedActiveSessionIdByWorkspace.github)),
          matrix: ensureActiveSessionId(sessionsByWorkspace.matrix, readString(parsedActiveSessionIdByWorkspace.matrix))
        };

        return {
          version: 1,
          activeWorkspace,
          activeSessionIdByWorkspace,
          sessionsByWorkspace
        };
      }
    }
  } catch {
    // Fall through to legacy migration/default.
  }

  const legacy = readLegacyWorkspaceState();
  if (legacy) {
    return legacy;
  }

  return createDefaultWorkspaceState();
}

export function saveWorkspaceState(state: WorkspaceState) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized: WorkspaceState = {
    version: 1,
    activeWorkspace: state.activeWorkspace,
    activeSessionIdByWorkspace: {
      chat: state.activeSessionIdByWorkspace.chat,
      github: state.activeSessionIdByWorkspace.github,
      matrix: state.activeSessionIdByWorkspace.matrix
    },
    sessionsByWorkspace: {
      chat: state.sessionsByWorkspace.chat.map((session) => normalizeSessionForSave(session)),
      github: state.sessionsByWorkspace.github.map((session) => normalizeSessionForSave(session)),
      matrix: state.sessionsByWorkspace.matrix.map((session) => normalizeSessionForSave(session))
    }
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

export function workspaceLabel(workspace: WorkspaceKind) {
  switch (workspace) {
    case "github":
      return "GitHub";
    case "matrix":
      return "Matrix";
    default:
      return "Chat";
  }
}

export function sortSessionsByUpdatedAt<TMetadata>(sessions: WorkspaceSession<TMetadata>[]) {
  return sessions.slice().sort((left, right) => {
    if (left.archived !== right.archived) {
      return left.archived ? 1 : -1;
    }

    const updatedAtDelta = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    if (updatedAtDelta !== 0) {
      return updatedAtDelta;
    }

    return new Date(right.lastOpenedAt).getTime() - new Date(left.lastOpenedAt).getTime();
  });
}

function readLegacyWorkspaceState(): WorkspaceState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(LEGACY_MATRIX_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!isRecord(parsed)) {
      return null;
    }

    const matrixMetadata = createMatrixSessionMetadata();
    const selectedRoomIds = readArray(parsed.selectedRoomIds);
    const selectedSpaceIds = readArray(parsed.selectedSpaceIds);

    matrixMetadata.selectedRoomIds = selectedRoomIds?.filter((value): value is string => typeof value === "string") ?? [];
    matrixMetadata.selectedSpaceIds = selectedSpaceIds?.filter((value): value is string => typeof value === "string") ?? [];

    const sessionsByWorkspace = createDefaultSessions();
    sessionsByWorkspace.matrix = [
      createSession("matrix", matrixMetadata)
    ];

    return {
      version: 1,
      activeWorkspace: "matrix",
      activeSessionIdByWorkspace: {
        chat: sessionsByWorkspace.chat[0]?.id ?? "",
        github: sessionsByWorkspace.github[0]?.id ?? "",
        matrix: sessionsByWorkspace.matrix[0]?.id ?? ""
      },
      sessionsByWorkspace
    };
  } catch {
    return null;
  }
}

export function appendSession<TMetadata>(
  state: WorkspaceState,
  workspace: WorkspaceKind,
  session: WorkspaceSession<TMetadata>
): WorkspaceState {
  const sessions = state.sessionsByWorkspace[workspace];
  const nextSessions = sortSessionsByUpdatedAt([
    ...(sessions as WorkspaceSession<TMetadata>[]),
    normalizeSessionForSave(session)
  ]);

  return {
    ...state,
    activeWorkspace: workspace,
    activeSessionIdByWorkspace: {
      ...state.activeSessionIdByWorkspace,
      [workspace]: session.id
    },
    sessionsByWorkspace: {
      ...state.sessionsByWorkspace,
      [workspace]: nextSessions as WorkspaceSessionMap[typeof workspace]
    }
  };
}
