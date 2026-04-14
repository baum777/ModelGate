import type { AppEnv } from "./env.js";
import type { ChatRequest } from "./chat-contract.js";
import type { ResolvedModelSelection } from "./model-policy.js";
import type { NormalizedChatResponse } from "./types.js";

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

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
    signal?: AbortSignal
  ): Promise<NormalizedChatResponse>;
  relayChatCompletionStream(
    request: ChatRequest,
    selection: ResolvedModelSelection,
    options: {
      signal?: AbortSignal;
      onToken: (delta: string) => void;
    }
  ): Promise<NormalizedChatResponse>;
};

type OpenRouterClientOptions = {
  env: AppEnv;
  fetchImpl?: typeof fetch;
};

function buildMessages(env: AppEnv, request: ChatRequest) {
  return [
    { role: "system" as const, content: env.DEFAULT_SYSTEM_PROMPT },
    ...request.messages
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

async function consumeResponseBody(response: Response) {
  try {
    await response.text();
  } catch {
    // Best-effort drain only. The caller only needs the status code.
  }
}

async function* readSseData(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
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

function getUpstreamHeaders(env: AppEnv) {
  return {
    Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": `http://${env.HOST}:${env.PORT}`,
    "X-Title": env.APP_NAME
  };
}

function createOpenRouterError(message: string, status: number) {
  return new OpenRouterError(message, status);
}

async function parseSsePayload(data: string) {
  try {
    return JSON.parse(data) as unknown;
  } catch {
    throw createOpenRouterError("OpenRouter stream payload was invalid", 502);
  }
}

export function createOpenRouterClient(options: OpenRouterClientOptions): OpenRouterClient {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async createChatCompletion(request, selection, signal) {
      let lastError: OpenRouterError | undefined;

      for (const providerModel of selection.providerTargets) {
        try {
          const response = await fetchImpl(OPENROUTER_CHAT_URL, {
            method: "POST",
            headers: getUpstreamHeaders(options.env),
            body: JSON.stringify(buildRequestBody(options.env, request, false, providerModel)),
            signal
          });

          if (!response.ok) {
            await consumeResponseBody(response);
            lastError = createOpenRouterError("OpenRouter request failed", response.status);
            continue;
          }

          const payload = await response.json() as unknown;
          return extractAssistantText(payload, selection.publicModelId);
        } catch (error) {
          if (error instanceof OpenRouterError) {
            lastError = error;
            continue;
          }

          if (error instanceof TypeError || error instanceof SyntaxError) {
            lastError = createOpenRouterError("OpenRouter request failed", 502);
            continue;
          }

          throw error;
        }
      }

      throw lastError ?? createOpenRouterError("OpenRouter request failed", 502);
    },

    async relayChatCompletionStream(request, selection, streamOptions) {
      let lastError: OpenRouterError | undefined;

      for (const providerModel of selection.providerTargets) {
        let emittedToken = false;

        try {
          const response = await fetchImpl(OPENROUTER_CHAT_URL, {
            method: "POST",
            headers: getUpstreamHeaders(options.env),
            body: JSON.stringify(buildRequestBody(options.env, request, true, providerModel)),
            signal: streamOptions.signal
          });

          if (!response.ok) {
            await consumeResponseBody(response);
            lastError = createOpenRouterError("OpenRouter request failed", response.status);
            continue;
          }

          if (!response.body) {
            lastError = createOpenRouterError("OpenRouter response did not include a stream body", 502);
            continue;
          }

          let text = "";

          for await (const data of readSseData(response.body)) {
            if (data === "[DONE]") {
              break;
            }

            const payload = await parseSsePayload(data);
            const delta = extractDelta(payload);

            if (delta.delta) {
              emittedToken = true;
              text += delta.delta;
              streamOptions.onToken(delta.delta);
            }

            if (delta.finished) {
              break;
            }
          }

          return { model: selection.publicModelId, text };
        } catch (error) {
          if (error instanceof OpenRouterError) {
            lastError = error;

            if (!emittedToken) {
              continue;
            }
          }

          if (error instanceof TypeError && !emittedToken) {
            lastError = createOpenRouterError("OpenRouter request failed", 502);
            continue;
          }

          throw error;
        }
      }

      throw lastError ?? createOpenRouterError("OpenRouter request failed", 502);
    }
  };
}
