import { randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  GitHubChangeProposalRequestSchema,
  buildGitHubErrorResponse,
  githubErrorStatus,
  type GitHubErrorCode,
  GitHubExecuteRequestSchema,
  GitHubContextRequestSchema,
  GitHubPlanIdSchema,
  GitHubRepoFileQuerySchema,
  GitHubRepoPathParamsSchema,
  GitHubRepoTreeQuerySchema,
  type GitHubChangePlan,
  type GitHubExecuteResult,
  type GitHubFileContent,
  type GitHubFileTree,
  type GitHubRepoSummary,
  type GitHubVerifyResult
} from "../lib/github-contract.js";
import { GitHubClientError, type GitHubClient } from "../lib/github-client.js";
import { createGitHubContextBuilder } from "../lib/github-context-builder.js";
import { createGitHubActionStore, type GitHubActionStore } from "../lib/github-action-store.js";
import { createGitHubProposalPlanner } from "../lib/github-plan-builder.js";
import { createGitHubActionExecutionService } from "../lib/github-execution.js";
import type { GitHubConfig } from "../lib/github-env.js";
import { isGitHubRepoAllowed, normalizeGitHubRepoFullName } from "../lib/github-env.js";
import { normalizeGitHubRelativePath } from "../lib/github-paths.js";
import { OpenRouterError, type OpenRouterClient } from "../lib/openrouter.js";
import type { ModelRegistry } from "../lib/model-policy.js";

type GitHubRouteDependencies = {
  config: GitHubConfig;
  client: GitHubClient;
  openRouter: OpenRouterClient;
  modelRegistry: ModelRegistry;
  actionStore?: GitHubActionStore;
};

const GITHUB_ADMIN_KEY_HEADER = "x-modelgate-admin-key";

function sendGitHubError(reply: FastifyReply, code: GitHubErrorCode, message?: string, retryAfterSeconds?: number | null) {
  return reply.status(githubErrorStatus(code)).send(
    buildGitHubErrorResponse(code, message, retryAfterSeconds === null ? undefined : retryAfterSeconds)
  );
}

function isGitHubClientError(error: unknown): error is GitHubClientError {
  return Boolean(
    error
    && typeof error === "object"
    && "name" in error
    && (error as { name?: unknown }).name === "GitHubClientError"
  );
}

function handleGitHubError(reply: FastifyReply, error: unknown) {
  if (isGitHubClientError(error)) {
    if (error.code === "invalid_request") {
      return sendGitHubError(reply, "invalid_request");
    }

    return sendGitHubError(reply, error.code, error.message, error.retryAfterSeconds);
  }

  if (error instanceof OpenRouterError) {
    if (error.status === 504) {
      return sendGitHubError(reply, "github_propose_timeout");
    }

    if (error.status === 503) {
      return sendGitHubError(reply, "github_not_configured");
    }

    if (error.status === 429) {
      return sendGitHubError(reply, "github_rate_limited");
    }

    if (error.status === 504) {
      return sendGitHubError(reply, "github_timeout");
    }

    return sendGitHubError(reply, "github_internal_error");
  }

  return sendGitHubError(reply, "github_internal_error");
}

function createGitHubProposalTimeoutError() {
  return new GitHubClientError({
    code: "github_propose_timeout",
    status: 504,
    operation: "GitHub proposal generation",
    path: "/api/github/actions/propose",
    baseUrl: "unavailable",
    message: "GitHub proposal generation timed out"
  });
}

async function runWithTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(createGitHubProposalTimeoutError());
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}

function normalizeRepoParams(requestParams: unknown) {
  const parsed = GitHubRepoPathParamsSchema.safeParse(requestParams);

  if (!parsed.success) {
    return null;
  }

  const normalized = normalizeGitHubRepoFullName(parsed.data.owner, parsed.data.repo);

  if (!normalized) {
    return null;
  }

  const [owner, repo] = normalized.split("/");

  if (!owner || !repo) {
    return null;
  }

  return {
    owner,
    repo
  };
}

async function listAllowedRepos(config: GitHubConfig, client: GitHubClient): Promise<GitHubRepoSummary[]> {
  const summaries: GitHubRepoSummary[] = [];

  for (const repo of config.allowedRepos) {
    const [owner, name] = repo.split("/");

    if (!owner || !name) {
      continue;
    }

    const summary = await client.readRepositorySummary(owner, name);
    summaries.push(summary);
  }

  return summaries;
}

