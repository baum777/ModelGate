import assert from "node:assert/strict";
import test from "node:test";
import {
  describeRepositoryAccess,
  buildGitHubReviewItems,
} from "../src/components/GitHubWorkspace.js";
import type { GitHubChangePlan, GitHubExecuteResult, GitHubVerifyResult } from "../src/lib/github-api.js";

test("GitHub workspace review items map proposal state into the shared review language", () => {
  const plan = {
    planId: "plan-1",
    repo: {
      owner: "acme",
      repo: "console",
      fullName: "acme/console",
      defaultBranch: "main",
      defaultBranchSha: "sha-main",
      description: "Console repo",
      isPrivate: true,
      status: "ready",
      permissions: {
        canWrite: true,
      },
      checkedAt: "2026-04-21T08:00:00.000Z",
    },
    baseRef: "main",
    baseSha: "sha-main",
    branchName: "feature/truth",
    targetBranch: "main",
    summary: "Refine the workspace guard rails",
    rationale: "Backend-owned execution stays explicit.",
    stale: false,
    requiresApproval: true,
    riskLevel: "medium_surface",
    citations: [],
    diff: [],
    generatedAt: "2026-04-21T08:00:00.000Z",
    expiresAt: "2026-04-21T09:00:00.000Z",
  } as GitHubChangePlan;

  const verified = {
    status: "verified",
  } as GitHubVerifyResult;
  const mismatch = {
    status: "mismatch",
  } as GitHubVerifyResult;
  const execution = {
    planId: "plan-1",
    status: "executed",
    branchName: "feature/truth",
    baseSha: "sha-main",
    headSha: "sha-head",
    commitSha: "sha-commit",
    prNumber: 42,
    prUrl: "https://example.test/pr/42",
    targetBranch: "main",
    executedAt: "2026-04-21T08:10:00.000Z",
  } as GitHubExecuteResult;

  const pendingItems = buildGitHubReviewItems(plan, null, null);
  const pendingItemsEn = buildGitHubReviewItems(plan, null, null, "en");
  const approvedItems = buildGitHubReviewItems(plan, execution, null);
  const executedItems = buildGitHubReviewItems(plan, execution, verified);
  const rejectedItems = buildGitHubReviewItems(plan, execution, mismatch);
  const staleItems = buildGitHubReviewItems({ ...plan, stale: true }, null, null);

  assert.equal(pendingItems[0]?.status, "pending_review");
  assert.equal(approvedItems[0]?.status, "approved");
  assert.equal(executedItems[0]?.status, "executed");
  assert.equal(rejectedItems[0]?.status, "rejected");
  assert.equal(staleItems[0]?.status, "stale");
  assert.equal(executedItems[0]?.sourceLabel, "GitHub-Workspace");
  assert.deepEqual(pendingItems[0]?.provenanceRows?.[0], {
    label: "Acting identity",
    value: "not exposed by backend",
  });
  assert.equal(pendingItemsEn[0]?.sourceLabel, "GitHub workspace");
  assert.equal(describeRepositoryAccess(plan.repo), "Schreibzugriff");
  assert.equal(describeRepositoryAccess({ ...plan.repo, permissions: { canWrite: false } }), "Nur Lesen");
  assert.equal(describeRepositoryAccess(plan.repo, "en"), "Write access");
  assert.equal(describeRepositoryAccess({ ...plan.repo, permissions: { canWrite: false } }, "en"), "Read only");
});
