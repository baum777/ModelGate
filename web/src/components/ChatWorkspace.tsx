import { useEffect, useRef, useState, type FormEvent } from "react";
import { fetchModels, streamChatCompletion, type ChatMessage } from "../lib/api.js";

type Message = ChatMessage & {
  id: string;
  status?: "streaming" | "final";
};

const fallbackSystemNote = "Backend-owned system prompt. Frontend only selects the model and streams output.";

function createId() {
  return crypto.randomUUID();
}

export function ChatWorkspace() {
  const [backendStatus, setBackendStatus] = useState<"loading" | "ready" | "error">("loading");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "system-note",
      role: "assistant",
      content: fallbackSystemNote,
      status: "final"
    }
  ]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadModels() {
      try {
        const response = await fetchModels();

        if (cancelled) {
          return;
        }

        setAvailableModels(response.models);
        setSelectedModel(response.defaultModel);
        setBackendStatus("ready");
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        setBackendStatus("error");
        setError(loadError instanceof Error ? loadError.message : "Failed to load backend models");
      }
    }

    void loadModels();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isStreaming]);

  function appendAssistantDelta(delta: string) {
    setMessages((current) => current.map((message) => {
      if (message.id !== "active-assistant") {
        return message;
      }

      return {
        ...message,
        content: `${message.content}${delta}`,
        status: "streaming"
      };
    }));
  }

  function stopStreaming() {
    abortRef.current?.abort();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = input.trim();

    if (!trimmed || isStreaming) {
      return;
    }

    const userMessage: Message = {
      id: createId(),
      role: "user",
      content: trimmed,
      status: "final"
    };

    const nextMessages = [
      ...messages.filter((message) => message.id !== "system-note" && message.id !== "active-assistant"),
      userMessage
    ];

    setMessages((current) => [
      ...current.filter((message) => message.id !== "active-assistant"),
      userMessage,
      {
        id: "active-assistant",
        role: "assistant",
        content: "",
        status: "streaming"
      }
    ]);

    setInput("");
    setError(null);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChatCompletion(
        {
          model: selectedModel || undefined,
          messages: nextMessages.map(({ role, content }) => ({ role, content }))
        },
        {
          onDelta: (delta) => {
            appendAssistantDelta(delta);
          },
          onDone: () => {
            setMessages((current) => current.map((message) => (
              message.id === "active-assistant"
                ? { ...message, status: "final" }
                : message
            )));
          },
          onError: (message) => {
            setError(message);
          }
        },
        controller.signal
      );
    } catch (streamError) {
      if (streamError instanceof DOMException && streamError.name === "AbortError") {
        setError("Stream cancelled");
      } else {
        setError(streamError instanceof Error ? streamError.message : "Streaming request failed");
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
      setMessages((current) => current.map((message) => (
        message.id === "active-assistant"
          ? { ...message, status: "final" }
          : message
      )));
    }
  }

  return (
    <section className="workspace-panel chat-workspace">
      <section className="hero">
        <div>
          <p className={`status-pill status-${backendStatus}`}>
            {backendStatus === "ready" ? "Backend ready" : backendStatus === "error" ? "Backend error" : "Loading backend"}
          </p>
          <h1>ModelGate Chat</h1>
          <p className="hero-copy">
            A local OpenRouter chat surface with server-owned prompting, model selection, and streaming.
          </p>
        </div>

        <aside className="model-card">
          <label htmlFor="model-select">Model</label>
          <select
            id="model-select"
            value={selectedModel}
            onChange={(event) => setSelectedModel(event.target.value)}
            disabled={availableModels.length === 0}
          >
            {availableModels.length === 0 ? (
              <option value="">No models loaded</option>
            ) : (
              availableModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))
            )}
          </select>
          <p>Models are sourced from the backend&apos;s local config, not from the client.</p>
        </aside>
      </section>

      <section className="chat-card">
        <header className="chat-card-header">
          <div>
            <span>Conversation</span>
            <strong>Streaming SSE chat</strong>
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={stopStreaming}
            disabled={!isStreaming}
          >
            Stop
          </button>
        </header>

        <div className="message-list" aria-live="polite">
          {messages.map((message) => (
            <article key={message.id} className={`message message-${message.role}`}>
              <span className="message-role">{message.role}</span>
              <p>{message.content || (message.status === "streaming" ? "…" : "")}</p>
            </article>
          ))}
          <div ref={messageEndRef} />
        </div>

        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask the backend-managed model something..."
            rows={4}
            disabled={isStreaming}
          />

          <div className="composer-footer">
            <p className="hint">
              The frontend only sends messages. Prompt policy stays in the server.
            </p>
            <button type="submit" disabled={isStreaming || input.trim().length === 0}>
              {isStreaming ? "Streaming…" : "Send"}
            </button>
          </div>
        </form>

        {error ? <p className="error-banner">{error}</p> : null}
      </section>
    </section>
  );
}
