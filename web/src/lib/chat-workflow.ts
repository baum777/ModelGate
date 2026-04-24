import type { ChatMessage as ApiChatMessage, ChatRouteMetadata, ChatStreamHandlers } from "./api.js";

export type ConnectionState = "idle" | "submitting" | "streaming" | "completed" | "error";
export type ChatExecutionMode = "direct" | "governed";

export type ChatProposalStatus = "pending" | "executing";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  modelAlias?: string | null;
  createdAt?: string;
  route?: ChatRouteMetadata | null;
};

export type ChatDraft = {
  text: string;
  model: string | null;
  started: boolean;
};

export type ChatStreamState = {
  started: boolean;
  routeReceived: boolean;
  tokenCount: number;
  terminalReceived: boolean;
  terminalKind: "none" | "done" | "error" | "malformed";
  cancelled: boolean;
  interrupted: boolean;
  malformed: boolean;
};

export type ChatProposal = {
  id: string;
  prompt: string;
  modelAlias: string | null;
  consequence: string;
  createdAt: string;
  status: ChatProposalStatus;
};

export type ChatExecutionReceipt = {
  id: string;
  proposalId: string;
  prompt: string;
  modelAlias: string | null;
  outcome: "executed" | "failed" | "rejected" | "unverifiable";
  detail: string;
  createdAt: string;
  route?: ChatRouteMetadata | null;
};

export type ChatNotice = {
  id: string;
  level: "system" | "error";
  message: string;
  createdAt: string;
};

export interface ChatState {
  messages: ChatMessage[];
  input: string;
  connectionState: ConnectionState;
  currentAssistantDraft: ChatDraft | null;
  lastError: string | null;
  lastStreamWarning: string | null;
  autoScrollEnabled: boolean;
  activeRoute: ChatRouteMetadata | null;
  pendingProposal: ChatProposal | null;
  receipts: ChatExecutionReceipt[];
  notices: ChatNotice[];
  streamState: ChatStreamState;
}

export type ChatStreamInvoker = (
  body: {
    model?: string;
    modelAlias?: string;
    task?: "dialog" | "coding" | "analysis" | "review";
    mode?: "balanced" | "fast" | "deep";
    preference?: "latency" | "quality" | "cost";
    temperature?: number;
    messages: ApiChatMessage[];
  },
  handlers: ChatStreamHandlers,
  signal?: AbortSignal
) => Promise<void>;

export type ChatAction =
  | { type: "set_input"; input: string }
  | { type: "set_auto_scroll"; enabled: boolean }
  | { type: "submit_message"; message: ChatMessage }
  | { type: "stream_start"; model: string }
  | { type: "stream_route"; route: ChatRouteMetadata }
  | { type: "stream_token"; delta: string }
  | { type: "stream_done"; model: string; text: string; route: ChatRouteMetadata }
  | { type: "stream_error"; message: string }
  | { type: "stream_malformed"; message: string }
  | { type: "mark_stream_cancelled" }
  | { type: "create_proposal"; proposal: ChatProposal }
  | { type: "start_proposal_execution" }
  | { type: "reject_proposal"; reason?: string }
  | { type: "clear_pending_proposal" }
  | { type: "reset_stream_warning" }
  | { type: "clear_notices" };

type BatchScheduler = (callback: () => void) => number;
type BatchCanceller = (handle: number) => void;

const INTERRUPTED_STREAM_MESSAGE = "A chat stream was interrupted before completion and was not resumed.";

export function createInitialStreamState(snapshot?: Partial<ChatStreamState>): ChatStreamState {
  return {
    started: snapshot?.started ?? false,
    routeReceived: snapshot?.routeReceived ?? false,
    tokenCount: snapshot?.tokenCount ?? 0,
    terminalReceived: snapshot?.terminalReceived ?? false,
    terminalKind: snapshot?.terminalKind ?? "none",
    cancelled: snapshot?.cancelled ?? false,
    interrupted: snapshot?.interrupted ?? false,
    malformed: snapshot?.malformed ?? false
  };
}

