import type { AppEnv } from "./env.js";
import type { ChatRequest } from "./chat-contract.js";
import type { ResolvedModelSelection } from "./model-policy.js";
import { normalizeConfiguredModelId } from "./model-id.js";
import type { NormalizedChatResponse } from "./types.js";

type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export class OpenRouterError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "OpenRouterError";
    this.status = status;
  }
}

export type OpenRouterClient = {
  createChatCompletion(
    request: ChatRequest,
    selection: ResolvedModelSelection,
    options?: AbortSignal | {
      signal?: AbortSignal;
      apiKey?: string;
    }
  ): Promise<NormalizedChatResponse>;
  relayChatCompletionStream(
    request: ChatRequest,
    selection: ResolvedModelSelection,
    options: {
      signal?: AbortSignal;
      onToken: (delta: string) => void;
      apiKey?: string;
    }
  ): Promise<NormalizedChatResponse>;
};

type OpenRouterClientOptions = {
  env: AppEnv;
  fetchImpl?: typeof fetch;
};

function buildMessages(env: AppEnv, request: ChatRequest): OpenRouterMessage[] {
  return [
    { role: "system", content: env.DEFAULT_SYSTEM_PROMPT },
    ...request.messages.map((message) => ({
      role: message.role,
      content: message.content
    }))
  ];
}

function buildRequestBody(env: AppEnv, request: ChatRequest, stream: boolean, providerModel: string) {
  return {
    model: providerModel,
    messages: buildMessages(env, request),
    temperature: request.temperature ?? 0.7,
    stream
  };
}

const SPECIALIZED_OPENROUTER_KEY_FAMILIES = [
  {
    envKey: "OPENROUTER_API_KEY_QWEN3_CODER" as const,
    label: "qwen/qwen3-coder"
  },
  {
    envKey: "OPENROUTER_API_KEY_GPT_OSS_120B_PLANNER" as const,
    label: "openai/gpt-oss-120b"
  },
  {
    envKey: "OPENROUTER_API_KEY_NEMOTRON_3_SUPER_120B" as const,
    label: "nvidia/nemotron-3-super-120b"
  }
] as const;

function modelFamilyKey(modelId: string) {
  const normalized = normalizeConfiguredModelId(modelId)?.toLowerCase() ?? modelId.trim().toLowerCase();

  if (normalized.includes("qwen3-coder")) {
    return SPECIALIZED_OPENROUTER_KEY_FAMILIES[0];
  }

  if (normalized.includes("gpt-oss-120b")) {
    return SPECIALIZED_OPENROUTER_KEY_FAMILIES[1];
  }

  if (normalized.includes("nemotron-3-super-120b")) {
    return SPECIALIZED_OPENROUTER_KEY_FAMILIES[2];
  }

  return null;
}

function requireOpenRouterApiKey(env: AppEnv) {
  const apiKey = String(env.OPENROUTER_API_KEY ?? "").trim();

  if (!apiKey) {
    throw createOpenRouterError("OpenRouter API key is not configured", 503);
  }

  return apiKey;
}

function normalizeClientOptions(options?: AbortSignal | { signal?: AbortSignal; apiKey?: string }): {
  signal?: AbortSignal;
  apiKey?: string;
} {
  if (!options) {
    return {};
  }

  if (typeof (options as AbortSignal).aborted === "boolean") {
    return {
      signal: options as AbortSignal
    };
  }

  return options as { signal?: AbortSignal; apiKey?: string };
}

export function resolveOpenRouterApiKey(env: AppEnv, modelId: string) {
  const specializedFamily = modelFamilyKey(modelId);

  if (!specializedFamily) {
    return requireOpenRouterApiKey(env);
  }

  const apiKey = String(env[specializedFamily.envKey] ?? "").trim();

  if (!apiKey) {
    throw createOpenRouterError(
      `OpenRouter API key ${specializedFamily.envKey} is not configured for ${specializedFamily.label}`,
      503
    );
  }

  return apiKey;
}

