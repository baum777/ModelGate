import { GitHubClientError, type GitHubClient, type GitHubPullRequestSummary, type GitHubRepositoryReference } from "./github-client.js";
import type { GitHubActionStore, GitHubActionStoreEntry } from "./github-action-store.js";
import type {
  GitHubChangePlan,
  GitHubDiffFile,
  GitHubExecuteResult,
  GitHubRepoSummary,
  GitHubVerifyResult
} from "./github-contract.js";
import type { GitHubConfig } from "./github-env.js";

type GitHubActionExecutionOptions = {
  config: GitHubConfig;
  client: GitHubClient;
  actionStore: GitHubActionStore;
};

const EXECUTION_AUTHOR = {
  name: "ModelGate",
  email: "modelgate@users.noreply.github.com"
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function splitContentLines(value: string) {
  const normalized = normalizeLineEndings(value);

  if (normalized.length === 0) {
    return [];
  }

  const lines = normalized.split("\n");

  if (lines.at(-1) === "") {
    lines.pop();
  }

  return lines;
}

function buildFreshnessCheck(summary: GitHubRepoSummary, plan: GitHubChangePlan) {
  return summary.status === "ready"
    && summary.defaultBranch === plan.targetBranch
    && summary.defaultBranchSha === plan.baseSha;
}

function buildBranchHeadRef(branchName: string) {
  return `heads/${branchName}`;
}

function buildGitRef(branchName: string) {
  return `refs/heads/${branchName}`;
}

function isMissingReferenceError(error: unknown) {
  return Boolean(
    error
    && error instanceof GitHubClientError
    && error.code === "github_repo_not_found"
    && error.path.includes("/git/ref/")
  );
}

function extractReviewablePatchContents(patch: string) {
  const lines = normalizeLineEndings(patch).split("\n");
  const markerIndex = lines.findIndex((line) => {
    const marker = line.trim();
    return marker === "@@ reviewable replacement @@" || marker === "@@ reviewable addition @@";
  });

  if (markerIndex === -1) {
    throw new GitHubClientError({
      code: "github_patch_invalid",
      status: 422,
      operation: "GitHub execution",
      path: "/api/github/actions/execute",
      baseUrl: "unavailable",
      message: "GitHub patch was missing the reviewable replacement marker"
    });
  }

  const marker = lines[markerIndex]?.trim() ?? "";
  const beforeLines: string[] = [];
  const afterLines: string[] = [];

  for (const line of lines.slice(markerIndex + 1)) {
    if (line.startsWith("-")) {
      beforeLines.push(line.slice(1));
      continue;
    }

    if (line.startsWith("+")) {
      afterLines.push(line.slice(1));
      continue;
    }

    if (line.trim().length === 0) {
      continue;
    }

    throw new GitHubClientError({
      code: "github_patch_invalid",
      status: 422,
      operation: "GitHub execution",
      path: "/api/github/actions/execute",
      baseUrl: "unavailable",
      message: "GitHub patch contained unsupported diff content"
    });
  }

  if (marker === "@@ reviewable addition @@" ) {
    if (beforeLines.length > 0 || afterLines.length === 0) {
      throw new GitHubClientError({
        code: "github_patch_invalid",
        status: 422,
        operation: "GitHub execution",
        path: "/api/github/actions/execute",
        baseUrl: "unavailable",
        message: "GitHub addition patch was malformed"
      });
    }

    return {
      beforeContent: "",
      afterContent: afterLines.join("\n"),
      changeType: "added" as const
    };
  }

  if (beforeLines.length === 0 || afterLines.length === 0) {
    throw new GitHubClientError({
      code: "github_patch_invalid",
      status: 422,
      operation: "GitHub execution",
      path: "/api/github/actions/execute",
      baseUrl: "unavailable",
      message: "GitHub patch did not contain both sides of the replacement"
    });
  }

  return {
    beforeContent: beforeLines.join("\n"),
    afterContent: afterLines.join("\n"),
    changeType: "modified" as const
  };
}

function getPlannedFileMode(plan: GitHubActionStoreEntry, path: string) {
  return plan.context.tree?.entries.find((entry) => entry.path === path)?.mode ?? "100644";
}

function getPlannedFileContent(plan: GitHubActionStoreEntry, diffFile: GitHubDiffFile) {
  const extracted = extractReviewablePatchContents(diffFile.patch);

  if (diffFile.changeType === "added") {
    return {
      beforeContent: "",
      afterContent: extracted.afterContent,
      mode: getPlannedFileMode(plan, diffFile.path),
      path: diffFile.path,
      beforeSha: null,
      currentSha: null
    };
  }

  const currentFile = plan.context.files.find((entry) => entry.path === diffFile.path);

  if (!currentFile) {
    throw new GitHubClientError({
      code: "github_patch_invalid",
      status: 422,
      operation: "GitHub execution",
      path: "/api/github/actions/execute",
      baseUrl: "unavailable",
      message: `GitHub plan referenced an unknown file: ${diffFile.path}`
    });
  }

  return {
    beforeContent: extracted.beforeContent,
    afterContent: extracted.afterContent,
    mode: getPlannedFileMode(plan, diffFile.path),
    path: diffFile.path,
    beforeSha: diffFile.beforeSha,
    currentSha: currentFile.sha
  };
}

async function loadPlannedTreeEntries(
  client: GitHubClient,
  plan: GitHubActionStoreEntry
) {
  const loadedFiles = [];

  for (const diffFile of plan.diff) {
    const planned = getPlannedFileContent(plan, diffFile);
    if (diffFile.changeType === "added") {
      try {
        const currentFile = await client.readRepositoryFile(plan.repo.owner, plan.repo.repo, {
          ref: plan.baseSha,
          path: planned.path
        });

        if (!currentFile.binary && !currentFile.truncated) {
          throw new GitHubClientError({
            code: "github_patch_invalid",
            status: 422,
            operation: "GitHub execution",
            path: "/api/github/actions/execute",
            baseUrl: "unavailable",
            message: `GitHub file already exists: ${planned.path}`
          });
        }

        throw new GitHubClientError({
          code: "github_patch_invalid",
          status: 422,
          operation: "GitHub execution",
          path: "/api/github/actions/execute",
          baseUrl: "unavailable",
          message: `GitHub file was not fully readable: ${planned.path}`
        });
      } catch (error) {
        if (!(error instanceof GitHubClientError && error.code === "github_file_not_found")) {
          throw error;
        }
      }

      loadedFiles.push({
        path: planned.path,
        mode: planned.mode,
        content: planned.afterContent
      });
      continue;
    }

    const currentFile = await client.readRepositoryFile(plan.repo.owner, plan.repo.repo, {
      ref: plan.baseSha,
      path: planned.path
    });

    if (currentFile.binary || currentFile.truncated) {
      throw new GitHubClientError({
        code: "github_patch_invalid",
        status: 422,
        operation: "GitHub execution",
        path: "/api/github/actions/execute",
        baseUrl: "unavailable",
        message: `GitHub file was not fully readable: ${planned.path}`
      });
    }

    if (currentFile.sha !== planned.beforeSha) {
      throw new GitHubClientError({
        code: "github_patch_invalid",
        status: 422,
        operation: "GitHub execution",
        path: "/api/github/actions/execute",
        baseUrl: "unavailable",
        message: `GitHub file changed before execution: ${planned.path}`
      });
    }

    if (splitContentLines(currentFile.content).join("\n") !== planned.beforeContent) {
      throw new GitHubClientError({
        code: "github_patch_invalid",
        status: 422,
        operation: "GitHub execution",
        path: "/api/github/actions/execute",
        baseUrl: "unavailable",
        message: `GitHub patch no longer applies cleanly to ${planned.path}`
      });
    }

    loadedFiles.push({
      path: planned.path,
      mode: planned.mode,
      content: planned.afterContent
    });
  }

  return loadedFiles;
}

async function readRepositoryReference(
  client: GitHubClient,
  plan: GitHubActionStoreEntry
): Promise<GitHubRepositoryReference | null> {
  try {
    return await client.readRepositoryReference(plan.repo.owner, plan.repo.repo, buildBranchHeadRef(plan.branchName));
  } catch (error) {
    if (isMissingReferenceError(error)) {
      return null;
    }

    throw error;
  }
}

async function findPullRequestByBranch(
  client: GitHubClient,
  plan: GitHubActionStoreEntry
) {
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

function buildExecuteResult(plan: GitHubActionStoreEntry, branchHeadSha: string, pr: GitHubPullRequestSummary): GitHubExecuteResult {
  return {
    planId: plan.planId,
    status: "executed",
    branchName: plan.branchName,
    baseSha: plan.baseSha,
    headSha: branchHeadSha,
    commitSha: branchHeadSha,
    prNumber: pr.number,
    prUrl: pr.htmlUrl,
    targetBranch: plan.targetBranch,
    executedAt: new Date().toISOString()
  };
}

function buildVerificationPending(plan: GitHubActionStoreEntry, summary: GitHubRepoSummary, actualCommitSha: string | null, pr: GitHubPullRequestSummary | null): GitHubVerifyResult {
  return {
    planId: plan.planId,
    status: "pending",
    checkedAt: new Date().toISOString(),
    branchName: plan.branchName,
    targetBranch: plan.targetBranch,
    expectedBaseSha: plan.baseSha,
    actualBaseSha: summary.defaultBranchSha,
    expectedCommitSha: plan.execution?.commitSha ?? null,
    actualCommitSha,
    prNumber: pr?.number ?? null,
    prUrl: pr?.htmlUrl ?? null,
    mismatchReasons: plan.execution
      ? ["The branch or pull request is not visible yet"]
      : ["The plan has not been executed yet"]
  };
}

function buildVerificationMismatch(
  plan: GitHubActionStoreEntry,
  summary: GitHubRepoSummary,
  actualCommitSha: string | null,
  pr: GitHubPullRequestSummary | null,
  reasons: string[]
): GitHubVerifyResult {
  return {
    planId: plan.planId,
    status: "mismatch",
    checkedAt: new Date().toISOString(),
    branchName: plan.branchName,
    targetBranch: plan.targetBranch,
    expectedBaseSha: plan.baseSha,
    actualBaseSha: summary.defaultBranchSha,
    expectedCommitSha: plan.execution?.commitSha ?? null,
    actualCommitSha,
    prNumber: pr?.number ?? null,
    prUrl: pr?.htmlUrl ?? null,
    mismatchReasons: reasons
  };
}

function buildVerificationVerified(
  plan: GitHubActionStoreEntry,
  summary: GitHubRepoSummary,
  actualCommitSha: string,
  pr: GitHubPullRequestSummary | null
): GitHubVerifyResult {
  return {
    planId: plan.planId,
    status: "verified",
    checkedAt: new Date().toISOString(),
    branchName: plan.branchName,
    targetBranch: plan.targetBranch,
    expectedBaseSha: plan.baseSha,
    actualBaseSha: summary.defaultBranchSha,
    expectedCommitSha: plan.execution?.commitSha ?? actualCommitSha,
    actualCommitSha,
    prNumber: pr?.number ?? null,
    prUrl: pr?.htmlUrl ?? null,
    mismatchReasons: []
  };
}

function buildExecutionFreshnessError(plan: GitHubActionStoreEntry) {
  return new GitHubClientError({
    code: "github_stale_plan",
    status: 409,
    operation: "GitHub execution",
    path: "/api/github/actions/execute",
    baseUrl: "unavailable",
    message: `GitHub plan ${plan.planId} is stale and must be refreshed`
  });
}

function buildExecutionPolicyError(message: string) {
  return new GitHubClientError({
    code: "github_execute_policy_blocked",
    status: 409,
    operation: "GitHub execution",
    path: "/api/github/actions/execute",
    baseUrl: "unavailable",
    message
  });
}

function isDeterministicSmokePlan(plan: GitHubActionStoreEntry) {
  return plan.request.mode === "smoke";
}

function assertExecutePolicyForPlan(plan: GitHubActionStoreEntry) {
  if (isDeterministicSmokePlan(plan)) {
    return;
  }

  const metadata = plan.routingMetadata;

  if (!isObject(metadata)) {
    throw buildExecutionPolicyError("GitHub routing metadata is required before execute");
  }

  if (metadata.workflowRole !== "github_code_agent") {
    throw buildExecutionPolicyError("GitHub routing workflow role is invalid for execute");
  }

  if (metadata.mayWriteExternalState) {
    throw buildExecutionPolicyError("GitHub routing policy disallows external state writes on execute");
  }

  if (metadata.mayExecuteExternalTools) {
    throw buildExecutionPolicyError("GitHub routing policy disallows external tool execution on execute");
  }

  if (metadata.approvalRequired !== true) {
    throw buildExecutionPolicyError("GitHub routing policy must require approval before execute");
  }

  if (metadata.structuredOutputRequired !== true) {
    throw buildExecutionPolicyError("GitHub routing policy must require structured output for execute");
  }

  if (metadata.fallbackUsed) {
    throw buildExecutionPolicyError("GitHub execute path does not allow fallback-routed proposals");
  }
}

function buildVerificationFreshnessReason(summary: GitHubRepoSummary, plan: GitHubActionStoreEntry) {
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

export function createGitHubActionExecutionService(options: GitHubActionExecutionOptions) {
  return {
    async executePlan(plan: GitHubActionStoreEntry): Promise<GitHubExecuteResult> {
      if (plan.execution) {
        return plan.execution;
      }

      assertExecutePolicyForPlan(plan);

      const summary = await options.client.readRepositorySummary(plan.repo.owner, plan.repo.repo);

      if (!buildFreshnessCheck(summary, plan)) {
        throw buildExecutionFreshnessError(plan);
      }

      if (!plan.requiresApproval) {
        throw new GitHubClientError({
          code: "invalid_request",
          status: 400,
          operation: "GitHub execution",
          path: "/api/github/actions/execute",
          baseUrl: "unavailable",
          message: "GitHub execution requires approval"
        });
      }

      const treeEntries = await loadPlannedTreeEntries(options.client, plan);
      const baseCommit = await options.client.readRepositoryCommit(plan.repo.owner, plan.repo.repo, plan.baseSha);
      const tree = await options.client.createRepositoryTree(plan.repo.owner, plan.repo.repo, {
        baseTreeSha: baseCommit.treeSha,
        entries: treeEntries
      });
      const commit = await options.client.createRepositoryCommit(plan.repo.owner, plan.repo.repo, {
        message: `ModelGate plan ${plan.planId}`,
        treeSha: tree.sha,
        parentShas: [plan.baseSha],
        author: {
          ...EXECUTION_AUTHOR,
          date: plan.generatedAt
        },
        committer: {
          ...EXECUTION_AUTHOR,
          date: plan.generatedAt
        }
      });

      const branchRef = buildBranchHeadRef(plan.branchName);
      const existingBranch = await readRepositoryReference(options.client, plan);

      if (existingBranch && existingBranch.sha !== commit.sha) {
        if (existingBranch.sha !== plan.baseSha) {
          throw new GitHubClientError({
            code: "github_branch_conflict",
            status: 409,
            operation: "GitHub execution",
            path: "/api/github/actions/execute",
            baseUrl: "unavailable",
            message: `GitHub branch already exists with a different head: ${plan.branchName}`
          });
        }

        await options.client.updateRepositoryReference(plan.repo.owner, plan.repo.repo, branchRef, commit.sha);
      }

      if (!existingBranch) {
        await options.client.createRepositoryReference(plan.repo.owner, plan.repo.repo, buildGitRef(plan.branchName), commit.sha);
      }

      const branchState = await options.client.readRepositoryReference(plan.repo.owner, plan.repo.repo, branchRef);

      if (branchState.sha !== commit.sha) {
        throw new GitHubClientError({
          code: "github_branch_conflict",
          status: 409,
          operation: "GitHub execution",
          path: "/api/github/actions/execute",
          baseUrl: "unavailable",
          message: `GitHub branch did not advance to the expected commit: ${plan.branchName}`
        });
      }

      const existingPullRequest = await findPullRequestByBranch(options.client, plan);
      let pullRequest = existingPullRequest;

      if (pullRequest) {
        if (pullRequest.headSha !== commit.sha || pullRequest.baseRef !== plan.targetBranch) {
          throw new GitHubClientError({
            code: "github_pr_create_failed",
            status: 502,
            operation: "GitHub execution",
            path: "/api/github/actions/execute",
            baseUrl: "unavailable",
            message: `GitHub pull request already exists for ${plan.branchName} but points to a different commit`
          });
        }
      } else {
        pullRequest = await options.client.createPullRequest(plan.repo.owner, plan.repo.repo, {
          title: `ModelGate plan ${plan.planId}`,
          head: plan.branchName,
          base: plan.targetBranch,
          body: [
            `ModelGate approval-gated proposal`,
            `Plan: ${plan.planId}`,
            `Repo: ${plan.repo.fullName}`,
            `Branch: ${plan.branchName}`
          ].join("\n"),
          draft: false,
          maintainerCanModify: false
        });
      }

      const execution = buildExecuteResult(plan, commit.sha, pullRequest);

      options.actionStore.updatePlan(plan.planId, (current) => ({
        ...current,
        status: "executed",
        execution
      }));

      return execution;
    },

    async verifyPlan(plan: GitHubActionStoreEntry): Promise<GitHubVerifyResult> {
      const summary = await options.client.readRepositorySummary(plan.repo.owner, plan.repo.repo);
      const freshnessReason = buildVerificationFreshnessReason(summary, plan);
      const branchRef = buildBranchHeadRef(plan.branchName);
      const branchReference = await readRepositoryReference(options.client, plan);
      const actualCommitSha = branchReference?.sha ?? null;
      const pullRequest = await findPullRequestByBranch(options.client, plan);

      if (!plan.execution) {
        const result = buildVerificationPending(plan, summary, actualCommitSha, pullRequest);
        options.actionStore.updatePlan(plan.planId, (current) => ({
          ...current,
          verification: result
        }));
        return result;
      }

      if (freshnessReason) {
        const result = buildVerificationMismatch(plan, summary, actualCommitSha, pullRequest, [freshnessReason]);
        options.actionStore.updatePlan(plan.planId, (current) => ({
          ...current,
          verification: result
        }));
        return result;
      }

      if (!branchReference) {
        if (pullRequest && pullRequest.headSha === plan.execution.commitSha) {
          const result = buildVerificationVerified(plan, summary, pullRequest.headSha, pullRequest);
          options.actionStore.updatePlan(plan.planId, (current) => ({
            ...current,
            verification: result
          }));
          return result;
        }

        const result = buildVerificationPending(plan, summary, actualCommitSha, pullRequest);
        options.actionStore.updatePlan(plan.planId, (current) => ({
          ...current,
          verification: result
        }));
        return result;
      }

      if (branchReference.sha !== plan.execution.commitSha) {
        const result = buildVerificationMismatch(plan, summary, branchReference.sha, pullRequest, [
          `Branch head does not match the approved commit for ${branchRef}`
        ]);
        options.actionStore.updatePlan(plan.planId, (current) => ({
          ...current,
          verification: result
        }));
        return result;
      }

      if (!pullRequest) {
        const result = buildVerificationVerified(plan, summary, branchReference.sha, null);
        options.actionStore.updatePlan(plan.planId, (current) => ({
          ...current,
          verification: result
        }));
        return result;
      }

      if (pullRequest.headSha !== plan.execution.commitSha || pullRequest.baseRef !== plan.targetBranch) {
        const result = buildVerificationMismatch(plan, summary, branchReference.sha, pullRequest, [
          "Pull request does not point to the approved branch and target branch"
        ]);
        options.actionStore.updatePlan(plan.planId, (current) => ({
          ...current,
          verification: result
        }));
        return result;
      }

      const result = buildVerificationVerified(plan, summary, branchReference.sha, pullRequest);
      options.actionStore.updatePlan(plan.planId, (current) => ({
        ...current,
        verification: result
      }));
      return result;
    }
  };
}