function isFreshGitHubPlan(summary: GitHubRepoSummary, plan: GitHubChangePlan) {
  return summary.status === "ready"
    && summary.defaultBranch === plan.targetBranch
    && summary.defaultBranchSha === plan.baseSha;
}

function readGitHubAdminKeyHeader(request: FastifyRequest) {
  const rawValue = request.headers[GITHUB_ADMIN_KEY_HEADER];

  if (Array.isArray(rawValue)) {
    return rawValue[0] ?? null;
  }

  return typeof rawValue === "string" ? rawValue : null;
}

function sendGitHubAdminKeyError(reply: FastifyReply, code: "github_unauthorized" | "github_forbidden") {
  return sendGitHubError(reply, code);
}

function requiresGitHubAdminKey(config: GitHubConfig) {
  return Boolean(config.agentApiKey && config.agentApiKey.trim().length > 0);
}

function hasMatchingAdminKey(request: FastifyRequest, config: GitHubConfig) {
  const configuredKey = config.agentApiKey?.trim();

  if (!configuredKey) {
    return false;
  }

  const providedKey = readGitHubAdminKeyHeader(request)?.trim();

  if (!providedKey) {
    return false;
  }

  const configuredKeyBuffer = Buffer.from(configuredKey);
  const providedKeyBuffer = Buffer.from(providedKey);

  if (configuredKeyBuffer.length !== providedKeyBuffer.length) {
    return false;
  }

  return timingSafeEqual(configuredKeyBuffer, providedKeyBuffer);
}

function requireGitHubAdminKey(request: FastifyRequest, reply: FastifyReply, config: GitHubConfig) {
  if (!requiresGitHubAdminKey(config)) {
    return sendGitHubError(reply, "github_not_configured");
  }

  const providedKey = readGitHubAdminKeyHeader(request)?.trim();

  if (!providedKey) {
    return sendGitHubAdminKeyError(reply, "github_unauthorized");
  }

  if (!hasMatchingAdminKey(request, config)) {
    return sendGitHubAdminKeyError(reply, "github_forbidden");
  }

  return null;
}

