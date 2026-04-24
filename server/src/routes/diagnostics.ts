import type { FastifyInstance } from "fastify";
import type { AppEnv } from "../lib/env.js";
import type { GitHubActionStoreSelection } from "../lib/github-action-store.js";
import type { GitHubConfig } from "../lib/github-env.js";
import type { MatrixConfig } from "../lib/matrix-env.js";
import type { ModelRegistry } from "../lib/model-policy.js";
import type { AppRateLimiter } from "../lib/rate-limit.js";
import type { RuntimeJournal } from "../lib/runtime-journal.js";
import type { RuntimeObservability } from "../lib/runtime-observability.js";
import type { ModelCapabilitiesConfig } from "../lib/workflow-model-router.js";

type DiagnosticsRouteDependencies = {
  env: AppEnv;
  modelRegistry: ModelRegistry;
  modelCapabilitiesConfig: ModelCapabilitiesConfig;
  rateLimiter: AppRateLimiter;
  runtimeObservability: RuntimeObservability;
  githubConfig: GitHubConfig;
  matrixConfig: MatrixConfig;
  actionStoreSelection: GitHubActionStoreSelection;
  runtimeJournal: RuntimeJournal;
};

export function diagnosticsRoutes(app: FastifyInstance, deps: DiagnosticsRouteDependencies) {
  app.get("/diagnostics", async () => {
    const runtime = deps.runtimeObservability.snapshot();
    const rateLimit = deps.rateLimiter.getPublicSnapshot();
    const journal = deps.runtimeJournal.getPublicSnapshot();

    return {
      ok: true,
      service: deps.env.APP_NAME,
      runtimeMode: "local",
      diagnosticsGeneratedAt: runtime.generatedAt,
      processStartedAt: runtime.startedAt,
      uptimeMs: runtime.uptimeMs,
      models: {
        defaultPublicAlias: deps.modelRegistry.defaultModelAlias,
        publicAliases: deps.modelRegistry.getPublicRegistry().map((entry) => entry.alias)
      },
      routing: {
        mode: deps.env.MODEL_ROUTING_MODE,
        allowFallback: deps.env.ALLOW_MODEL_FALLBACK,
        failClosed: deps.env.MODEL_ROUTING_FAIL_CLOSED,
        requireBackendOwnedResolution: deps.modelCapabilitiesConfig.global_policy.require_backend_owned_model_resolution
      },
      rateLimit,
      actionStore: {
        mode: deps.actionStoreSelection.mode
      },
      github: {
        configured: deps.githubConfig.enabled,
        ready: deps.githubConfig.ready
      },
      matrix: {
        configured: deps.matrixConfig.enabled,
        ready: deps.matrixConfig.ready
      },
      journal,
      counters: runtime.counters
    };
  });
}
