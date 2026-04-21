import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGitHubReviewItems,
} from "../src/components/GitHubWorkspace.js";
import type { GitHubChangePlan, GitHubVerifyResult } from "../src/lib/github-api.js";

test("GitHub workspace review items map proposal state into the shared review language", () => {
  const plan = {
    planId: "plan-1",
    summary: "Refine the workspace guard rails",
    rationale: "Backend-owned execution stays explicit.",
    stale: false,
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
});
