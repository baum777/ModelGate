import type { FastifyInstance } from "fastify";
import type { AppEnv } from "../lib/env.js";

function uniqueModels(env: AppEnv) {
  return [...new Set([env.OPENROUTER_MODEL, ...env.OPENROUTER_MODELS])];
}

export function modelRoutes(app: FastifyInstance, env: AppEnv) {
  app.get("/models", async () => {
    return {
      ok: true,
      defaultModel: env.OPENROUTER_MODEL,
      models: uniqueModels(env),
      source: "local-config"
    };
  });
}
