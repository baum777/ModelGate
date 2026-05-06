import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import type { AppEnv } from "./lib/env.js";
import { createGitHubClient, type GitHubClient } from "./lib/github-client.js";
import { createGitHubConfig, type GitHubConfig } from "./lib/github-env.js";
import {
  createConfigurableGitHubActionStore,
  createGitHubActionStoreSelection,
  type GitHubActionStore
} from "./lib/github-action-store.js";
import { createAuthConfig, type AuthConfig } from "./lib/auth.js";
import { createDisabledMatrixConfig, type MatrixConfig } from "./lib/matrix-env.js";
import { buildCorsHeaders } from "./lib/http.js";
import { buildModelRegistry, type ModelRegistry } from "./lib/model-policy.js";
import { createMatrixClient, type MatrixClient } from "./lib/matrix-client.js";
import { createMatrixActionStore, type MatrixActionStore } from "./lib/matrix-action-store.js";
import { createMatrixScopeStore, type MatrixScopeStore } from "./lib/matrix-scope-store.js";
import type { OpenRouterClient } from "./lib/openrouter.js";
import { createAppRateLimiter, createRateLimitConfig, type AppRateLimiter } from "./lib/rate-limit.js";
import {
  createRuntimeJournal,
  createRuntimeJournalSelection,
  type RuntimeJournal
} from "./lib/runtime-journal.js";
import { createRuntimeObservability, type RuntimeObservability } from "./lib/runtime-observability.js";
import { loadModelCapabilitiesConfig, type ModelCapabilitiesConfig } from "./lib/workflow-model-router.js";
import {
  createIntegrationAuthStore,
  createIntegrationAuthStoreSelection,
  type IntegrationAuthStore
} from "./lib/integration-auth-store.js";
import { authRoutes } from "./routes/auth.js";
import { chatRoutes } from "./routes/chat.js";
import { diagnosticsRoutes } from "./routes/diagnostics.js";
import { githubRoutes } from "./routes/github.js";
import { integrationAuthRoutes } from "./routes/integration-auth.js";
import { integrationRoutes } from "./routes/integrations.js";
import { journalRoutes } from "./routes/journal.js";
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
  rateLimiter?: AppRateLimiter;
  runtimeJournal?: RuntimeJournal;
  runtimeObservability?: RuntimeObservability;
  modelRegistry?: ModelRegistry;
  modelCapabilitiesConfig?: ModelCapabilitiesConfig;
  integrationAuthStore?: IntegrationAuthStore;
  integrationFetch?: typeof fetch;
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
  const modelCapabilitiesConfig = deps.modelCapabilitiesConfig ?? loadModelCapabilitiesConfig();
  const authConfig = deps.authConfig ?? createAuthConfig(deps.env);
  const githubConfig = deps.githubConfig ?? createGitHubConfig(deps.env);
  const githubClient = deps.githubClient ?? createGitHubClient({ config: githubConfig });
  const githubActionStoreSelection = createGitHubActionStoreSelection(deps.env);
  const githubActionStore = deps.githubActionStore ?? createConfigurableGitHubActionStore({
    ...githubActionStoreSelection,
    ttlMs: githubConfig.planTtlMs
  });
  const matrixConfig = deps.matrixConfig ?? createDisabledMatrixConfig();
  const matrixClient = deps.matrixClient ?? createMatrixClient({ config: matrixConfig });
  const matrixStore = deps.matrixStore ?? createMatrixScopeStore();
  const matrixActionStore = deps.matrixActionStore ?? createMatrixActionStore();
  const runtimeJournalSelection = createRuntimeJournalSelection(deps.env);
  const runtimeJournal = deps.runtimeJournal ?? createRuntimeJournal({
    enabled: runtimeJournalSelection.enabled,
    mode: runtimeJournalSelection.mode,
    filePath: runtimeJournalSelection.filePath,
    maxEntries: runtimeJournalSelection.maxEntries,
    exposeRecentLimit: runtimeJournalSelection.exposeRecentLimit
  });
  const rateLimiter = deps.rateLimiter ?? createAppRateLimiter(createRateLimitConfig(deps.env), undefined, (blocked) => {
    runtimeJournal.append({
      source: "rate_limit",
      eventType: "rate_limit_blocked",
      authorityDomain: "backend",
      severity: "warning",
      outcome: "blocked",
      summary: `Rate limit blocked for scope ${blocked.scope}`,
      safeMetadata: {
        scope: blocked.scope,
        retryAfterSeconds: blocked.retryAfterSeconds
      }
    });
  });
  const runtimeObservability = deps.runtimeObservability ?? createRuntimeObservability();
  const integrationAuthStoreSelection = createIntegrationAuthStoreSelection(deps.env);
  const integrationAuthStore = deps.integrationAuthStore ?? createIntegrationAuthStore({
    mode: integrationAuthStoreSelection.mode,
    filePath: integrationAuthStoreSelection.filePath,
    currentEncryptionKey: integrationAuthStoreSelection.encryption.current,
    previousEncryptionKeys: integrationAuthStoreSelection.encryption.previous
  });
  const app = Fastify({
    logger: deps.logger ?? true,
    bodyLimit: 1_048_576
  });

  registerCors(app, deps.env);

  healthRoutes(app, deps.env, modelRegistry);
  modelRoutes(app, modelRegistry);
  diagnosticsRoutes(app, {
    env: deps.env,
    modelRegistry,
    modelCapabilitiesConfig,
    rateLimiter,
    runtimeObservability,
    githubConfig,
    matrixConfig,
    actionStoreSelection: githubActionStoreSelection,
    runtimeJournal
  });
  journalRoutes(app, {
    runtimeJournal
  });
  authRoutes(app, {
    config: authConfig,
    rateLimiter
  });
  integrationAuthRoutes(app, {
    env: deps.env,
    matrixConfig,
    authStore: integrationAuthStore,
    fetchImpl: deps.integrationFetch
  });
  integrationRoutes(app, {
    githubConfig,
    matrixConfig,
    authStore: integrationAuthStore
  });
  matrixRoutes(app, {
    config: matrixConfig,
    client: matrixClient,
    store: matrixStore,
    actionStore: matrixActionStore,
    rateLimiter,
    runtimeJournal
  });
  githubRoutes(app, {
    config: githubConfig,
    authConfig,
    client: githubClient,
    authStore: integrationAuthStore,
    openRouter: deps.openRouter,
    modelRegistry,
    modelCapabilitiesConfig,
    env: deps.env,
    actionStore: githubActionStore,
    rateLimiter,
    runtimeJournal
  });
  chatRoutes(app, {
    env: deps.env,
    openRouter: deps.openRouter,
    modelRegistry,
    modelCapabilitiesConfig,
    authConfig,
    rateLimiter,
    runtimeObservability,
    runtimeJournal
  });

  return app;
}
