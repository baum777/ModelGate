import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppEnv } from "../lib/env.js";
import type { AuthConfig } from "../lib/auth.js";
import type { GitHubConfig } from "../lib/github-env.js";
import type { MatrixConfig } from "../lib/matrix-env.js";
import type { ModelRegistry } from "../lib/model-policy.js";

type DiagnosticsDependencies = {
  env: AppEnv;
  authConfig: AuthConfig;
  githubConfig: GitHubConfig;
  matrixConfig: MatrixConfig;
  modelRegistry: ModelRegistry;
};

function unauthorized(reply: FastifyReply) {
  return reply.status(401).send({
    ok: false,
    error: {
      code: "diagnostics_auth_required",
      message: "Diagnostics require X-ModelGate-Admin-Key"
    }
  });
}

function hasDiagnosticsAccess(request: FastifyRequest, authConfig: AuthConfig) {
  const header = request.headers["x-modelgate-admin-key"];
  const adminKey = Array.isArray(header) ? header[0] : header;

  return Boolean(
    authConfig.ready
    && authConfig.adminPassword
    && typeof adminKey === "string"
    && adminKey === authConfig.adminPassword
  );
}

export function diagnosticsRoutes(app: FastifyInstance, deps: DiagnosticsDependencies) {
  app.get("/diagnostics", async (request, reply) => {
    if (!hasDiagnosticsAccess(request, deps.authConfig)) {
      return unauthorized(reply);
    }

    const publicAliases = deps.modelRegistry.publicModels.map((model) => model.alias);
    const defaultAlias = deps.modelRegistry.defaultModelAlias;

    return reply.status(200).send({
      backend: {
        status: "ok",
        version: deps.env.APP_NAME,
        mode: deps.env.MODEL_ROUTING_MODE === "policy" ? "policy" : "rules_first"
      },
      routing: {
        activePolicy: deps.env.MODEL_ROUTING_MODE === "policy" ? "policy" : "rules_first",
        failClosed: deps.env.MODEL_ROUTING_FAIL_CLOSED,
        allowFallback: deps.env.ALLOW_MODEL_FALLBACK,
        freeOnly: true,
        logEnabled: deps.env.MODEL_ROUTING_LOG_ENABLED,
        taskAliasMap: {
          chat: defaultAlias,
          coding: defaultAlias,
          repo_review: defaultAlias,
          deep_reason: defaultAlias,
          architecture: defaultAlias,
          matrix_analyze: defaultAlias
        },
        fallbackChain: publicAliases
      },
      github: {
        status: deps.githubConfig.ready ? "ok" : deps.githubConfig.enabled ? "error" : "missing",
        repoCount: deps.githubConfig.allowedRepos.length,
        activeRepos: deps.githubConfig.allowedRepos,
        adminKeyConfigured: deps.authConfig.ready,
        lastContextBuild: null
      },
      matrix: {
        status: deps.matrixConfig.ready ? "ok" : deps.matrixConfig.enabled ? "error" : "token_required",
        enabled: deps.matrixConfig.enabled,
        required: deps.matrixConfig.required,
        failClosed: deps.env.MATRIX_FAIL_CLOSED,
        expectedUserConfigured: Boolean(deps.matrixConfig.expectedUserId),
        allowedActions: deps.env.MATRIX_ALLOWED_ACTION_TYPES,
        homeserverConfigured: Boolean(deps.matrixConfig.baseUrl)
      }
    });
  });
}
