export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ModelResponse = {
  ok: boolean;
  defaultModel: string;
  models: string[];
  source: string;
};

export type StreamHandlers = {
  onDelta: (delta: string) => void;
  onDone?: (payload: { model: string }) => void;
  onError?: (message: string) => void;
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8787").replace(/\/+$/, "");

async function readErrorMessage(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const payload = await response.json() as {
        message?: unknown;
        error?: unknown;
      };
      const error = payload.error;

      if (typeof payload.message === "string" && payload.message.length > 0) {
        return payload.message;
      }

      if (typeof error === "string" && error.length > 0) {
        return error;
      }

      if (error && typeof error === "object") {
        const errorMessage = (error as { message?: unknown }).message;

        if (typeof errorMessage === "string" && errorMessage.length > 0) {
          return errorMessage;
        }
      }
    } catch {
      return response.statusText || "Request failed";
    }
  }

  const text = await response.text();
  return text.trim() || response.statusText || "Request failed";
}

async function* readSseEvents(stream: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const parseBlock = (block: string) => {
    const lines = block.split(/\r?\n/).filter(Boolean);
    let event = "message";
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("event:")) {
        event = line.slice(6).trimStart();
      }

      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    if (dataLines.length === 0) {
      return null;
    }

    return {
      event,
      data: dataLines.join("\n")
    };
  };

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");

      let separatorIndex = buffer.indexOf("\n\n");

      while (separatorIndex !== -1) {
        const block = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const parsed = parseBlock(block);

        if (parsed) {
          yield parsed;
        }

        separatorIndex = buffer.indexOf("\n\n");
      }
    }

    const tail = parseBlock(buffer);

    if (tail) {
      yield tail;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function fetchModels(): Promise<ModelResponse> {
  const response = await fetch(`${API_BASE_URL}/models`);

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json() as Promise<ModelResponse>;
}

export async function streamChatCompletion(
  body: {
    model?: string;
    temperature?: number;
    messages: ChatMessage[];
  },
  handlers: StreamHandlers,
  signal?: AbortSignal
) {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ...body,
      stream: true
    }),
    signal
  });

  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  if (!contentType.includes("text/event-stream")) {
    throw new Error("Expected an SSE response from the chat endpoint");
  }

  if (!response.body) {
    throw new Error("The chat stream response did not include a body");
  }

  for await (const event of readSseEvents(response.body)) {
    if (event.event === "token" || event.event === "delta") {
      const payload = JSON.parse(event.data) as { delta?: unknown };

      if (typeof payload.delta === "string" && payload.delta.length > 0) {
        handlers.onDelta(payload.delta);
      }

      continue;
    }

    if (event.event === "done") {
      const payload = JSON.parse(event.data) as { model?: unknown };

      if (typeof payload.model === "string") {
        handlers.onDone?.({ model: payload.model });
      }

      continue;
    }

    if (event.event === "error") {
      const payload = JSON.parse(event.data) as { message?: unknown };
      handlers.onError?.(typeof payload.message === "string" ? payload.message : "Request failed");
    }
  }
}
