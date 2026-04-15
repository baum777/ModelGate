export type ConnectionState = "idle" | "submitting" | "streaming" | "completed" | "error";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  modelAlias?: string | null;
  createdAt?: string;
};

export type ChatDraft = {
  text: string;
  model: string | null;
  started: boolean;
};

export interface ChatState {
  messages: ChatMessage[];
  input: string;
  connectionState: ConnectionState;
  currentAssistantDraft: ChatDraft | null;
  lastError: string | null;
  lastStreamWarning: string | null;
  autoScrollEnabled: boolean;
}

export type ChatAction =
  | { type: "set_input"; input: string }
  | { type: "set_auto_scroll"; enabled: boolean }
  | { type: "submit_message"; message: ChatMessage }
  | { type: "stream_start"; model: string }
  | { type: "stream_token"; delta: string }
  | { type: "stream_done"; model: string; text: string }
  | { type: "stream_error"; message: string }
  | { type: "stream_malformed"; message: string }
  | { type: "reset_stream_warning" };

export function createInitialChatState(): ChatState {
  return {
    messages: [],
    input: "",
    connectionState: "idle",
    currentAssistantDraft: null,
    lastError: null,
    lastStreamWarning: null,
    autoScrollEnabled: true
  };
}

function createAssistantDraft(model: string | null): ChatDraft {
  return {
    text: "",
    model,
    started: false
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
        lastStreamWarning: null
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
            modelAlias: action.model
          }
        ],
        connectionState: "completed",
        currentAssistantDraft: null,
        lastError: null,
        lastStreamWarning: null
      };

    case "stream_error":
      return {
        ...state,
        connectionState: "error",
        currentAssistantDraft: null,
        lastError: action.message,
        lastStreamWarning: null
      };

    case "stream_malformed":
      return {
        ...state,
        connectionState: "error",
        currentAssistantDraft: null,
        lastError: null,
        lastStreamWarning: action.message
      };

    case "reset_stream_warning":
      return {
        ...state,
        lastStreamWarning: null
      };

    default:
      return state;
  }
}