function createFreshStreamState(): ChatStreamState {
  return createInitialStreamState();
}

export function normalizeChatExecutionMode(value: unknown): ChatExecutionMode {
  return value === "governed" ? "governed" : "direct";
}

export function buildGovernedChatProposal(options: {
  prompt: string;
  modelAlias: string | null;
  consequence: string;
  createdAt: string;
  createId?: () => string;
}): ChatProposal {
  const createId = options.createId ?? (() => crypto.randomUUID());

  return {
    id: createId(),
    prompt: options.prompt,
    modelAlias: options.modelAlias,
    consequence: options.consequence,
    createdAt: options.createdAt,
    status: "pending"
  };
}

export function createChatUserMessage(prompt: string, createId?: () => string): ChatMessage {
  const makeId = createId ?? (() => crypto.randomUUID());

  return {
    id: makeId(),
    role: "user",
    content: prompt,
    createdAt: new Date().toISOString()
  };
}

export function buildOutboundChatMessages(
  messages: ChatMessage[],
  userMessage: ChatMessage
): ApiChatMessage[] {
  return [...messages, userMessage].map(({ role, content }) => ({ role, content }));
}

export async function runDirectChatStream(options: {
  prompt: string;
  modelAlias: string | null;
  messages: ChatMessage[];
  stream: ChatStreamInvoker;
  handlers: ChatStreamHandlers;
  signal?: AbortSignal;
  createId?: () => string;
  userMessage?: ChatMessage;
}) {
  const userMessage = options.userMessage ?? createChatUserMessage(options.prompt, options.createId);
  const outboundMessages = buildOutboundChatMessages(options.messages, userMessage);

  await options.stream(
    {
      modelAlias: options.modelAlias ?? undefined,
      model: options.modelAlias ?? undefined,
      messages: outboundMessages
    },
    options.handlers,
    options.signal
  );

  return {
    userMessage
  };
}

export function createInitialChatState(snapshot?: Partial<ChatState>): ChatState {
  const isInFlight = snapshot?.connectionState === "submitting" || snapshot?.connectionState === "streaming";
  const persistedDraft = snapshot?.currentAssistantDraft ?? null;
  const recoveredDraft = isInFlight && persistedDraft
    ? {
        ...persistedDraft,
        started: false
      }
    : persistedDraft;
  const recoveredNotices = snapshot?.notices ?? [];
  const recoveredWarning = isInFlight ? INTERRUPTED_STREAM_MESSAGE : snapshot?.lastStreamWarning ?? null;
  const withRecoveryNotice = isInFlight
    ? [
        ...recoveredNotices,
        {
          id: `notice-stream-recover-${Date.now()}`,
          level: "system" as const,
          message: INTERRUPTED_STREAM_MESSAGE,
          createdAt: new Date().toISOString()
        }
      ]
    : recoveredNotices;

  return {
    messages: snapshot?.messages ?? [],
    input: snapshot?.input ?? "",
    connectionState: isInFlight ? "error" : snapshot?.connectionState ?? "idle",
    currentAssistantDraft: recoveredDraft,
    lastError: snapshot?.lastError ?? null,
    lastStreamWarning: recoveredWarning,
    autoScrollEnabled: snapshot?.autoScrollEnabled ?? true,
    activeRoute: snapshot?.activeRoute ?? null,
    pendingProposal: isInFlight ? null : snapshot?.pendingProposal ?? null,
    receipts: snapshot?.receipts ?? [],
    notices: withRecoveryNotice.slice(-8),
    streamState: createInitialStreamState(
      isInFlight
        ? {
            started: true,
            interrupted: true,
            terminalReceived: false,
            terminalKind: "none",
            tokenCount: recoveredDraft?.text.length ?? 0
          }
        : snapshot?.streamState
    )
  };
}