function extractAssistantText(payload: unknown, publicModelId: string): NormalizedChatResponse {
  if (typeof payload !== "object" || payload === null) {
    return {
      model: publicModelId,
      text: ""
    };
  }

  const response = payload as {
    choices?: Array<{
      message?: {
        content?: unknown;
      };
    }>;
  };

  const text = typeof response.choices?.[0]?.message?.content === "string"
    ? response.choices[0].message.content
    : "";

  return { model: publicModelId, text };
}

function extractDelta(payload: unknown): { delta: string; finished: boolean } {
  if (typeof payload !== "object" || payload === null) {
    return { delta: "", finished: false };
  }

  const response = payload as {
    choices?: Array<{
      delta?: {
        content?: unknown;
      };
      finish_reason?: unknown;
    }>;
  };

  const delta = typeof response.choices?.[0]?.delta?.content === "string"
    ? response.choices[0].delta.content
    : "";

  const finished = response.choices?.[0]?.finish_reason !== undefined && response.choices[0].finish_reason !== null;

  return { delta, finished };
}

function createAbortTimeoutError() {
  return createOpenRouterError("OpenRouter request timed out", 504);
}

async function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise;
  }

  let cleanup = () => {};
  const abortPromise = new Promise<never>((_, reject) => {
    const onAbort = () => reject(createAbortTimeoutError());

    if (signal.aborted) {
      onAbort();
      return;
    }

    signal.addEventListener("abort", onAbort, { once: true });
    cleanup = () => signal.removeEventListener("abort", onAbort);
  });

  try {
    return await Promise.race([promise, abortPromise]);
  } finally {
    cleanup();
  }
}

async function readResponseText(response: Response, signal?: AbortSignal) {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";

  try {
    while (true) {
      const result = await raceWithAbort(reader.read(), signal);

      if (result.done) {
        break;
      }

      text += decoder.decode(result.value, { stream: true });
    }

    text += decoder.decode();
    return text;
  } finally {
    void reader.cancel().catch(() => {
      // Best-effort cleanup only.
    });
    reader.releaseLock();
  }
}

async function consumeResponseBody(response: Response, signal?: AbortSignal) {
  try {
    await readResponseText(response, signal);
  } catch {
    // Best-effort drain only. The caller only needs the status code.
  }
}

async function* readSseData(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await raceWithAbort(reader.read(), signal);

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");

      let separatorIndex = buffer.indexOf("\n\n");

      while (separatorIndex !== -1) {
        const eventBlock = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const data = extractSseEventData(eventBlock);

        if (data !== null) {
          yield data;
        }

        separatorIndex = buffer.indexOf("\n\n");
      }
    }

    const tailData = extractSseEventData(buffer);

    if (tailData !== null) {
      yield tailData;
    }
  } finally {
    void reader.cancel().catch(() => {
      // Best-effort cleanup only.
    });
    reader.releaseLock();
  }
}

function extractSseEventData(block: string): string | null {
  const lines = block
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  const dataLines = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());

  if (dataLines.length === 0) {
    return null;
  }

  return dataLines.join("\n");
}

function getUpstreamHeaders(env: AppEnv, apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": `http://${env.HOST}:${env.PORT}`,
    "X-Title": env.APP_NAME
  };
}

function createOpenRouterError(message: string, status: number) {
  return new OpenRouterError(message, status);
}

function buildOpenRouterChatUrl(env: AppEnv) {
  const baseUrl = env.OPENROUTER_BASE_URL.endsWith("/")
    ? env.OPENROUTER_BASE_URL
    : `${env.OPENROUTER_BASE_URL}/`;

  return new URL("chat/completions", baseUrl).toString();
}

async function parseSsePayload(data: string) {
  try {
    return JSON.parse(data) as unknown;
  } catch {
    throw createOpenRouterError("OpenRouter stream payload was invalid", 502);
  }
}

function normalizeTimeoutMs(timeoutMs: number) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 250 || timeoutMs > 60_000) {
    return 15_000;
  }

  return timeoutMs;
}

