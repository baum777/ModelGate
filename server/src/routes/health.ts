import type { FastifyInstance } from "fastify";
import type { AppEnv } from "../lib/env.js";
import type { ModelRegistry } from "../lib/model-policy.js";

export function healthRoutes(app: FastifyInstance, env: AppEnv, modelRegistry: ModelRegistry) {
  app.get("/health", async () => {
    return {
      ok: true,
      service: env.APP_NAME,
      mode: "local",
      upstream: "openrouter",
      defaultModel: modelRegistry.defaultModelId,
      allowedModelCount: modelRegistry.publicModels.length,
      streaming: "sse"
    };
  });
}