function createAssistantDraft(model: string | null): ChatDraft {
  return {
    text: "",
    model,
    started: false
  };
}

function appendReceipt(current: ChatExecutionReceipt[], receipt: ChatExecutionReceipt) {
  return [...current, receipt].slice(-8);
}

function appendNotice(current: ChatNotice[], notice: ChatNotice) {
  return [...current, notice].slice(-8);
}

function createReceipt(
  proposal: ChatProposal,
  outcome: ChatExecutionReceipt["outcome"],
  detail: string,
  route?: ChatRouteMetadata | null
): ChatExecutionReceipt {
  return {
    id: `receipt-${proposal.id}-${Date.now()}`,
    proposalId: proposal.id,
    prompt: proposal.prompt,
    modelAlias: proposal.modelAlias,
    outcome,
    detail,
    createdAt: new Date().toISOString(),
    route: route ?? null
  };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "set_input":
      return {
        ...state,
        input: action.input
      };

    case "set_auto_scroll":
      return {
        ...state,
        autoScrollEnabled: action.enabled
      };

    case "submit_message":
      return {
        ...state,
        messages: [...state.messages, action.message],
        input: "",
        connectionState: "submitting",
        currentAssistantDraft: createAssistantDraft(null),
        lastError: null,
        lastStreamWarning: null,
        activeRoute: null,
        streamState: createFreshStreamState()
      };

    case "stream_start":
      if (!state.currentAssistantDraft) {
        return {
          ...state,
          connectionState: "error",
          lastStreamWarning: "Received start for a stream that was not initialized by the UI.",
          currentAssistantDraft: null
        };
      }

      return {
        ...state,
        connectionState: "streaming",
        currentAssistantDraft: {
          ...state.currentAssistantDraft,
          model: action.model,
          started: true
        },
        lastError: null,
        lastStreamWarning: null,
        streamState: {
          ...state.streamState,
          started: true
        }
      };

    case "create_proposal":
      return {
        ...state,
        input: "",
        pendingProposal: action.proposal,
        lastError: null,
        lastStreamWarning: null
      };

    case "start_proposal_execution":
      if (!state.pendingProposal || state.pendingProposal.status !== "pending") {
        return state;
      }

      return {
        ...state,
        pendingProposal: {
          ...state.pendingProposal,
          status: "executing"
        },
        lastError: null,
        lastStreamWarning: null
      };

    case "reject_proposal":
      if (!state.pendingProposal) {
        return state;
      }

      return {
        ...state,
        pendingProposal: null,
        receipts: appendReceipt(
          state.receipts,
          createReceipt(
            state.pendingProposal,
            "rejected",
            action.reason ?? "Operator rejected the proposal before backend execution."
          )
        ),
      };

    case "clear_pending_proposal":
      return {
        ...state,
        pendingProposal: null
      };

    case "stream_route":
      if (!state.currentAssistantDraft?.started) {
        return {
          ...state,
          connectionState: "error",
          lastStreamWarning: "Received route metadata before stream start.",
          currentAssistantDraft: null
        };
      }

      return {
        ...state,
        activeRoute: action.route,
        streamState: {
          ...state.streamState,
          routeReceived: true
        }
      };

    case "stream_token":
      if (!state.currentAssistantDraft?.started) {
        return {
          ...state,
          connectionState: "error",
          lastStreamWarning: "Received token before stream start.",
          currentAssistantDraft: null
        };
      }

      return {
        ...state,
        currentAssistantDraft: {
          ...state.currentAssistantDraft,
          text: `${state.currentAssistantDraft.text}${action.delta}`
        },
        streamState: {
          ...state.streamState,
          tokenCount: state.streamState.tokenCount + action.delta.length
        }
      };

    case "stream_done":
      if (!state.currentAssistantDraft?.started) {
        return {
          ...state,
          connectionState: "error",
          lastStreamWarning: "Received terminal done before stream start.",
          currentAssistantDraft: null
        };
      }

      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: `assistant-${state.messages.length + 1}`,
            role: "assistant",
            content: action.text,
            modelAlias: action.model,
            route: action.route
          }
        ],
        connectionState: "completed",
        currentAssistantDraft: null,
        lastError: null,
        lastStreamWarning: null,
        activeRoute: action.route,
        pendingProposal: null,
        streamState: {
          ...state.streamState,
          terminalReceived: true,
          terminalKind: "done"
        },
        receipts: state.pendingProposal
          ? appendReceipt(
              state.receipts,
              createReceipt(state.pendingProposal, "executed", "Backend completed the approved prompt.", action.route)
            )
          : state.receipts
      };

    case "stream_error":
      return {
        ...state,
        connectionState: "error",
        currentAssistantDraft: null,
        lastError: action.message,
        lastStreamWarning: null,
        pendingProposal: null,
        streamState: {
          ...state.streamState,
          terminalReceived: true,
          terminalKind: "error"
        },
        receipts: state.pendingProposal
          ? appendReceipt(
              state.receipts,
              createReceipt(state.pendingProposal, "failed", action.message, state.activeRoute)
            )
          : state.receipts,
        notices: appendNotice(state.notices, {
          id: `notice-error-${Date.now()}`,
          level: "error",
          message: action.message,
          createdAt: new Date().toISOString()
        })
      };

    case "stream_malformed":
      return {
        ...state,
        connectionState: "error",
        currentAssistantDraft: null,
        lastError: null,
        lastStreamWarning: action.message,
        pendingProposal: null,
        streamState: {
          ...state.streamState,
          terminalReceived: true,
          terminalKind: "malformed",
          malformed: true
        },
        receipts: state.pendingProposal
          ? appendReceipt(
              state.receipts,
              createReceipt(state.pendingProposal, "unverifiable", action.message, state.activeRoute)
            )
          : state.receipts,
        notices: appendNotice(state.notices, {
          id: `notice-malformed-${Date.now()}`,
          level: "error",
          message: action.message,
          createdAt: new Date().toISOString()
        })
      };

    case "mark_stream_cancelled":
      return {
        ...state,
        streamState: {
          ...state.streamState,
          cancelled: true
        }
      };

    case "reset_stream_warning":
      return {
        ...state,
        lastStreamWarning: null
      };

    case "clear_notices":
      return {
        ...state,
        notices: []
      };

    default:
      return state;
  }
}

