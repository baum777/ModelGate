import assert from "node:assert/strict";
import test from "node:test";
import {
  describeRepositoryAccess,
  buildGitHubReviewItems,
} from "../src/components/GitHubWorkspace.js";
import type { GitHubChangePlan, GitHubVerifyResult } from "../src/lib/github-api.js";

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

  const pendingItems = buildGitHubReviewItems(plan, null);
  const executedItems = buildGitHubReviewItems(plan, verified);
  const staleItems = buildGitHubReviewItems({ ...plan, stale: true }, null);

  assert.equal(pendingItems[0]?.status, "pending_review");
  assert.equal(executedItems[0]?.status, "executed");
  assert.equal(staleItems[0]?.status, "stale");
  assert.equal(executedItems[0]?.sourceLabel, "GitHub Workspace");
  assert.deepEqual(pendingItems[0]?.provenanceRows?.[0], {
    label: "Repository",
    value: "acme/console",
  });
  assert.equal(describeRepositoryAccess(plan.repo), "Schreibzugriff");
  assert.equal(describeRepositoryAccess({ ...plan.repo, permissions: { canWrite: false } }), "Nur Lesen");
});