export function githubRoutes(app: FastifyInstance, deps: GitHubRouteDependencies) {
  const contextBuilder = createGitHubContextBuilder({
    config: deps.config,
    client: deps.client
  });
  const proposalPlanner = createGitHubProposalPlanner({
    config: deps.config,
    client: deps.client,
    openRouter: deps.openRouter,
    modelRegistry: deps.modelRegistry
  });
  const actionStore = deps.actionStore ?? createGitHubActionStore(deps.config.planTtlMs);
  const actionExecutor = createGitHubActionExecutionService({
    config: deps.config,
    client: deps.client,
    actionStore
  });

  app.get("/api/github/repos", async (_request, reply) => {
    if (!deps.config.ready) {
      return sendGitHubError(reply, "github_not_configured");
    }

    try {
      const checkedAt = new Date().toISOString();
      const repos = await listAllowedRepos(deps.config, deps.client);

      return reply.status(200).send({
        ok: true,
        checkedAt,
        repos
      });
    } catch (error) {
      return handleGitHubError(reply, error);
    }
  });

  app.post("/api/github/context", async (request, reply) => {
    if (!deps.config.ready) {
      return sendGitHubError(reply, "github_not_configured");
    }

    const parsedBody = GitHubContextRequestSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return sendGitHubError(reply, "invalid_request");
    }

    const repoParams = normalizeRepoParams(parsedBody.data.repo);

    if (!repoParams) {
      return sendGitHubError(reply, "invalid_request");
    }

    if (!isGitHubRepoAllowed(deps.config, repoParams.owner, repoParams.repo)) {
      return sendGitHubError(reply, "github_repo_not_allowed");
    }

    try {
      const contextRequest = {
        repo: {
          owner: parsedBody.data.repo.owner,
          repo: parsedBody.data.repo.repo
        },
        question: parsedBody.data.question,
        ref: parsedBody.data.ref,
        selectedPaths: parsedBody.data.selectedPaths,
        rootPath: parsedBody.data.rootPath,
        maxFiles: parsedBody.data.maxFiles,
        maxBytes: parsedBody.data.maxBytes
      };
      const context = await contextBuilder.buildContext(contextRequest);

      return reply.status(200).send({
        ok: true,
        context
      });
    } catch (error) {
      return handleGitHubError(reply, error);
    }
  });

  app.post("/api/github/actions/propose", async (request, reply) => {
    if (!deps.config.ready) {
      return sendGitHubError(reply, "github_not_configured");
    }

    const parsedBody = GitHubChangeProposalRequestSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return sendGitHubError(reply, "invalid_request");
    }

    const repoParams = normalizeRepoParams(parsedBody.data.repo);

    if (!repoParams) {
      return sendGitHubError(reply, "invalid_request");
    }

    if (!isGitHubRepoAllowed(deps.config, repoParams.owner, repoParams.repo)) {
      return sendGitHubError(reply, "github_repo_not_allowed");
    }

    try {
      const plan = await runWithTimeout((async () => {
        const proposalRequest = {
          repo: {
            owner: parsedBody.data.repo.owner,
            repo: parsedBody.data.repo.repo
          },
          objective: parsedBody.data.objective,
          question: parsedBody.data.question,
          ref: parsedBody.data.ref,
          selectedPaths: parsedBody.data.selectedPaths,
          constraints: parsedBody.data.constraints,
          baseBranch: parsedBody.data.baseBranch
        };
        const planId = `plan_${randomUUID()}`;
        const context = await contextBuilder.buildContext({
          repo: proposalRequest.repo,
          question: proposalRequest.question ?? proposalRequest.objective,
          ref: proposalRequest.baseBranch ?? proposalRequest.ref,
          selectedPaths: proposalRequest.selectedPaths,
          maxFiles: Math.min(deps.config.maxContextFiles, 4),
          maxBytes: Math.min(deps.config.maxContextBytes, 16_384)
        });
        const createdAt = new Date().toISOString();
        const builtPlan = await proposalPlanner.buildPlan({
          planId,
          request: proposalRequest,
          context,
          createdAt
        });
        const currentSummary = await deps.client.readRepositorySummary(builtPlan.repo.owner, builtPlan.repo.repo);

        if (!isFreshGitHubPlan(currentSummary, builtPlan)) {
          throw new GitHubClientError({
            code: "github_stale_plan",
            status: 409,
            operation: "GitHub proposal generation",
            path: "/api/github/actions/propose",
            baseUrl: "unavailable",
            message: "GitHub plan is stale and must be refreshed"
          });
        }

        actionStore.createPlan({
          ...builtPlan,
          request: proposalRequest,
          context
        });

        return builtPlan;
      })(), deps.config.requestTimeoutMs);

      return reply.status(200).send({
        ok: true,
        plan
      });
    } catch (error) {
      return handleGitHubError(reply, error);
    }
  });

  app.get("/api/github/actions/:planId", async (request, reply) => {
    if (!deps.config.ready) {
      return sendGitHubError(reply, "github_not_configured");
    }

    const parsedPlanId = GitHubPlanIdSchema.safeParse(
      typeof request.params === "object" && request.params !== null
        ? (request.params as { planId?: unknown }).planId
        : undefined
    );

    if (!parsedPlanId.success) {
      return sendGitHubError(reply, "invalid_request");
    }

    const lookup = actionStore.readPlan(parsedPlanId.data);

    if (lookup.state === "missing") {
      return sendGitHubError(reply, "github_plan_not_found");
    }

    if (lookup.state === "expired") {
      return sendGitHubError(reply, "github_plan_expired");
    }

    try {
      const currentSummary = await deps.client.readRepositorySummary(lookup.plan.repo.owner, lookup.plan.repo.repo);

      if (!isFreshGitHubPlan(currentSummary, lookup.plan)) {
        return sendGitHubError(reply, "github_stale_plan");
      }

      return reply.status(200).send({
        ok: true,
        plan: {
          ...lookup.plan,
          stale: false
        }
      });
    } catch (error) {
      return handleGitHubError(reply, error);
    }
  });

  app.post("/api/github/actions/:planId/execute", async (request, reply) => {
    if (!deps.config.ready) {
      return sendGitHubError(reply, "github_not_configured");
    }

    const authError = requireGitHubAdminKey(request, reply, deps.config);

    if (authError) {
      return authError;
    }

    const parsedPlanId = GitHubPlanIdSchema.safeParse(
      typeof request.params === "object" && request.params !== null
        ? (request.params as { planId?: unknown }).planId
        : undefined
    );

    if (!parsedPlanId.success) {
      return sendGitHubError(reply, "invalid_request");
    }

    const parsedBody = GitHubExecuteRequestSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return sendGitHubError(reply, "invalid_request");
    }

    const lookup = actionStore.readPlan(parsedPlanId.data);

    if (lookup.state === "missing") {
      return sendGitHubError(reply, "github_plan_not_found");
    }

    if (lookup.state === "expired") {
      return sendGitHubError(reply, "github_plan_expired");
    }

    try {
      const execution: GitHubExecuteResult = await actionExecutor.executePlan(lookup.plan);

      return reply.status(200).send({
        ok: true,
        result: execution
      });
    } catch (error) {
      return handleGitHubError(reply, error);
    }
  });

  app.get("/api/github/actions/:planId/verify", async (request, reply) => {
    if (!deps.config.ready) {
      return sendGitHubError(reply, "github_not_configured");
    }

    const parsedPlanId = GitHubPlanIdSchema.safeParse(
      typeof request.params === "object" && request.params !== null
        ? (request.params as { planId?: unknown }).planId
        : undefined
    );

    if (!parsedPlanId.success) {
      return sendGitHubError(reply, "invalid_request");
    }

    const lookup = actionStore.readPlan(parsedPlanId.data);

    if (lookup.state === "missing") {
      return sendGitHubError(reply, "github_plan_not_found");
    }

    if (lookup.state === "expired") {
      return sendGitHubError(reply, "github_plan_expired");
    }

    try {
      const verification: GitHubVerifyResult = await actionExecutor.verifyPlan(lookup.plan);

      return reply.status(200).send({
        ok: true,
        verification
      });
    } catch (error) {
      return handleGitHubError(reply, error);
    }
  });

  app.get("/api/github/repos/:owner/:repo/tree", async (request, reply) => {
    if (!deps.config.ready) {
      return sendGitHubError(reply, "github_not_configured");
    }

    const repoParams = normalizeRepoParams(request.params);

    if (!repoParams) {
      return sendGitHubError(reply, "invalid_request");
    }

    if (!isGitHubRepoAllowed(deps.config, repoParams.owner, repoParams.repo)) {
      return sendGitHubError(reply, "github_repo_not_allowed");
    }

    const parsedQuery = GitHubRepoTreeQuerySchema.safeParse(request.query);

    if (!parsedQuery.success) {
      return sendGitHubError(reply, "invalid_request");
    }

    const normalizedPath = parsedQuery.data.path ? normalizeGitHubRelativePath(parsedQuery.data.path) : undefined;

    if (parsedQuery.data.path && !normalizedPath) {
      return sendGitHubError(reply, "invalid_request");
    }

    try {
      const tree: GitHubFileTree = await deps.client.readRepositoryTree(repoParams.owner, repoParams.repo, {
        ...parsedQuery.data,
        path: normalizedPath ?? undefined
      });

      return reply.status(200).send({
        ok: true,
        tree
      });
    } catch (error) {
      return handleGitHubError(reply, error);
    }
  });

  app.get("/api/github/repos/:owner/:repo/file", async (request, reply) => {
    if (!deps.config.ready) {
      return sendGitHubError(reply, "github_not_configured");
    }

    const repoParams = normalizeRepoParams(request.params);

    if (!repoParams) {
      return sendGitHubError(reply, "invalid_request");
    }

    if (!isGitHubRepoAllowed(deps.config, repoParams.owner, repoParams.repo)) {
      return sendGitHubError(reply, "github_repo_not_allowed");
    }

    const parsedQuery = GitHubRepoFileQuerySchema.safeParse(request.query);

    if (!parsedQuery.success) {
      return sendGitHubError(reply, "invalid_request");
    }

    const normalizedPath = normalizeGitHubRelativePath(parsedQuery.data.path);

    if (!normalizedPath) {
      return sendGitHubError(reply, "invalid_request");
    }

    try {
      const file: GitHubFileContent = await deps.client.readRepositoryFile(repoParams.owner, repoParams.repo, {
        ...parsedQuery.data,
        path: normalizedPath
      });

      return reply.status(200).send({
        ok: true,
        file
      });
    } catch (error) {
      return handleGitHubError(reply, error);
    }
  });
}
