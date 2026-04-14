import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import type { AppEnv } from "./lib/env.js";
import { buildCorsHeaders } from "./lib/http.js";
import { buildModelRegistry, type ModelRegistry } from "./lib/model-policy.js";
import type { OpenRouterClient } from "./lib/openrouter.js";
import { chatRoutes } from "./routes/chat.js";
import { healthRoutes } from "./routes/health.js";
import { modelRoutes } from "./routes/models.js";

export type AppDependencies = {
  env: AppEnv;
  openRouter: OpenRouterClient;
  modelRegistry?: ModelRegistry;
  logger?: boolean;
};

function registerCors(app: ReturnType<typeof Fastify>, env: AppEnv) {
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const corsHeaders = buildCorsHeaders(request.headers.origin, env.CORS_ORIGINS);

    for (const [headerName, headerValue] of Object.entries(corsHeaders)) {
      reply.header(headerName, headerValue);
    }

    if (request.method === "OPTIONS") {
      reply.code(204).send();
      return;
    }
  });
}

export function createApp(deps: AppDependencies) {
  const modelRegistry = deps.modelRegistry ?? buildModelRegistry(deps.env);
  const app = Fastify({
    logger: deps.logger ?? true,
    bodyLimit: 1_048_576
  });

  registerCors(app, deps.env);

  healthRoutes(app, deps.env, modelRegistry);
  modelRoutes(app, modelRegistry);
  chatRoutes(app, {
    env: deps.env,
    openRouter: deps.openRouter,
    modelRegistry
  });

  return app;
}