export function createTokenBatcher(options: {
  onFlush: (batchedDelta: string) => void;
  schedule?: BatchScheduler;
  cancel?: BatchCanceller;
}) {
  let buffer = "";
  let scheduledHandle: number | null = null;

  const schedule = options.schedule ?? ((callback) => {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      return window.requestAnimationFrame(() => callback());
    }

    return setTimeout(callback, 16) as unknown as number;
  });
  const cancel = options.cancel ?? ((handle) => {
    if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(handle);
      return;
    }

    clearTimeout(handle);
  });

  function flush() {
    if (scheduledHandle !== null) {
      cancel(scheduledHandle);
      scheduledHandle = null;
    }

    if (!buffer) {
      return;
    }

    const delta = buffer;
    buffer = "";
    options.onFlush(delta);
  }

  return {
    push(delta: string) {
      if (!delta) {
        return;
      }

      buffer += delta;
      if (scheduledHandle !== null) {
        return;
      }

      scheduledHandle = schedule(() => {
        scheduledHandle = null;
        if (!buffer) {
          return;
        }

        const next = buffer;
        buffer = "";
        options.onFlush(next);
      });
    },
    flush,
    cancel() {
      if (scheduledHandle !== null) {
        cancel(scheduledHandle);
        scheduledHandle = null;
      }

      buffer = "";
    }
  };
}

export function getInterruptedStreamMessage() {
  return INTERRUPTED_STREAM_MESSAGE;
}
