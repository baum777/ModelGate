import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "../server/src/app.js";
import { createGitHubConfig } from "../server/src/lib/github-env.js";
import { createMatrixConfig } from "../server/src/lib/matrix-env.js";
import { loadLlmRouterPolicy } from "../server/src/lib/llm-router.js";
import { createOpenRouterClient } from "../server/src/lib/openrouter.js";

let appPromise: ReturnType<typeof createApp> | null = null;

function parseCsvList(value: string) {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

export function createVercelEnv(source: NodeJS.ProcessEnv = process.env) {
  const openRouterApiKey = String(source.OPENROUTER_API_KEY ?? "").trim();
  const openRouterQwenApiKey = String(source.OPENROUTER_API_KEY_QWEN3_CODER ?? "").trim();
  const openRouterPlannerApiKey = String(source.OPENROUTER_API_KEY_GPT_OSS_120B_PLANNER ?? "").trim();
  const openRouterNemotronApiKey = String(source.OPENROUTER_API_KEY_NEMOTRON_3_SUPER_120B ?? "").trim();
  const githubToken = String(source.GITHUB_TOKEN ?? "").trim();
  const githubAgentApiKey = String(source.GITHUB_AGENT_API_KEY ?? "").trim();
  const openRouterRequestTimeoutMs = Number.parseInt(String(source.OPENROUTER_REQUEST_TIMEOUT_MS ?? "15000").trim(), 10);

  const port = Number.parseInt(String(source.PORT ?? "8787").trim(), 10);
  const githubRequestTimeoutMs = Number.parseInt(String(source.GITHUB_REQUEST_TIMEOUT_MS ?? "8000").trim(), 10);
  const githubPlanTtlMs = Number.parseInt(String(source.GITHUB_PLAN_TTL_MS ?? "720000").trim(), 10);
  const githubMaxContextFiles = Number.parseInt(String(source.GITHUB_MAX_CONTEXT_FILES ?? "6").trim(), 10);
  const githubMaxContextBytes = Number.parseInt(String(source.GITHUB_MAX_CONTEXT_BYTES ?? "32768").trim(), 10);

  return {
    PORT: Number.isFinite(port) ? port : 8787,
    HOST: String(source.HOST ?? "127.0.0.1").trim() || "127.0.0.1",
    OPENROUTER_API_KEY: openRouterApiKey,
    OPENROUTER_API_KEY_QWEN3_CODER: openRouterQwenApiKey,
    OPENROUTER_API_KEY_GPT_OSS_120B_PLANNER: openRouterPlannerApiKey,
    OPENROUTER_API_KEY_NEMOTRON_3_SUPER_120B: openRouterNemotronApiKey,
    OPENROUTER_BASE_URL: String(source.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").trim() || "https://openrouter.ai/api/v1",
    OPENROUTER_MODEL: String(source.OPENROUTER_MODEL ?? "openrouter/auto").trim() || "openrouter/auto",
    OPENROUTER_MODELS: parseCsvList(String(source.OPENROUTER_MODELS ?? "")),
    OPENROUTER_REQUEST_TIMEOUT_MS: Number.isFinite(openRouterRequestTimeoutMs) ? openRouterRequestTimeoutMs : 15000,
    APP_NAME: String(source.APP_NAME ?? "local-openrouter-chat").trim() || "local-openrouter-chat",
    DEFAULT_SYSTEM_PROMPT: String(
      source.DEFAULT_SYSTEM_PROMPT
      ?? "You are a concise, reliable assistant operating through a local OpenRouter proxy."
    ).trim(),
    GITHUB_TOKEN: githubToken,
    GITHUB_ALLOWED_REPOS: parseCsvList(String(source.GITHUB_ALLOWED_REPOS ?? "")),
    GITHUB_AGENT_API_KEY: githubAgentApiKey,
    CHAT_MODEL: String(source.CHAT_MODEL ?? "").trim(),
    CODE_AGENT_MODEL: String(source.CODE_AGENT_MODEL ?? "").trim(),
    STRUCTURED_PLAN_MODEL: String(source.STRUCTURED_PLAN_MODEL ?? "").trim(),
    MATRIX_ANALYZE_MODEL: String(source.MATRIX_ANALYZE_MODEL ?? "").trim(),
    FAST_FALLBACK_MODEL: String(source.FAST_FALLBACK_MODEL ?? "").trim(),
    DIALOG_FALLBACK_MODEL: String(source.DIALOG_FALLBACK_MODEL ?? "").trim(),
    MODEL_ROUTING_MODE: String(source.MODEL_ROUTING_MODE ?? "policy").trim() || "policy",
    ALLOW_MODEL_FALLBACK: /^(1|true|yes|on)$/i.test(String(source.ALLOW_MODEL_FALLBACK ?? "true").trim()),
    MODEL_ROUTING_FAIL_CLOSED: /^(1|true|yes|on)$/i.test(String(source.MODEL_ROUTING_FAIL_CLOSED ?? "true").trim()),
    MODEL_ROUTING_LOG_ENABLED: /^(1|true|yes|on)$/i.test(String(source.MODEL_ROUTING_LOG_ENABLED ?? "false").trim()),
    MODEL_ROUTING_LOG_PATH: String(source.MODEL_ROUTING_LOG_PATH ?? ".local-ai/logs/WORKFLOW_MODEL_ROUTING.log.md").trim() || ".local-ai/logs/WORKFLOW_MODEL_ROUTING.log.md",
    MATRIX_ANALYZE_LLM_ENABLED: /^(1|true|yes|on)$/i.test(String(source.MATRIX_ANALYZE_LLM_ENABLED ?? "false").trim()),
    MATRIX_EXECUTE_APPROVAL_REQUIRED: /^(1|true|yes|on)$/i.test(String(source.MATRIX_EXECUTE_APPROVAL_REQUIRED ?? "true").trim()),
    MATRIX_VERIFY_AFTER_EXECUTE: /^(1|true|yes|on)$/i.test(String(source.MATRIX_VERIFY_AFTER_EXECUTE ?? "true").trim()),
    MATRIX_ALLOWED_ACTION_TYPES: parseCsvList(String(source.MATRIX_ALLOWED_ACTION_TYPES ?? "set_room_topic")),
    MATRIX_FAIL_CLOSED: /^(1|true|yes|on)$/i.test(String(source.MATRIX_FAIL_CLOSED ?? "true").trim()),
    GITHUB_API_BASE_URL: String(source.GITHUB_API_BASE_URL ?? "https://api.github.com").trim() || "https://api.github.com",
    GITHUB_DEFAULT_OWNER: String(source.GITHUB_DEFAULT_OWNER ?? "").trim(),
    GITHUB_BRANCH_PREFIX: String(source.GITHUB_BRANCH_PREFIX ?? "modelgate/github").trim() || "modelgate/github",
    GITHUB_REQUEST_TIMEOUT_MS: Number.isFinite(githubRequestTimeoutMs) ? githubRequestTimeoutMs : 8000,
    GITHUB_PLAN_TTL_MS: Number.isFinite(githubPlanTtlMs) ? githubPlanTtlMs : 720000,
    GITHUB_MAX_CONTEXT_FILES: Number.isFinite(githubMaxContextFiles) ? githubMaxContextFiles : 6,
    GITHUB_MAX_CONTEXT_BYTES: Number.isFinite(githubMaxContextBytes) ? githubMaxContextBytes : 32768,
    GITHUB_SMOKE_REPO: String(source.GITHUB_SMOKE_REPO ?? "").trim(),
    GITHUB_SMOKE_BASE_BRANCH: String(source.GITHUB_SMOKE_BASE_BRANCH ?? "").trim(),
    GITHUB_SMOKE_TARGET_BRANCH: String(source.GITHUB_SMOKE_TARGET_BRANCH ?? "").trim(),
    GITHUB_SMOKE_ENABLED: /^(1|true|yes|on)$/i.test(String(source.GITHUB_SMOKE_ENABLED ?? "").trim()),
    GITHUB_APP_ID: String(source.GITHUB_APP_ID ?? "").trim(),
    GITHUB_APP_PRIVATE_KEY: String(source.GITHUB_APP_PRIVATE_KEY ?? "").trim(),
    GITHUB_APP_INSTALLATION_ID: String(source.GITHUB_APP_INSTALLATION_ID ?? "").trim(),
    MODEL_GATE_ADMIN_PASSWORD: String(source.MODEL_GATE_ADMIN_PASSWORD ?? "").trim(),
    MODEL_GATE_SESSION_SECRET: String(source.MODEL_GATE_SESSION_SECRET ?? "").trim(),
    MODEL_GATE_SESSION_TTL_SECONDS: Number.isFinite(Number.parseInt(String(source.MODEL_GATE_SESSION_TTL_SECONDS ?? "86400").trim(), 10))
      ? Number.parseInt(String(source.MODEL_GATE_SESSION_TTL_SECONDS ?? "86400").trim(), 10)
      : 86_400,
    CORS_ORIGINS: parseCsvList(
      String(
        source.CORS_ORIGINS
        ?? "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"
      )
    )
  };
}

function createVercelApp() {
  const env = createVercelEnv(process.env);

  return createApp({
    env,
    openRouter: createOpenRouterClient({ env }),
    githubConfig: createGitHubConfig(env),
    matrixConfig: createMatrixConfig(process.env),
    llmRouterPolicy: loadLlmRouterPolicy(process.env),
    logger: false
  });
}

async function getVercelApp() {
  if (!appPromise) {
    appPromise = createVercelApp();
    await appPromise.ready();
  }

  return appPromise;
}

export function normalizeVercelRequestUrl(originalUrl: string) {
  const normalized = new URL(originalUrl, "http://localhost");

  if (normalized.pathname === "/api") {
    normalized.pathname = "/";
  } else if (
    normalized.pathname.startsWith("/api/")
    && !normalized.pathname.startsWith("/api/auth/")
    && !normalized.pathname.startsWith("/api/matrix/")
    && !normalized.pathname.startsWith("/api/github/")
  ) {
    normalized.pathname = normalized.pathname.slice(4);
  }

  return `${normalized.pathname}${normalized.search}`;
}

export async function handleVercelRequest(request: IncomingMessage, response: ServerResponse) {
  const app = await getVercelApp();
  const originalUrl = request.url ?? "/";
  request.url = normalizeVercelRequestUrl(originalUrl);

  await new Promise<void>((resolve, reject) => {
    const onFinish = () => resolve();
    const onClose = () => resolve();
    const onError = (error: unknown) => {
      reject(error instanceof Error ? error : new Error("Vercel request failed"));
    };

    response.once("finish", onFinish);
    response.once("close", onClose);
    response.once("error", onError);

    try {
      app.server.emit("request", request, response);
    } catch (error) {
      reject(error instanceof Error ? error : new Error("Vercel request failed"));
    }
  });
}
