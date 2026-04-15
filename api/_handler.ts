import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "../server/src/app.js";
import { createMatrixConfig } from "../server/src/lib/matrix-env.js";
import { loadLlmRouterPolicy } from "../server/src/lib/llm-router.js";
import { createOpenRouterClient } from "../server/src/lib/openrouter.js";

let appPromise: ReturnType<typeof createApp> | null = null;

function parseCsvList(value: string) {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function createVercelEnv(source: NodeJS.ProcessEnv = process.env) {
  const openRouterApiKey = String(source.OPENROUTER_API_KEY ?? "").trim();

  if (!openRouterApiKey) {
    throw new Error("OPENROUTER_API_KEY is required");
  }

  const port = Number.parseInt(String(source.PORT ?? "8787").trim(), 10);

  return {
    PORT: Number.isFinite(port) ? port : 8787,
    HOST: String(source.HOST ?? "127.0.0.1").trim() || "127.0.0.1",
    OPENROUTER_API_KEY: openRouterApiKey,
    OPENROUTER_BASE_URL: String(source.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").trim() || "https://openrouter.ai/api/v1",
    OPENROUTER_MODEL: String(source.OPENROUTER_MODEL ?? "openrouter/auto").trim() || "openrouter/auto",
    OPENROUTER_MODELS: parseCsvList(String(source.OPENROUTER_MODELS ?? "")),
    APP_NAME: String(source.APP_NAME ?? "local-openrouter-chat").trim() || "local-openrouter-chat",
    DEFAULT_SYSTEM_PROMPT: String(
      source.DEFAULT_SYSTEM_PROMPT
      ?? "You are a concise, reliable assistant operating through a local OpenRouter proxy."
    ).trim(),
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
  } else if (normalized.pathname.startsWith("/api/") && !normalized.pathname.startsWith("/api/matrix/")) {
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