function createMergedAbortController(timeoutMs: number, externalSignal?: AbortSignal) {
  const timeoutController = new AbortController();
  const mergedController = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    timeoutController.abort();
  }, timeoutMs);

  const onAbort = () => {
    if (!mergedController.signal.aborted) {
      mergedController.abort();
    }
  };

  timeoutController.signal.addEventListener("abort", onAbort, { once: true });

  if (externalSignal) {
    if (externalSignal.aborted) {
      onAbort();
    } else {
      externalSignal.addEventListener("abort", onAbort, { once: true });
    }
  }

  return {
    signal: mergedController.signal,
    cleanup() {
      globalThis.clearTimeout(timeoutId);
      timeoutController.signal.removeEventListener("abort", onAbort);
      if (externalSignal) {
        externalSignal.removeEventListener("abort", onAbort);
      }
    },
    timedOut() {
      return timeoutController.signal.aborted;
    }
  };
}

export function createOpenRouterClient(options: OpenRouterClientOptions): OpenRouterClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const chatUrl = buildOpenRouterChatUrl(options.env);
  const requestTimeoutMs = normalizeTimeoutMs(options.env.OPENROUTER_REQUEST_TIMEOUT_MS);

  async function executeRequest(
    request: ChatRequest,
    selection: ResolvedModelSelection,
    stream: boolean,
    signal?: AbortSignal,
    apiKeyOverride?: string,
    onToken?: (delta: string) => void
  ) {
    let lastError: OpenRouterError | undefined;

    for (const providerModel of selection.providerTargets) {
      const merged = createMergedAbortController(requestTimeoutMs, signal);
      let response: Response;
      const apiKey = apiKeyOverride?.trim() || resolveOpenRouterApiKey(options.env, providerModel);

      try {
        response = await fetchImpl(chatUrl, {
          method: "POST",
          headers: getUpstreamHeaders(options.env, apiKey),
          body: JSON.stringify(buildRequestBody(options.env, request, stream, providerModel)),
          signal: merged.signal
        });
      } catch (error) {
        if (merged.timedOut() || (error instanceof Error && error.name === "AbortError")) {
          lastError = createOpenRouterError("OpenRouter request timed out", 504);
          continue;
        }

        if (error instanceof OpenRouterError) {
          lastError = error;
          continue;
        }

        if (error instanceof TypeError || error instanceof SyntaxError) {
          lastError = createOpenRouterError("OpenRouter request failed", 502);
          continue;
        }

        throw error;
      } finally {
        merged.cleanup();
      }

      if (!response.ok) {
        await consumeResponseBody(response, merged.signal);
        lastError = createOpenRouterError("OpenRouter request failed", response.status);
        continue;
      }

      if (!stream) {
        const payloadText = await readResponseText(response, merged.signal);
        const payload = payloadText.length > 0 ? JSON.parse(payloadText) as unknown : null;
        return extractAssistantText(payload, selection.publicModelId);
      }

      if (!response.body) {
        lastError = createOpenRouterError("OpenRouter response did not include a stream body", 502);
        continue;
      }

      let emittedToken = false;
      let text = "";

      try {
        for await (const data of readSseData(response.body, merged.signal)) {
          if (data === "[DONE]") {
            break;
          }

          const payload = await parseSsePayload(data);
          const delta = extractDelta(payload);

          if (delta.delta) {
            emittedToken = true;
            text += delta.delta;
            onToken?.(delta.delta);
          }

          if (delta.finished) {
            break;
          }
        }

        return { model: selection.publicModelId, text };
      } catch (error) {
        if (error instanceof TypeError && !emittedToken) {
          lastError = createOpenRouterError("OpenRouter request failed", 502);
          continue;
        }

        throw error;
      }
    }

    throw lastError ?? createOpenRouterError("OpenRouter request failed", 502);
  }

  return {
    async createChatCompletion(request, selection, callOptions) {
      const normalizedOptions = normalizeClientOptions(callOptions);
      return executeRequest(request, selection, false, normalizedOptions.signal, normalizedOptions.apiKey);
    },

    async relayChatCompletionStream(request, selection, streamOptions) {
      return executeRequest(request, selection, true, streamOptions.signal, streamOptions.apiKey, streamOptions.onToken);
    }
  };
}
