export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatRouteMetadata = {
  selectedAlias: string;
  taskClass: "dialog" | "coding" | "analysis" | "review";
  fallbackUsed: boolean;
  degraded: boolean;
  streaming: boolean;
  policyVersion?: string;
  decisionReason?: string;
  retryCount?: number;
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
  registry: Array<{
    alias: string;
    label: string;
    description: string;
    capabilities: string[];
    tier: "core" | "specialized" | "fallback";
    streaming: boolean;
    recommendedFor: string[];
    default?: boolean;
    available?: boolean;
  }>;
  source: string;
};

export type DiagnosticsResponse = {
  ok: true;
  service: string;
  runtimeMode: string;
  diagnosticsGeneratedAt: string;
  processStartedAt: string;
  uptimeMs: number;
  models: {
    defaultPublicAlias: string;
    publicAliases: string[];
  };
  routing: {
    mode: string;
    allowFallback: boolean;
    failClosed: boolean;
    requireBackendOwnedResolution: boolean;
  };
  rateLimit: {
    enabled: boolean;
    windowMs: number;
    limits: {
      chat: number;
      auth_login: number;
      github_propose: number;
      github_execute: number;
      matrix_execute: number;
    };
    blockedByScope: {
      chat: number;
      auth_login: number;
      github_propose: number;
      github_execute: number;
      matrix_execute: number;
    };
  };
  actionStore: {
    mode: "memory" | "file";
  };
  github: {
    configured: boolean;
    ready: boolean;
  };
  matrix: {
    configured: boolean;
    ready: boolean;
  };
  journal: {
    enabled: boolean;
    mode: "memory" | "file";
    maxEntries: number;
    exposeRecentLimit: number;
    recentCount: number;
  };
  counters: {
    chatRequests: number;
    chatStreamStarted: number;
    chatStreamCompleted: number;
    chatStreamError: number;
    chatStreamAborted: number;
    upstreamError: number;
  };
};

export type IntegrationConnectionStatus =
  | "not_connected"
  | "connect_available"
  | "connected"
  | "auth_expired"
  | "missing_server_config"
  | "scope_denied"
  | "upstream_unreachable"
  | "disabled_by_policy"
  | "error";

export type IntegrationCredentialSource =
  | "instance_configured"
  | "user_connected"
  | "user_connected_stub"
  | "not_connected";

export type IntegrationCapability = {
  read: "available" | "blocked" | "unknown";
  propose: "available" | "blocked" | "unknown";
  execute: "available" | "approval_required" | "blocked" | "unknown";
  verify: "available" | "blocked" | "unknown";
};

export type IntegrationStatus = {
  status: IntegrationConnectionStatus;
  credentialSource: IntegrationCredentialSource;
  capabilities: IntegrationCapability;
  executionMode: "disabled" | "approval_required" | "enabled";
  labels: {
    identity: string | null;
    scope: string | null;
    allowedReposStatus?: "configured" | "restricted" | "missing";
    homeserver?: string | null;
    roomAccess?: "readable" | "blocked" | "unknown";
  };
  lastVerifiedAt: string | null;
  lastErrorCode: string | null;
};

export type IntegrationsStatusResponse = {
  ok: true;
  generatedAt: string;
  github: IntegrationStatus;
  matrix: IntegrationStatus;
};

export type JournalEntry = {
  id: string;
  timestamp: string;
  source: "chat" | "github" | "matrix" | "auth" | "rate_limit" | "diagnostics" | "system";
  eventType: string;
  authorityDomain: string;
  severity: "info" | "warning" | "error";
  outcome: "accepted" | "rejected" | "executed" | "failed" | "blocked" | "verified" | "unverifiable" | "observed";
  summary: string;
  correlationId: string | null;
  proposalId: string | null;
  planId: string | null;
  executionId: string | null;
  verificationId: string | null;
  modelRouteSummary: {
    selectedAlias?: string;
    workflowRole?: string;
    taskClass?: string;
    fallbackUsed?: boolean;
    degraded?: boolean;
    streaming?: boolean;
  } | null;
  safeMetadata: Record<string, unknown>;
  redaction: {
    contentStored: false;
    secretsStored: false;
    filteredKeys: string[];
  };
};

export type JournalRecentResponse = {
  ok: true;
  entries: JournalEntry[];
};

