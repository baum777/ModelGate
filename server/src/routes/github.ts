import { randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppEnv } from "../lib/env.js";
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
import type { GitHubPullRequestSummary, GitHubRepositoryReference } from "../lib/github-client.js";
import { createGitHubContextBuilder } from "../lib/github-context-builder.js";
import { createGitHubActionStore, type GitHubActionStore, type GitHubActionStoreEntry } from "../lib/github-action-store.js";
import { createGitHubProposalPlanner } from "../lib/github-plan-builder.js";
import { createGitHubActionExecutionService } from "../lib/github-execution.js";
import type { GitHubConfig } from "../lib/github-env.js";
import { isGitHubRepoAllowed, normalizeGitHubRepoFullName } from "../lib/github-env.js";
import { createGitHubAppAuthClient, GitHubAppAuthError } from "../lib/github-app-auth.js";
import type { IntegrationAuthStore } from "../lib/integration-auth-store.js";
import { normalizeGitHubRelativePath } from "../lib/github-paths.js";
import { OpenRouterError, type OpenRouterClient } from "../lib/openrouter.js";
import type { AuthConfig } from "../lib/auth.js";
import type { ModelRegistry } from "../lib/model-policy.js";
import type { AppRateLimiter } from "../lib/rate-limit.js";
import type { RuntimeJournal } from "../lib/runtime-journal.js";
import type { ModelCapabilitiesConfig } from "../lib/workflow-model-router.js";

type GitHubRouteDependencies = {
  env: AppEnv;
  config: GitHubConfig;
  authConfig: AuthConfig;
  client: GitHubClient;
  openRouter: OpenRouterClient;
  modelRegistry: ModelRegistry;
  modelCapabilitiesConfig: ModelCapabilitiesConfig;
  authStore: IntegrationAuthStore;
  actionStore?: GitHubActionStore;
  appAuthFetch?: typeof fetch;
  rateLimiter: AppRateLimiter;
  runtimeJournal: RuntimeJournal;
};

const GITHUB_ADMIN_KEY_HEADER = "x-mosaicstacked-admin-key";
const INTEGRATION_SESSION_COOKIE = "mosaicstacked_integration_session";
const DEFAULT_SMOKE_BRANCH_PREFIX = "mosaicstacked/github-smoke";
type GitHubCredentialSource = "user_connected" | "instance_config";
type GitHubResolvedClient = {
  client: GitHubClient;
  credentialSource: GitHubCredentialSource;
};

