import type { ChatRouteMetadata } from "./api.js";

export type ConnectionState = "idle" | "submitting" | "streaming" | "completed" | "error";

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
}

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
  | { type: "create_proposal"; proposal: ChatProposal }
  | { type: "start_proposal_execution" }
  | { type: "reject_proposal"; reason?: string }
  | { type: "reset_stream_warning" }
  | { type: "clear_notices" };

export function createInitialChatState(snapshot?: Partial<ChatState>): ChatState {
  return {
    messages: snapshot?.messages ?? [],
    input: snapshot?.input ?? "",
    connectionState: snapshot?.connectionState ?? "idle",
    currentAssistantDraft: snapshot?.currentAssistantDraft ?? null,
    lastError: snapshot?.lastError ?? null,
    lastStreamWarning: snapshot?.lastStreamWarning ?? null,
    autoScrollEnabled: snapshot?.autoScrollEnabled ?? true,
    activeRoute: snapshot?.activeRoute ?? null,
    pendingProposal: snapshot?.pendingProposal ?? null,
    receipts: snapshot?.receipts ?? [],
    notices: snapshot?.notices ?? []
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
        activeRoute: null
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
        lastStreamWarning: null
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
        activeRoute: action.route
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