export type ChatStreamHandlers = {
  onStart?: (payload: { ok: true; model: string }) => void;
  onRoute?: (payload: { ok: true; route: ChatRouteMetadata }) => void;
  onToken?: (delta: string) => void;
  onDone?: (payload: { ok: true; model: string; text: string; route: ChatRouteMetadata }) => void;
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
        code?: unknown;
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

      if (typeof payload.code === "string" && payload.code.length > 0) {
        return payload.code;
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
  const response = await fetch(resolveApiUrl("/health"), {
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json() as Promise<HealthResponse>;
}

export async function fetchModels(): Promise<ModelResponse> {
  const response = await fetch(resolveApiUrl("/models"), {
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json() as Promise<ModelResponse>;
}

export async function fetchDiagnostics(): Promise<DiagnosticsResponse> {
  const response = await fetch(resolveApiUrl("/diagnostics"), {
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json() as Promise<DiagnosticsResponse>;
}

export async function fetchJournalRecent(options?: { limit?: number; source?: JournalEntry["source"] }): Promise<JournalRecentResponse> {
  const params = new URLSearchParams();

  if (typeof options?.limit === "number" && Number.isFinite(options.limit) && options.limit > 0) {
    params.set("limit", String(Math.floor(options.limit)));
  }

  if (options?.source) {
    params.set("source", options.source);
  }

  const query = params.toString();
  const response = await fetch(resolveApiUrl(`/journal/recent${query.length > 0 ? `?${query}` : ""}`), {
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json() as Promise<JournalRecentResponse>;
}

export async function fetchIntegrationsStatus(): Promise<IntegrationsStatusResponse> {
  const response = await fetch(resolveApiUrl("/api/integrations/status"), {
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json() as Promise<IntegrationsStatusResponse>;
}

export async function postIntegrationControlAction(provider: "github" | "matrix", action: "disconnect" | "reverify") {
  const response = await fetch(resolveApiUrl(`/api/auth/${provider}/${action}`), {
    method: "POST",
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json() as Promise<{
    ok: true;
    provider: "github" | "matrix";
  }>;
}

export function buildIntegrationConnectStartUrl(provider: "github" | "matrix", returnTo = "/console?mode=settings") {
  const params = new URLSearchParams();
  params.set("returnTo", returnTo);
  return resolveApiUrl(`/api/auth/${provider}/start?${params.toString()}`);
}

export async function streamChatCompletion(
  body: {
    model?: string;
    modelAlias?: string;
    task?: "dialog" | "coding" | "analysis" | "review";
    mode?: "balanced" | "fast" | "deep";
    preference?: "latency" | "quality" | "cost";
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
    credentials: "include",
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

    if (event.event === "route") {
      if (!sawStart) {
        handlers.onMalformed?.("Received route before stream start.");
        continue;
      }

      const payload = parseJson<{ ok?: unknown; route?: unknown }>("route", event.data);

      if (!payload) {
        continue;
      }

      if (payload.ok !== true || !payload.route || typeof payload.route !== "object") {
        handlers.onMalformed?.("Backend route frame was incomplete.");
        continue;
      }

      const route = payload.route as Partial<ChatRouteMetadata>;

      if (
        typeof route.selectedAlias !== "string"
        || typeof route.taskClass !== "string"
        || typeof route.fallbackUsed !== "boolean"
        || typeof route.degraded !== "boolean"
        || typeof route.streaming !== "boolean"
      ) {
        handlers.onMalformed?.("Backend route frame had invalid fields.");
        continue;
      }

      handlers.onRoute?.({
        ok: true,
        route: {
          selectedAlias: route.selectedAlias,
          taskClass: route.taskClass as ChatRouteMetadata["taskClass"],
          fallbackUsed: route.fallbackUsed,
          degraded: route.degraded,
          streaming: route.streaming,
          policyVersion: typeof route.policyVersion === "string" ? route.policyVersion : undefined,
          decisionReason: typeof route.decisionReason === "string" ? route.decisionReason : undefined,
          retryCount: typeof route.retryCount === "number" ? route.retryCount : undefined
        }
      });
      continue;
    }

    if (event.event === "done") {
      if (!sawStart) {
        handlers.onMalformed?.("Received done before stream start.");
        continue;
      }

      const payload = parseJson<{ ok?: unknown; model?: unknown; text?: unknown; route?: unknown }>("done", event.data);

      if (!payload) {
        continue;
      }

      if (
        payload.ok !== true
        || typeof payload.model !== "string"
        || typeof payload.text !== "string"
        || !payload.route
        || typeof payload.route !== "object"
      ) {
        handlers.onMalformed?.("Backend stream terminal frame was incomplete.");
        continue;
      }

      const route = payload.route as Partial<ChatRouteMetadata>;

      if (
        typeof route.selectedAlias !== "string"
        || typeof route.taskClass !== "string"
        || typeof route.fallbackUsed !== "boolean"
        || typeof route.degraded !== "boolean"
        || typeof route.streaming !== "boolean"
      ) {
        handlers.onMalformed?.("Backend stream terminal route metadata was incomplete.");
        continue;
      }

      sawTerminal = true;
      handlers.onDone?.({
        ok: true,
        model: payload.model,
        text: payload.text,
        route: {
          selectedAlias: route.selectedAlias,
          taskClass: route.taskClass as ChatRouteMetadata["taskClass"],
          fallbackUsed: route.fallbackUsed,
          degraded: route.degraded,
          streaming: route.streaming,
          policyVersion: typeof route.policyVersion === "string" ? route.policyVersion : undefined,
          decisionReason: typeof route.decisionReason === "string" ? route.decisionReason : undefined,
          retryCount: typeof route.retryCount === "number" ? route.retryCount : undefined
        }
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
