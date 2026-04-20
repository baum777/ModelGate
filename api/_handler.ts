import type { IncomingMessage, ServerResponse } from "node:http";
import { createAppFromRuntimeConfig, createRuntimeConfig, type RuntimeConfig } from "../server/src/runtime/create-runtime-config.js";

let appPromise: ReturnType<typeof createAppFromRuntimeConfig> | null = null;
let runtimeConfig: RuntimeConfig | null = null;

export function createVercelRuntimeConfig(source: NodeJS.ProcessEnv = process.env) {
  return createRuntimeConfig({
    source,
    loadDotEnv: false
  });
}

function createVercelApp() {
  runtimeConfig = createVercelRuntimeConfig(process.env);
  return createAppFromRuntimeConfig(runtimeConfig, false);
}

export async function getVercelApp() {
  if (!appPromise) {
    appPromise = createVercelApp();
    await appPromise.ready();
  }

  return appPromise;
}

export function getCurrentVercelRuntimeConfig() {
  return runtimeConfig;
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