function sendGitHubError(reply: FastifyReply, code: GitHubErrorCode, message?: string, retryAfterSeconds?: number | null) {
  if (typeof retryAfterSeconds === "number" && retryAfterSeconds > 0) {
    reply.header("Retry-After", String(Math.ceil(retryAfterSeconds)));
  }

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

function isGitHubAppAuthError(error: unknown): error is GitHubAppAuthError {
  return Boolean(
    error
    && typeof error === "object"
    && "name" in error
    && (error as { name?: unknown }).name === "GitHubAppAuthError"
  );
}

function handleGitHubError(reply: FastifyReply, error: unknown) {
  if (isGitHubAppAuthError(error)) {
    if (error.code === "not_configured") {
      return sendGitHubError(reply, "github_not_configured");
    }

    if (error.code === "invalid_installation_id") {
      return sendGitHubError(reply, "invalid_request");
    }

    if (error.code === "github_unauthorized") {
      return sendGitHubError(reply, "github_unauthorized");
    }

    if (error.code === "github_forbidden") {
      return sendGitHubError(reply, "github_forbidden");
    }

    if (error.code === "github_timeout") {
      return sendGitHubError(reply, "github_timeout");
    }

    if (error.code === "github_rate_limited") {
      return sendGitHubError(reply, "github_rate_limited");
    }

    if (error.code === "github_malformed_response") {
      return sendGitHubError(reply, "github_malformed_response");
    }

    return sendGitHubError(reply, "github_internal_error");
  }

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

function buildVerificationBranchPrefixes(config: GitHubConfig) {
  const smokePrefix = config.smokeTargetBranch?.trim() || DEFAULT_SMOKE_BRANCH_PREFIX;
  const standardPrefix = config.branchPrefix.trim();

  return [smokePrefix, standardPrefix]
    .filter((value): value is string => value.length > 0)
    .filter((value, index, values) => values.indexOf(value) === index);
}

function buildRecoveredPlanEntry(options: {
  planId: string;
  repo: GitHubRepoSummary;
  branchName: string;
  targetBranch: string;
  branchSha: string;
  prNumber: number;
  prUrl: string;
  createdAt: string;
  planTtlMs: number;
  smokeMode: boolean;
}): Omit<GitHubActionStoreEntry, "createdAtMs" | "expiresAtMs"> {
  const generatedAt = options.createdAt;

  return {
    planId: options.planId,
    repo: options.repo,
    baseRef: options.repo.defaultBranch,
    baseSha: options.repo.defaultBranchSha ?? options.branchSha,
    branchName: options.branchName,
    targetBranch: options.targetBranch,
    status: "executed",
    stale: false,
    requiresApproval: true,
    summary: `Recovered GitHub plan ${options.planId}`,
    rationale: "Recovered from GitHub state after the in-memory plan store was not available.",
    riskLevel: "low_surface",
    citations: [],
    diff: [],
    generatedAt,
    expiresAt: new Date(Date.parse(generatedAt) + options.planTtlMs).toISOString(),
    request: {
      repo: {
        owner: options.repo.owner,
        repo: options.repo.repo
      },
      objective: `Recovered GitHub plan ${options.planId}`,
      baseBranch: options.repo.defaultBranch,
      targetBranch: options.smokeMode ? (options.branchName.slice(0, options.branchName.lastIndexOf("/")) || DEFAULT_SMOKE_BRANCH_PREFIX) : undefined,
      mode: options.smokeMode ? "smoke" : undefined
    },
    context: {
      repo: options.repo,
      ref: options.repo.defaultBranch,
      baseSha: options.repo.defaultBranchSha ?? options.branchSha,
      question: "Recovered GitHub verification plan",
      files: [],
      citations: [],
      tokenBudget: {
        maxTokens: 0,
        usedTokens: 0,
        truncated: false
      },
      warnings: ["Recovered verification state from GitHub because the in-memory plan store was unavailable."],
      generatedAt
    },
    execution: {
      planId: options.planId,
      status: "executed",
      branchName: options.branchName,
      baseSha: options.repo.defaultBranchSha ?? options.branchSha,
      headSha: options.branchSha,
      commitSha: options.branchSha,
      prNumber: options.prNumber,
      prUrl: options.prUrl,
      targetBranch: options.targetBranch,
      executedAt: generatedAt
    }
  };
}

function buildRouteVerificationFreshnessReason(summary: GitHubRepoSummary, plan: GitHubActionStoreEntry) {
  if (summary.status !== "ready") {
    return `Repository status is ${summary.status}`;
  }

  if (summary.defaultBranch !== plan.targetBranch) {
    return `Target branch changed from ${plan.targetBranch} to ${summary.defaultBranch}`;
  }

  if (summary.defaultBranchSha !== plan.baseSha) {
    return "Base branch changed after approval";
  }

  return null;
}

async function readRouteVerificationBranchReference(
  client: GitHubClient,
  plan: GitHubActionStoreEntry
): Promise<GitHubRepositoryReference | null> {
  try {
    return await client.readRepositoryReference(plan.repo.owner, plan.repo.repo, `heads/${plan.branchName}`);
  } catch (error) {
    if (isGitHubClientError(error) && error.code === "github_repo_not_found") {
      return null;
    }

    throw error;
  }
}

async function findRouteVerificationPullRequest(
  client: GitHubClient,
  plan: GitHubActionStoreEntry
): Promise<GitHubPullRequestSummary | null> {
  const pulls = await client.listPullRequests(plan.repo.owner, plan.repo.repo, {
    state: "all",
    head: `${plan.repo.owner}:${plan.branchName}`,
    base: plan.targetBranch,
    perPage: 10,
    page: 1
  });

  if (pulls.length === 0) {
    return null;
  }

  const exactMatch = pulls.find((pull) => pull.headRef === plan.branchName && pull.baseRef === plan.targetBranch);

  return exactMatch ?? pulls[0] ?? null;
}

async function verifyRecoveredRoutePlan(plan: GitHubActionStoreEntry, client: GitHubClient) {
  const summary = await client.readRepositorySummary(plan.repo.owner, plan.repo.repo);
  const freshnessReason = buildRouteVerificationFreshnessReason(summary, plan);
  const branchReference = await readRouteVerificationBranchReference(client, plan);
  const actualCommitSha = branchReference?.sha ?? null;
  const pullRequest = await findRouteVerificationPullRequest(client, plan);

  if (!plan.execution) {
    return {
      planId: plan.planId,
      status: "pending" as const,
      checkedAt: new Date().toISOString(),
      branchName: plan.branchName,
      targetBranch: plan.targetBranch,
      expectedBaseSha: plan.baseSha,
      actualBaseSha: summary.defaultBranchSha,
      expectedCommitSha: null,
      actualCommitSha,
      prNumber: pullRequest?.number ?? null,
      prUrl: pullRequest?.htmlUrl ?? null,
      mismatchReasons: ["The plan has not been executed yet"]
    };
  }

  if (freshnessReason) {
    return {
      planId: plan.planId,
      status: "mismatch" as const,
      checkedAt: new Date().toISOString(),
      branchName: plan.branchName,
      targetBranch: plan.targetBranch,
      expectedBaseSha: plan.baseSha,
      actualBaseSha: summary.defaultBranchSha,
      expectedCommitSha: plan.execution.commitSha,
      actualCommitSha,
      prNumber: pullRequest?.number ?? null,
      prUrl: pullRequest?.htmlUrl ?? null,
      mismatchReasons: [freshnessReason]
    };
  }

  if (!branchReference) {
    if (pullRequest && pullRequest.headSha === plan.execution.commitSha) {
      return {
        planId: plan.planId,
        status: "verified" as const,
        checkedAt: new Date().toISOString(),
        branchName: plan.branchName,
        targetBranch: plan.targetBranch,
        expectedBaseSha: plan.baseSha,
        actualBaseSha: summary.defaultBranchSha,
        expectedCommitSha: plan.execution.commitSha,
        actualCommitSha: pullRequest.headSha,
        prNumber: pullRequest.number,
        prUrl: pullRequest.htmlUrl,
        mismatchReasons: []
      };
    }

    return {
      planId: plan.planId,
      status: "pending" as const,
      checkedAt: new Date().toISOString(),
      branchName: plan.branchName,
      targetBranch: plan.targetBranch,
      expectedBaseSha: plan.baseSha,
      actualBaseSha: summary.defaultBranchSha,
      expectedCommitSha: plan.execution.commitSha,
      actualCommitSha,
      prNumber: pullRequest?.number ?? null,
      prUrl: pullRequest?.htmlUrl ?? null,
      mismatchReasons: ["The branch or pull request is not visible yet"]
    };
  }

  if (branchReference.sha !== plan.execution.commitSha) {
    return {
      planId: plan.planId,
      status: "mismatch" as const,
      checkedAt: new Date().toISOString(),
      branchName: plan.branchName,
      targetBranch: plan.targetBranch,
      expectedBaseSha: plan.baseSha,
      actualBaseSha: summary.defaultBranchSha,
      expectedCommitSha: plan.execution.commitSha,
      actualCommitSha: branchReference.sha,
      prNumber: pullRequest?.number ?? null,
      prUrl: pullRequest?.htmlUrl ?? null,
      mismatchReasons: [
        `Branch head does not match the approved commit for heads/${plan.branchName}`
      ]
    };
  }

  if (!pullRequest) {
    return {
      planId: plan.planId,
      status: "verified" as const,
      checkedAt: new Date().toISOString(),
      branchName: plan.branchName,
      targetBranch: plan.targetBranch,
      expectedBaseSha: plan.baseSha,
      actualBaseSha: summary.defaultBranchSha,
      expectedCommitSha: plan.execution.commitSha,
      actualCommitSha: branchReference.sha,
      prNumber: null,
      prUrl: null,
      mismatchReasons: []
    };
  }

  if (pullRequest.headSha !== plan.execution.commitSha || pullRequest.baseRef !== plan.targetBranch) {
    return {
      planId: plan.planId,
      status: "mismatch" as const,
      checkedAt: new Date().toISOString(),
      branchName: plan.branchName,
      targetBranch: plan.targetBranch,
      expectedBaseSha: plan.baseSha,
      actualBaseSha: summary.defaultBranchSha,
      expectedCommitSha: plan.execution.commitSha,
      actualCommitSha: branchReference.sha,
      prNumber: pullRequest.number,
      prUrl: pullRequest.htmlUrl,
      mismatchReasons: ["Pull request does not point to the approved branch and target branch"]
    };
  }

  return {
    planId: plan.planId,
    status: "verified" as const,
    checkedAt: new Date().toISOString(),
    branchName: plan.branchName,
    targetBranch: plan.targetBranch,
    expectedBaseSha: plan.baseSha,
    actualBaseSha: summary.defaultBranchSha,
    expectedCommitSha: plan.execution.commitSha,
    actualCommitSha: branchReference.sha,
    prNumber: pullRequest.number,
    prUrl: pullRequest.htmlUrl,
    mismatchReasons: []
  };
}

async function recoverPlanForVerification(
  planId: string,
  config: GitHubConfig,
  client: GitHubClient,
  actionStore: GitHubActionStore
) {
  const repos = await listAllowedRepos(config, client);
  const branchPrefixes = buildVerificationBranchPrefixes(config);

  for (const repo of repos) {
    for (const branchPrefix of branchPrefixes) {
      const branchName = `${branchPrefix}/${planId}`;

      try {
        let branchSha: string | null = null;
        let pullRequestNumber = 0;
        let pullRequestUrl = "";

        try {
          const branchReference = await client.readRepositoryReference(repo.owner, repo.repo, `heads/${branchName}`);

          branchSha = branchReference.sha;
        } catch (error) {
          if (!(isGitHubClientError(error) && error.code === "github_repo_not_found")) {
            throw error;
          }
        }

        const pullRequests = await client.listPullRequests(repo.owner, repo.repo, {
          state: "all",
          head: `${repo.owner}:${branchName}`,
          base: repo.defaultBranch,
          perPage: 10
        });
        const pullRequest = pullRequests.find((entry) => entry.headRef === branchName) ?? pullRequests[0] ?? null;

        if (pullRequest) {
          branchSha = pullRequest.headSha;
          pullRequestNumber = pullRequest.number;
          pullRequestUrl = pullRequest.htmlUrl;
        }

        if (!branchSha) {
          continue;
        }

        return actionStore.createPlan(
          buildRecoveredPlanEntry({
            planId,
            repo,
            branchName,
            targetBranch: repo.defaultBranch,
            branchSha,
            prNumber: pullRequestNumber,
            prUrl: pullRequestUrl,
            createdAt: new Date().toISOString(),
            planTtlMs: config.planTtlMs,
            smokeMode: branchPrefix !== config.branchPrefix
          })
        );
      } catch (error) {
        if (isGitHubClientError(error) && error.code === "github_repo_not_found") {
          continue;
        }

        throw error;
      }
    }
  }

  return null;
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

function readIntegrationSessionCookie(request: FastifyRequest) {
  const cookieHeader = Array.isArray(request.headers.cookie)
    ? request.headers.cookie[0]
    : request.headers.cookie;

  if (!cookieHeader) {
    return null;
  }

  for (const segment of cookieHeader.split(";")) {
    const trimmed = segment.trim();

    if (!trimmed.startsWith(`${INTEGRATION_SESSION_COOKIE}=`)) {
      continue;
    }

    try {
      return decodeURIComponent(trimmed.slice(INTEGRATION_SESSION_COOKIE.length + 1));
    } catch {
      return null;
    }
  }

  return null;
}

function parseInstallationId(raw: unknown) {
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) {
    return raw;
  }

  if (typeof raw !== "string") {
    return null;
  }

  const parsed = Number.parseInt(raw.trim(), 10);

  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

async function resolveRequestGitHubClient(
  request: FastifyRequest,
  deps: GitHubRouteDependencies,
  appAuth: ReturnType<typeof createGitHubAppAuthClient>
): Promise<GitHubResolvedClient | null> {
  const sessionId = readIntegrationSessionCookie(request);

  if (sessionId) {
    const credential = deps.authStore.readCredential(sessionId, "github");
    const kind = typeof credential?.kind === "string" ? credential.kind.trim() : "";
    const installationId = parseInstallationId((credential as Record<string, unknown> | null)?.installationId ?? null);

    if (kind === "github_app_installation" && installationId) {
      const accessToken = deps.config.installationTokenOverride
        ? deps.config.installationTokenOverride
        : await appAuth.getInstallationToken(installationId);
      return {
        client: deps.client.withAccessToken(accessToken),
        credentialSource: "user_connected"
      };
    }
  }

  if (deps.config.instanceReady && deps.config.installationId) {
    const accessToken = deps.config.installationTokenOverride
      ? deps.config.installationTokenOverride
      : await appAuth.getInstallationToken(deps.config.installationId);
    return {
      client: deps.client.withAccessToken(accessToken),
      credentialSource: "instance_config"
    };
  }

  return null;
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
  const actionStore = deps.actionStore ?? createGitHubActionStore(deps.config.planTtlMs);
  const appAuth = createGitHubAppAuthClient({
    config: deps.config,
    fetchImpl: deps.appAuthFetch
  });

  app.get("/api/github/repos", async (_request, reply) => {
    try {
      const resolvedClient = await resolveRequestGitHubClient(_request, deps, appAuth);

      if (!resolvedClient) {
        return sendGitHubError(reply, "github_not_configured");
      }

      const checkedAt = new Date().toISOString();
      const repos = await listAllowedRepos(deps.config, resolvedClient.client);

      return reply.status(200).send({
        ok: true,
        checkedAt,
        repos,
        credentialSource: resolvedClient.credentialSource
      });
    } catch (error) {
      return handleGitHubError(reply, error);
    }
  });

  app.post("/api/github/context", async (request, reply) => {
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
      const resolvedClient = await resolveRequestGitHubClient(request, deps, appAuth);

      if (!resolvedClient) {
        return sendGitHubError(reply, "github_not_configured");
      }

      const contextBuilder = createGitHubContextBuilder({
        config: deps.config,
        client: resolvedClient.client
      });
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
        context,
        credentialSource: resolvedClient.credentialSource
      });
    } catch (error) {
      return handleGitHubError(reply, error);
    }
  });

  app.post("/api/github/actions/propose", async (request, reply) => {
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

    const limit = deps.rateLimiter.check("github_propose", request, deps.authConfig);

    if (!limit.allowed) {
      return sendGitHubError(reply, "github_rate_limited", undefined, limit.retryAfterSeconds);
    }

    try {
      const resolvedClient = await resolveRequestGitHubClient(request, deps, appAuth);

      if (!resolvedClient) {
        return sendGitHubError(reply, "github_not_configured");
      }

      const proposalPlanner = createGitHubProposalPlanner({
        env: deps.env,
        config: deps.config,
        client: resolvedClient.client,
        openRouter: deps.openRouter,
        modelRegistry: deps.modelRegistry,
        modelCapabilities: deps.modelCapabilitiesConfig
      });
      const contextBuilder = createGitHubContextBuilder({
        config: deps.config,
        client: resolvedClient.client
      });
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
          baseBranch: parsedBody.data.baseBranch,
          targetBranch: parsedBody.data.targetBranch,
          mode: parsedBody.data.mode,
          intent: parsedBody.data.intent
        };
        const planId = `plan_${randomUUID()}`;
        const smokeMode = proposalRequest.mode === "smoke";
        const context = await (smokeMode
          ? (() => {
                const repoFullName = `${proposalRequest.repo.owner}/${proposalRequest.repo.repo}`.toLowerCase();
                const baseRef = proposalRequest.baseBranch ?? proposalRequest.ref ?? "main";
              return Promise.all([
                resolvedClient.client.readRepositorySummary(proposalRequest.repo.owner, proposalRequest.repo.repo),
                resolvedClient.client.readRepositoryCommit(proposalRequest.repo.owner, proposalRequest.repo.repo, baseRef)
              ]).then(async ([repoSummary, baseCommit]) => {
                const smokePath = "docs/mosaicstacked-smoke.md";
                const files: Array<{
                  path: string;
                  sha: string;
                  excerpt: string;
                  citations: never[];
                  truncated: boolean;
                }> = [];

                try {
                  const file = await resolvedClient.client.readRepositoryFile(proposalRequest.repo.owner, proposalRequest.repo.repo, {
                    ref: baseRef,
                    path: smokePath
                  });

                  if (!file.binary && !file.truncated) {
                    files.push({
                      path: file.path,
                      sha: file.sha,
                      excerpt: file.content.slice(0, 512),
                      citations: [],
                      truncated: file.truncated
                    });
                  }
                } catch (error) {
                  if (!(error instanceof GitHubClientError && error.code === "github_file_not_found")) {
                    throw error;
                  }
                }

                return {
                  repo: repoSummary,
                  ref: baseRef,
                  baseSha: baseCommit.sha,
                  question: proposalRequest.question ?? proposalRequest.objective,
                  files,
                  citations: [],
                  tokenBudget: {
                    maxTokens: 0,
                    usedTokens: 0,
                    truncated: false
                  },
                  warnings: [
                    `Smoke proposal context for ${repoFullName} is intentionally minimal`
                  ],
                  generatedAt: new Date().toISOString()
                };
              });
            })()
          : contextBuilder.buildContext({
              repo: proposalRequest.repo,
              question: proposalRequest.question ?? proposalRequest.objective,
              ref: proposalRequest.baseBranch ?? proposalRequest.ref,
              selectedPaths: proposalRequest.selectedPaths,
              maxFiles: Math.min(deps.config.maxContextFiles, 4),
              maxBytes: Math.min(deps.config.maxContextBytes, 16_384)
            }));
        const createdAt = new Date().toISOString();
        const builtPlan = await proposalPlanner.buildPlan({
          planId,
          request: proposalRequest,
          context,
          createdAt
        });
        const currentSummary = await resolvedClient.client.readRepositorySummary(builtPlan.repo.owner, builtPlan.repo.repo);

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
        deps.runtimeJournal.append({
          source: "github",
          eventType: "github_proposal_created",
          authorityDomain: "github",
          severity: "info",
          outcome: "accepted",
          summary: "GitHub proposal created",
          planId: builtPlan.planId,
          modelRouteSummary: builtPlan.routingMetadata
            ? {
                selectedAlias: builtPlan.routingMetadata.selectedModel,
                workflowRole: builtPlan.routingMetadata.workflowRole,
                fallbackUsed: builtPlan.routingMetadata.fallbackUsed
              }
            : null,
          safeMetadata: {
            repo: builtPlan.repo.fullName,
            targetBranch: builtPlan.targetBranch,
            mode: proposalRequest.mode ?? "standard"
          }
        });

        return builtPlan;
      })(), deps.config.requestTimeoutMs);

      return reply.status(200).send({
        ok: true,
        plan,
        credentialSource: resolvedClient.credentialSource
      });
    } catch (error) {
      return handleGitHubError(reply, error);
    }
  });

  app.get("/api/github/actions/:planId", async (request, reply) => {
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
      const resolvedClient = await resolveRequestGitHubClient(request, deps, appAuth);

      if (!resolvedClient) {
        return sendGitHubError(reply, "github_not_configured");
      }

      const currentSummary = await resolvedClient.client.readRepositorySummary(lookup.plan.repo.owner, lookup.plan.repo.repo);

      if (!isFreshGitHubPlan(currentSummary, lookup.plan)) {
        return sendGitHubError(reply, "github_stale_plan");
      }

      return reply.status(200).send({
        ok: true,
        plan: {
          ...lookup.plan,
          stale: false
        },
        credentialSource: resolvedClient.credentialSource
      });
    } catch (error) {
      return handleGitHubError(reply, error);
    }
  });

  app.post("/api/github/actions/:planId/execute", async (request, reply) => {
    let resolvedClient: GitHubResolvedClient | null;
    try {
      resolvedClient = await resolveRequestGitHubClient(request, deps, appAuth);
    } catch (error) {
      return handleGitHubError(reply, error);
    }

    if (!resolvedClient) {
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

    const limit = deps.rateLimiter.check("github_execute", request, deps.authConfig);

    if (!limit.allowed) {
      return sendGitHubError(reply, "github_rate_limited", undefined, limit.retryAfterSeconds);
    }

    const lookup = actionStore.readPlan(parsedPlanId.data);

    if (lookup.state === "missing") {
      return sendGitHubError(reply, "github_plan_not_found");
    }

    if (lookup.state === "expired") {
      return sendGitHubError(reply, "github_plan_expired");
    }

    try {
      const actionExecutor = createGitHubActionExecutionService({
        config: deps.config,
        client: resolvedClient.client,
        actionStore
      });
      deps.runtimeJournal.append({
        source: "github",
        eventType: "github_execute_attempted",
        authorityDomain: "github",
        severity: "info",
        outcome: "observed",
        planId: lookup.plan.planId,
        summary: "GitHub execute attempted",
        safeMetadata: {
          repo: lookup.plan.repo.fullName,
          targetBranch: lookup.plan.targetBranch
        }
      });
      const execution: GitHubExecuteResult = await actionExecutor.executePlan(lookup.plan);
      deps.runtimeJournal.append({
        source: "github",
        eventType: "github_execute_completed",
        authorityDomain: "github",
        severity: "info",
        outcome: "executed",
        planId: execution.planId,
        executionId: execution.commitSha,
        summary: "GitHub execute completed",
        safeMetadata: {
          branchName: execution.branchName,
          targetBranch: execution.targetBranch,
          prNumber: execution.prNumber
        }
      });

      return reply.status(200).send({
        ok: true,
        result: execution,
        credentialSource: resolvedClient.credentialSource
      });
    } catch (error) {
      deps.runtimeJournal.append({
        source: "github",
        eventType: "github_execute_failed",
        authorityDomain: "github",
        severity: "error",
        outcome: "failed",
        planId: lookup.plan.planId,
        summary: "GitHub execute failed"
      });
      return handleGitHubError(reply, error);
    }
  });

  app.get("/api/github/actions/:planId/verify", async (request, reply) => {
    let resolvedClient: GitHubResolvedClient | null;
    try {
      resolvedClient = await resolveRequestGitHubClient(request, deps, appAuth);
    } catch (error) {
      return handleGitHubError(reply, error);
    }

    if (!resolvedClient) {
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

    let lookup = actionStore.readPlan(parsedPlanId.data);
    let recoveredFromGitHub = false;

    if (lookup.state === "missing") {
      const recoveredPlan = await recoverPlanForVerification(parsedPlanId.data, deps.config, resolvedClient.client, actionStore);

      if (recoveredPlan) {
        recoveredFromGitHub = true;
        lookup = actionStore.readPlan(parsedPlanId.data);
      }
    }

    if (lookup.state === "missing") {
      return sendGitHubError(reply, "github_plan_not_found");
    }

    if (lookup.state === "expired") {
      return sendGitHubError(reply, "github_plan_expired");
    }

    if (recoveredFromGitHub) {
      try {
        const verification = await verifyRecoveredRoutePlan(lookup.plan, resolvedClient.client);
        deps.runtimeJournal.append({
          source: "github",
          eventType: "github_verify_result",
          authorityDomain: "github",
          severity: verification.status === "mismatch" ? "warning" : "info",
          outcome: verification.status === "verified" ? "verified" : verification.status === "mismatch" ? "unverifiable" : "observed",
          planId: verification.planId,
          verificationId: verification.checkedAt,
          summary: `GitHub verify ${verification.status}`,
          safeMetadata: {
            branchName: verification.branchName,
            targetBranch: verification.targetBranch
          }
        });

        return reply.status(200).send({
          ok: true,
          verification,
          credentialSource: resolvedClient.credentialSource
        });
      } catch (error) {
        return handleGitHubError(reply, error);
      }
    }

    try {
      const actionExecutor = createGitHubActionExecutionService({
        config: deps.config,
        client: resolvedClient.client,
        actionStore
      });
      const verification: GitHubVerifyResult = await actionExecutor.verifyPlan(lookup.plan);
      deps.runtimeJournal.append({
        source: "github",
        eventType: "github_verify_result",
        authorityDomain: "github",
        severity: verification.status === "mismatch" ? "warning" : "info",
        outcome: verification.status === "verified" ? "verified" : verification.status === "mismatch" ? "unverifiable" : "observed",
        planId: verification.planId,
        verificationId: verification.checkedAt,
        summary: `GitHub verify ${verification.status}`,
        safeMetadata: {
          branchName: verification.branchName,
          targetBranch: verification.targetBranch
        }
      });

      return reply.status(200).send({
        ok: true,
        verification,
        credentialSource: resolvedClient.credentialSource
      });
    } catch (error) {
      return handleGitHubError(reply, error);
    }
  });

  app.get("/api/github/repos/:owner/:repo/tree", async (request, reply) => {
    let resolvedClient: GitHubResolvedClient | null;
    try {
      resolvedClient = await resolveRequestGitHubClient(request, deps, appAuth);
    } catch (error) {
      return handleGitHubError(reply, error);
    }

    if (!resolvedClient) {
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
      const tree: GitHubFileTree = await resolvedClient.client.readRepositoryTree(repoParams.owner, repoParams.repo, {
        ...parsedQuery.data,
        path: normalizedPath ?? undefined
      });

      return reply.status(200).send({
        ok: true,
        tree,
        credentialSource: resolvedClient.credentialSource
      });
    } catch (error) {
      return handleGitHubError(reply, error);
    }
  });

  app.get("/api/github/repos/:owner/:repo/file", async (request, reply) => {
    let resolvedClient: GitHubResolvedClient | null;
    try {
      resolvedClient = await resolveRequestGitHubClient(request, deps, appAuth);
    } catch (error) {
      return handleGitHubError(reply, error);
    }

    if (!resolvedClient) {
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
      const file: GitHubFileContent = await resolvedClient.client.readRepositoryFile(repoParams.owner, repoParams.repo, {
        ...parsedQuery.data,
        path: normalizedPath
      });

      return reply.status(200).send({
        ok: true,
        file,
        credentialSource: resolvedClient.credentialSource
      });
    } catch (error) {
      return handleGitHubError(reply, error);
    }
  });
}
