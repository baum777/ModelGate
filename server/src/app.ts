import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import type { AppEnv } from "./lib/env.js";
import { createGitHubClient, type GitHubClient } from "./lib/github-client.js";
import { createGitHubConfig, type GitHubConfig } from "./lib/github-env.js";
import { createGitHubActionStore, type GitHubActionStore } from "./lib/github-action-store.js";
import { createAuthConfig, type AuthConfig } from "./lib/auth.js";
import { loadLlmRouterPolicy, type LlmRouterPolicy } from "./lib/llm-router.js";
import { createDisabledMatrixConfig, type MatrixConfig } from "./lib/matrix-env.js";
import { buildCorsHeaders } from "./lib/http.js";
import { buildModelRegistry, type ModelRegistry } from "./lib/model-policy.js";
import { createMatrixClient, type MatrixClient } from "./lib/matrix-client.js";
import { createMatrixActionStore, type MatrixActionStore } from "./lib/matrix-action-store.js";
import { createMatrixScopeStore, type MatrixScopeStore } from "./lib/matrix-scope-store.js";
import type { OpenRouterClient } from "./lib/openrouter.js";
import { authRoutes } from "./routes/auth.js";
import { chatRoutes } from "./routes/chat.js";
import { githubRoutes } from "./routes/github.js";
import { matrixRoutes } from "./routes/matrix.js";
import { healthRoutes } from "./routes/health.js";
import { modelRoutes } from "./routes/models.js";

export type AppDependencies = {
  env: AppEnv;
  openRouter: OpenRouterClient;
  githubConfig?: GitHubConfig;
  githubClient?: GitHubClient;
  githubActionStore?: GitHubActionStore;
  authConfig?: AuthConfig;
  matrixConfig?: MatrixConfig;
  matrixClient?: MatrixClient;
  matrixStore?: MatrixScopeStore;
  matrixActionStore?: MatrixActionStore;
  modelRegistry?: ModelRegistry;
  llmRouterPolicy?: LlmRouterPolicy;
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
  const llmRouterPolicy = deps.llmRouterPolicy ?? loadLlmRouterPolicy({
    LLM_ROUTER_ENABLED: "false"
  });
  const authConfig = deps.authConfig ?? createAuthConfig(deps.env);
  const githubConfig = deps.githubConfig ?? createGitHubConfig(deps.env);
  const githubClient = deps.githubClient ?? createGitHubClient({ config: githubConfig });
  const githubActionStore = deps.githubActionStore ?? createGitHubActionStore(githubConfig.planTtlMs);
  const matrixConfig = deps.matrixConfig ?? createDisabledMatrixConfig();
  const matrixClient = deps.matrixClient ?? createMatrixClient({ config: matrixConfig });
  const matrixStore = deps.matrixStore ?? createMatrixScopeStore();
  const matrixActionStore = deps.matrixActionStore ?? createMatrixActionStore();
  const app = Fastify({
    logger: deps.logger ?? true,
    bodyLimit: 1_048_576
  });

  registerCors(app, deps.env);

  healthRoutes(app, deps.env, modelRegistry);
  modelRoutes(app, modelRegistry);
  authRoutes(app, {
    config: authConfig
  });
  matrixRoutes(app, {
    config: matrixConfig,
    client: matrixClient,
    store: matrixStore,
    actionStore: matrixActionStore
  });
  githubRoutes(app, {
    config: githubConfig,
    authConfig,
    client: githubClient,
    openRouter: deps.openRouter,
    modelRegistry,
    actionStore: githubActionStore
  });
  chatRoutes(app, {
    env: deps.env,
    openRouter: deps.openRouter,
    modelRegistry,
    llmRouterPolicy
  });

  return app;
}
