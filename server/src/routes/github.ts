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
import { normalizeGitHubRelativePath } from "../lib/github-paths.js";
import { OpenRouterError, type OpenRouterClient } from "../lib/openrouter.js";
import { verifySessionFromRequest, type AuthConfig } from "../lib/auth.js";
import type { ModelRegistry } from "../lib/model-policy.js";
import type { ModelCapabilitiesConfig } from "../lib/workflow-model-router.js";

type GitHubRouteDependencies = {
  env: AppEnv;
  config: GitHubConfig;
  authConfig: AuthConfig;
  client: GitHubClient;
  openRouter: OpenRouterClient;
  modelRegistry: ModelRegistry;
  modelCapabilitiesConfig: ModelCapabilitiesConfig;
  actionStore?: GitHubActionStore;
};

const GITHUB_ADMIN_KEY_HEADER = "x-modelgate-admin-key";
const DEFAULT_SMOKE_BRANCH_PREFIX = "modelgate/github-smoke";

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

function sendGitHubAdminKeyError(reply: FastifyReply, code: "github_unauthorized" | "github_forbidden") {
  return sendGitHubError(reply, code);
}

function requireGitHubSession(request: FastifyRequest, reply: FastifyReply, authConfig: AuthConfig): void {
  if (!verifySessionFromRequest(request, authConfig)) {
    sendGitHubError(reply, "auth_required");
  }
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
    env: deps.env,
    config: deps.config,
    client: deps.client,
    openRouter: deps.openRouter,
    modelRegistry: deps.modelRegistry,
    modelCapabilities: deps.modelCapabilitiesConfig
  });
  const actionStore = deps.actionStore ?? createGitHubActionStore(deps.config.planTtlMs);
  const actionExecutor = createGitHubActionExecutionService({
    config: deps.config,
    client: deps.client,
    actionStore
  });

  app.get("/api/github/repos", {
    preHandler: async (request, reply) => {
      requireGitHubSession(request, reply, deps.authConfig);
    }
  }, async (_request, reply) => {
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

  app.post("/api/github/context", {
    preHandler: async (request, reply) => {
      requireGitHubSession(request, reply, deps.authConfig);
    }
  }, async (request, reply) => {
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

  app.post("/api/github/actions/propose", {
    preHandler: async (request, reply) => {
      requireGitHubSession(request, reply, deps.authConfig);
    }
  }, async (request, reply) => {
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
                deps.client.readRepositorySummary(proposalRequest.repo.owner, proposalRequest.repo.repo),
                deps.client.readRepositoryCommit(proposalRequest.repo.owner, proposalRequest.repo.repo, baseRef)
              ]).then(async ([repoSummary, baseCommit]) => {
                const smokePath = "docs/modelgate-smoke.md";
                const files: Array<{
                  path: string;
                  sha: string;
                  excerpt: string;
                  citations: never[];
                  truncated: boolean;
                }> = [];

                try {
                  const file = await deps.client.readRepositoryFile(proposalRequest.repo.owner, proposalRequest.repo.repo, {
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

  app.get("/api/github/actions/:planId", {
    preHandler: async (request, reply) => {
      requireGitHubSession(request, reply, deps.authConfig);
    }
  }, async (request, reply) => {
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

  app.post("/api/github/actions/:planId/execute", {
    preHandler: async (request, reply) => {
      requireGitHubSession(request, reply, deps.authConfig);
    }
  }, async (request, reply) => {
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

  app.get("/api/github/actions/:planId/verify", {
    preHandler: async (request, reply) => {
      requireGitHubSession(request, reply, deps.authConfig);
    }
  }, async (request, reply) => {
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

    let lookup = actionStore.readPlan(parsedPlanId.data);
    let recoveredFromGitHub = false;

    if (lookup.state === "missing") {
      const recoveredPlan = await recoverPlanForVerification(parsedPlanId.data, deps.config, deps.client, actionStore);

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
        const verification = await verifyRecoveredRoutePlan(lookup.plan, deps.client);

        return reply.status(200).send({
          ok: true,
          verification
        });
      } catch (error) {
        return handleGitHubError(reply, error);
      }
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

  app.get("/api/github/repos/:owner/:repo/tree", {
    preHandler: async (request, reply) => {
      requireGitHubSession(request, reply, deps.authConfig);
    }
  }, async (request, reply) => {
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

  app.get("/api/github/repos/:owner/:repo/file", {
    preHandler: async (request, reply) => {
      requireGitHubSession(request, reply, deps.authConfig);
    }
  }, async (request, reply) => {
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
