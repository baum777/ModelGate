import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ModelRegistry } from "../lib/model-policy.js";

const OpenRouterModelRequestSchema = z.object({
  modelId: z.string().trim().min(3).max(200)
}).strict();

export function modelRoutes(app: FastifyInstance, modelRegistry: ModelRegistry) {
  app.get("/models", async () => {
    return {
      ok: true,
      defaultModel: modelRegistry.defaultModelAlias,
      models: modelRegistry.publicModels.map((model) => model.alias),
      registry: modelRegistry.getPublicRegistry(),
      source: "backend-policy"
    };
  });

  app.post("/models/openrouter", async (request, reply) => {
    const parsed = OpenRouterModelRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: "invalid_request",
          message: "Invalid OpenRouter model request"
        }
      });
    }

    const publicModel = modelRegistry.addOpenRouterModel(parsed.data.modelId);

    if (!publicModel) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: "invalid_model",
          message: "OpenRouter model id must look like provider/model"
        }
      });
    }

    return {
      ok: true,
      alias: publicModel.alias,
      model: publicModel,
      models: modelRegistry.publicModels.map((entry) => entry.alias),
      registry: modelRegistry.getPublicRegistry(),
      source: "backend-policy"
    };
  });
}
