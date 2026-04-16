import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  GitHubChangeProposalRequestSchema,
  buildGitHubErrorResponse,
  githubErrorStatus,
  type GitHubErrorCode,
  GitHubContextRequestSchema,
  GitHubPlanIdSchema,
  GitHubRepoFileQuerySchema,
  GitHubRepoPathParamsSchema,
  GitHubRepoTreeQuerySchema,
  type GitHubChangePlan,
  type GitHubFileContent,
  type GitHubFileTree,
  type GitHubRepoSummary
} from "../lib/github-contract.js";
import { GitHubClientError, type GitHubClient } from "../lib/github-client.js";
import { createGitHubContextBuilder } from "../lib/github-context-builder.js";
import { createGitHubActionStore, type GitHubActionStore } from "../lib/github-action-store.js";
import { createGitHubProposalPlanner } from "../lib/github-plan-builder.js";
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
      const context = await contextBuilder.buildContext(parsedBody.data);

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
      const planId = `plan_${randomUUID()}`;
      const context = await contextBuilder.buildContext({
        repo: parsedBody.data.repo,
        question: parsedBody.data.question ?? parsedBody.data.objective,
        ref: parsedBody.data.baseBranch ?? parsedBody.data.ref,
        selectedPaths: parsedBody.data.selectedPaths
      });
      const createdAt = new Date().toISOString();
      const plan = await proposalPlanner.buildPlan({
        planId,
        request: parsedBody.data,
        context,
        createdAt
      });
      const currentSummary = await deps.client.readRepositorySummary(plan.repo.owner, plan.repo.repo);

      if (!isFreshGitHubPlan(currentSummary, plan)) {
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
        ...plan,
        request: parsedBody.data,
        context
      });

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
