import { useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import { streamChatCompletion } from "../lib/api.js";
import {
  chatReducer,
  createInitialChatState,
  type ChatMessage,
  type ConnectionState
} from "../lib/chat-workflow.js";
import {
  deriveSessionStatus,
  deriveSessionTitle,
  type ChatSession
} from "../lib/workspace-state.js";

type ChatWorkspaceProps = {
  session: ChatSession;
  backendHealthy: boolean | null;
  activeModelAlias: string | null;
  availableModels: string[];
  onActiveModelAliasChange: (alias: string) => void;
  onTelemetry: (kind: "info" | "warning" | "error", label: string, detail?: string) => void;
  onSessionChange: (session: ChatSession) => void;
};

function createId() {
  return crypto.randomUUID();
}

function statusLabel(state: ConnectionState) {
  switch (state) {
    case "submitting":
      return "Senden";
    case "streaming":
      return "Antwort läuft";
    case "completed":
      return "Fertig";
    case "error":
      return "Fehler";
    default:
      return "Bereit";
  }
}

function normalizeNotice(message: string | null, fallback: string) {
  if (!message || message.trim().length === 0) {
    return fallback;
  }

  return message
    .replace(/\bhttps?:\/\/\S+/g, "the backend")
    .replace(/\s+/g, " ")
    .trim();
}

export function ChatWorkspace(props: ChatWorkspaceProps) {
  const [chatState, dispatch] = useReducer(
    chatReducer,
    props.session.metadata.chatState,
    createInitialChatState,
  );
  const [selectedModel, setSelectedModel] = useState(
    props.session.metadata.selectedModelAlias ?? props.activeModelAlias ?? "",
  );
  const [streamActive, setStreamActive] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const malformedAbortRef = useRef(false);

  useEffect(() => {
    if (props.activeModelAlias && props.activeModelAlias !== selectedModel) {
      setSelectedModel(props.activeModelAlias);
    }
  }, [props.activeModelAlias, selectedModel]);

  useEffect(() => {
    if (props.availableModels.length > 0 && !selectedModel) {
      const nextModel = props.availableModels[0];
      setSelectedModel(nextModel);
      props.onActiveModelAliasChange(nextModel);
    }
  }, [props.availableModels, props.onActiveModelAliasChange, selectedModel]);

  useEffect(() => {
    const nextSession: ChatSession = {
      ...props.session,
      title: deriveSessionTitle({
        ...props.session,
        metadata: {
          ...props.session.metadata,
          chatState,
          selectedModelAlias: selectedModel || null,
        },
      }),
      updatedAt: new Date().toISOString(),
      status: deriveSessionStatus({
        ...props.session,
        metadata: {
          ...props.session.metadata,
          chatState,
          selectedModelAlias: selectedModel || null,
        },
      }),
      resumable: true,
      metadata: {
        ...props.session.metadata,
        chatState,
        selectedModelAlias: selectedModel || null,
      },
    };

    props.onSessionChange(nextSession);
  }, [chatState, props.onSessionChange, props.session.id, selectedModel]);

  useEffect(() => {
    if (chatState.autoScrollEnabled) {
      messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [chatState.autoScrollEnabled, chatState.currentAssistantDraft, chatState.messages]);

  function updateScrollState() {
    const list = messageListRef.current;

    if (!list) {
      return;
    }

    const isAtBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 32;
    dispatch({
      type: "set_auto_scroll",
      enabled: isAtBottom
    });
  }

  function jumpToLatest() {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    dispatch({
      type: "set_auto_scroll",
      enabled: true
    });
  }

  function stopStreaming() {
    abortRef.current?.abort();
  }

  async function submitCurrentPrompt() {
    const trimmed = chatState.input.trim();

    if (!trimmed || chatState.connectionState === "submitting" || chatState.connectionState === "streaming") {
      return;
    }

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString()
    };

    dispatch({
      type: "submit_message",
      message: userMessage
    });
    props.onTelemetry("info", "Chat submit", "User message submitted to backend chat.");

    const controller = new AbortController();
    abortRef.current = controller;
    malformedAbortRef.current = false;
    setStreamActive(true);

    const outboundMessages = [
      ...chatState.messages,
      userMessage
    ].map(({ role, content }) => ({ role, content }));

    try {
      await streamChatCompletion(
        {
          model: selectedModel || undefined,
          messages: outboundMessages
        },
        {
          onStart: (payload) => {
            dispatch({
              type: "stream_start",
              model: payload.model
            });
            props.onTelemetry("info", "Chat stream started", `Backend accepted stream for alias ${payload.model}.`);
          },
          onToken: (delta) => {
            dispatch({
              type: "stream_token",
              delta
            });
          },
          onDone: (payload) => {
            dispatch({
              type: "stream_done",
              model: payload.model,
              text: payload.text
            });
            props.onTelemetry("info", "Chat stream completed", `Finalized alias ${payload.model}.`);
          },
          onError: (message) => {
            dispatch({
              type: "stream_error",
              message
            });
            props.onTelemetry("error", "Chat stream error", message);
          },
          onMalformed: (message) => {
            malformedAbortRef.current = true;
            dispatch({
              type: "stream_malformed",
              message
            });
            props.onTelemetry("warning", "Malformed chat stream", message);
            controller.abort();
          }
        },
        controller.signal
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError" && malformedAbortRef.current) {
        return;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        dispatch({
          type: "stream_error",
          message: "Stream cancelled."
        });
        props.onTelemetry("warning", "Chat cancelled", "The active stream was aborted by the consumer.");
        return;
      }

      const message = error instanceof Error ? error.message : "Streaming request failed";
      dispatch({
        type: "stream_error",
        message
      });
      props.onTelemetry("error", "Chat request failed", message);
    } finally {
      abortRef.current = null;
      setStreamActive(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitCurrentPrompt();
  }

  const warning = chatState.lastStreamWarning;
  const error = chatState.lastError;
  const draft = chatState.currentAssistantDraft;

  return (
    <section
      className="workspace-panel chat-workspace"
      data-testid="chat-workspace"
      aria-busy={chatState.connectionState === "submitting" || chatState.connectionState === "streaming"}
    >
      <section className="workspace-hero chat-hero">
        <div>
          <h1>Chat</h1>
          <p className="hero-copy">
            Antworten werden im Backend erzeugt. Der Browser zeigt nur den Verlauf.
          </p>
          <p className="workspace-session-title">{props.session.title}</p>
        </div>

        <aside className="mini-panel">
          <label htmlFor="model-select">Public model alias</label>
          <select
            id="model-select"
            value={selectedModel}
            onChange={(event) => {
              const nextModel = event.target.value;
              setSelectedModel(nextModel);
              props.onActiveModelAliasChange(nextModel);
              props.onTelemetry("info", "Model alias changed", `Selected public alias ${nextModel || "unresolved"}.`);
            }}
            disabled={props.availableModels.length === 0}
          >
            {props.availableModels.length === 0 ? (
              <option value="">No public aliases available</option>
            ) : (
              props.availableModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))
            )}
          </select>
          <p>Only the public alias is shown here. Provider targets stay server-side.</p>
        </aside>
      </section>

      <section className="chat-card">
        <header className="chat-runtime-bar">
          <div className="runtime-stack">
            <span className="runtime-label">Connection</span>
            <strong data-testid="chat-connection-state">{statusLabel(chatState.connectionState)}</strong>
            <span className="runtime-note">Auto-scroll: {chatState.autoScrollEnabled ? "on" : "off"}</span>
          </div>

          <div className="runtime-actions">
            <button type="button" className="secondary-button" onClick={jumpToLatest}>
              Jump to latest
            </button>
            {streamActive ? (
              <button type="button" className="ghost-button" onClick={stopStreaming}>
                Stopp
              </button>
            ) : null}
          </div>
        </header>

        <div className="message-list" aria-live="polite" ref={messageListRef} onScroll={updateScrollState}>
          {chatState.messages.length === 0 ? (
            <p className="empty-state" role="status">
              Noch keine Nachrichten. Sende eine Anfrage, um den Verlauf zu starten.
            </p>
          ) : null}
          {chatState.messages.map((message) => (
            <article key={message.id} className={`message message-${message.role}`}>
              <span className="message-role">{message.role}</span>
              <p>{message.content}</p>
              {message.modelAlias ? <span className="message-meta">alias: {message.modelAlias}</span> : null}
            </article>
          ))}

          {draft ? (
            <article className="stream-draft-card">
              <span className="message-role">assistant draft</span>
              <p>{draft.text || (draft.started ? "…" : "Waiting for start frame…")}</p>
              <span className="message-meta">model alias: {draft.model ?? "pending"}</span>
            </article>
          ) : null}

          <div ref={messageEndRef} />
        </div>

        {warning ? (
          <p className="warning-banner" role="status">
            {normalizeNotice(warning, "The chat stream reported a warning.")}
          </p>
        ) : null}

        {error ? (
          <p className="error-banner" role="alert">
            {normalizeNotice(error, "The chat request failed.")}
          </p>
        ) : null}

        <form className="composer" onSubmit={handleSubmit}>
          <textarea
              data-testid="chat-composer"
              aria-label="Chat composer"
              value={chatState.input}
              onChange={(event) => dispatch({ type: "set_input", input: event.target.value })}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void submitCurrentPrompt();
                }
              }}
              placeholder="Frag das backend-verwaltete Modell etwas..."
              rows={5}
              disabled={chatState.connectionState === "submitting" || chatState.connectionState === "streaming"}
            />

          <div className="composer-footer">
            <p className="hint">
              Nur die Anfrage wird gesendet. Das Backend hält die Ausführung.
            </p>
            <button
              type="submit"
              data-testid="chat-send"
              disabled={chatState.connectionState === "submitting" || chatState.connectionState === "streaming" || chatState.input.trim().length === 0}
            >
              {chatState.connectionState === "submitting" || chatState.connectionState === "streaming" ? "Streaming…" : "Nachricht senden"}
            </button>
          </div>
        </form>
      </section>
    </section>
  );
}
