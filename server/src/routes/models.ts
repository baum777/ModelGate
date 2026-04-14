import type { FastifyInstance } from "fastify";
import type { ModelRegistry } from "../lib/model-policy.js";

export function modelRoutes(app: FastifyInstance, modelRegistry: ModelRegistry) {
  app.get("/models", async () => {
    return {
      ok: true,
      defaultModel: modelRegistry.defaultModelId,
      models: modelRegistry.publicModels.map((model) => model.id),
      source: "backend-policy"
    };
  });
}
