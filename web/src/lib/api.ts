export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type HealthResponse = {
  ok: true;
  service: string;
  mode: string;
  upstream: string;
  defaultModel: string;
  allowedModelCount: number;
  streaming: string;
};

export type ModelResponse = {
  ok: boolean;
  defaultModel: string;
  models: string[];
  source: string;
};

export type ChatStreamHandlers = {
  onStart?: (payload: { ok: true; model: string }) => void;
  onToken?: (delta: string) => void;
  onDone?: (payload: { ok: true; model: string; text: string }) => void;
  onError?: (message: string) => void;
  onMalformed?: (message: string) => void;
};

const importMetaEnv = (import.meta as {
  env?: {
    VITE_API_BASE_URL?: string;
    PROD?: boolean;
  };
}).env ?? {};

const API_BASE_URL = (
  importMetaEnv.VITE_API_BASE_URL
  ?? (importMetaEnv.PROD ? "" : "http://127.0.0.1:8787")
).replace(/\/+$/, "");

function resolveApiUrl(path: string) {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

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

function parseSseBlock(block: string) {
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
}

export async function* readSseEvents(stream: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

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
        const parsed = parseSseBlock(block);

        if (parsed) {
          yield parsed;
        }

        separatorIndex = buffer.indexOf("\n\n");
      }
    }

    const tail = parseSseBlock(buffer);

    if (tail) {
      yield tail;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(resolveApiUrl("/health"));

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json() as Promise<HealthResponse>;
}

export async function fetchModels(): Promise<ModelResponse> {
  const response = await fetch(resolveApiUrl("/models"));

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
  handlers: ChatStreamHandlers,
  signal?: AbortSignal
) {
  const response = await fetch(resolveApiUrl("/chat"), {
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

  let sawStart = false;
  let sawTerminal = false;

  function parseJson<T>(eventName: string, eventData: string) {
    try {
      return JSON.parse(eventData) as T;
    } catch {
      handlers.onMalformed?.(`Malformed ${eventName} payload in backend SSE stream.`);
      return null;
    }
  }

  for await (const event of readSseEvents(response.body)) {
    if (event.event === "start") {
      const payload = parseJson<{ ok?: unknown; model?: unknown }>("start", event.data);

      if (!payload) {
        continue;
      }

      if (payload.ok !== true || typeof payload.model !== "string" || payload.model.trim().length === 0) {
        handlers.onMalformed?.("Backend stream start frame was incomplete.");
        continue;
      }

      sawStart = true;
      handlers.onStart?.({
        ok: true,
        model: payload.model
      });
      continue;
    }

    if (event.event === "token" || event.event === "delta") {
      if (!sawStart) {
        handlers.onMalformed?.("Received token before stream start.");
        continue;
      }

      const payload = parseJson<{ delta?: unknown }>("token", event.data);

      if (payload && typeof payload.delta === "string" && payload.delta.length > 0) {
        handlers.onToken?.(payload.delta);
      }

      continue;
    }

    if (event.event === "done") {
      if (!sawStart) {
        handlers.onMalformed?.("Received done before stream start.");
        continue;
      }

      const payload = parseJson<{ ok?: unknown; model?: unknown; text?: unknown }>("done", event.data);

      if (!payload) {
        continue;
      }

      if (payload.ok !== true || typeof payload.model !== "string" || typeof payload.text !== "string") {
        handlers.onMalformed?.("Backend stream terminal frame was incomplete.");
        continue;
      }

      sawTerminal = true;
      handlers.onDone?.({
        ok: true,
        model: payload.model,
        text: payload.text
      });
      continue;
    }

    if (event.event === "error") {
      if (!sawStart) {
        handlers.onMalformed?.("Received error before stream start.");
        continue;
      }

      const payload = parseJson<{ ok?: unknown; error?: { message?: unknown } }>("error", event.data);

      if (!payload) {
        continue;
      }

      sawTerminal = true;
      const message = payload.error && typeof payload.error.message === "string" ? payload.error.message : "Request failed";
      handlers.onError?.(message);
      continue;
    }

    handlers.onMalformed?.(`Unknown SSE event "${event.event}" from backend.`);
  }

  if (!sawStart) {
    handlers.onMalformed?.("Stream ended without a start frame.");
  } else if (!sawTerminal) {
    handlers.onMalformed?.("Stream ended without a terminal frame.");
  }
}
