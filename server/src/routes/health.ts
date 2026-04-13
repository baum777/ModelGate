import type { FastifyInstance } from "fastify";
import type { AppEnv } from "../lib/env.js";

export function healthRoutes(app: FastifyInstance, env: AppEnv) {
  app.get("/health", async () => {
    return {
      ok: true,
      service: env.APP_NAME,
      mode: "local",
      upstream: "openrouter",
      defaultModel: env.OPENROUTER_MODEL,
      allowedModelCount: new Set([env.OPENROUTER_MODEL, ...env.OPENROUTER_MODELS]).size,
      streaming: "sse"
    };
  });
}
