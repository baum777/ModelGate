import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  describeRepositoryAccess,
  buildGitHubReviewItems,
  buildGitHubPinnedChatContext,
  isGitHubReviewDirty,
  deriveWorkbenchActionLabel,
} from "../src/components/GitHubWorkspace.js";
import type { GitHubChangePlan, GitHubExecuteResult, GitHubVerifyResult } from "../src/lib/github-api.js";
import { buildPinnedChatContextPrompt } from "../src/lib/pinned-chat-context.js";

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
  const failed = {
    status: "failed",
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
  const failedItems = buildGitHubReviewItems(plan, execution, failed);
  const rejectedItems = buildGitHubReviewItems(plan, execution, mismatch);
  const staleItems = buildGitHubReviewItems({ ...plan, stale: true }, null, null);

  assert.equal(pendingItems[0]?.status, "pending_review");
  assert.equal(approvedItems[0]?.status, "approved");
  assert.equal(executedItems[0]?.status, "executed");
  assert.equal(failedItems[0]?.status, "failed");
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

test("GitHub context pinning builds bounded chat context from analysis and proposal state", () => {
  const repo = {
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
  };

  const context = {
    repo,
    ref: "main",
    baseSha: "sha-main",
    question: "Review routing guard rails",
    files: [{
      path: "server/src/routes/github.ts",
      sha: "sha-file",
      excerpt: "const guard = true;\n".repeat(900),
      citations: [],
      truncated: false,
    }],
    citations: [],
    tokenBudget: {
      maxTokens: 2_000,
      usedTokens: 550,
      truncated: false,
    },
    warnings: [],
    generatedAt: "2026-04-21T08:01:00.000Z",
  };

  const plan = {
    planId: "plan-2",
    repo,
    baseRef: "main",
    baseSha: "sha-main",
    branchName: "feature/pin-context",
    targetBranch: "main",
    status: "pending_review",
    stale: false,
    requiresApproval: true,
    summary: "Pin selected GitHub review context into chat input flow to avoid copy/paste.",
    rationale: "Keeps browser state local while preserving backend execution ownership.",
    riskLevel: "medium_surface",
    citations: [],
    diff: [{
      path: "web/src/components/ChatWorkspace.tsx",
      changeType: "modified",
      beforeSha: "before",
      afterSha: "after",
      additions: 24,
      deletions: 2,
      patch: "+ pinned context banner\n".repeat(900),
      citations: [],
    }],
    generatedAt: "2026-04-21T08:02:00.000Z",
    expiresAt: "2026-04-21T09:02:00.000Z",
  } as GitHubChangePlan;

  const pinned = buildGitHubPinnedChatContext({
    selectedRepo: repo,
    analysisBundle: context,
    proposalPlan: plan,
  });

  assert.ok(pinned);
  assert.equal(pinned.source, "github");
  assert.equal(pinned.repoFullName, "acme/console");
  assert.equal(pinned.ref, "main");
  assert.equal(pinned.path, "server/src/routes/github.ts");
  assert.equal(pinned.summary, plan.summary);
  assert.ok(pinned.excerpt.length <= 4_001);
  assert.ok((pinned.diffPreview?.length ?? 0) <= 1_600);
});

test("pinned chat context prompt appends bounded local context block", () => {
  const prompt = "Find logic regressions in the execute gate.";
  const pinnedPrompt = buildPinnedChatContextPrompt(prompt, {
    source: "github",
    repoFullName: "acme/console",
    ref: "main",
    path: "server/src/routes/github.ts",
    summary: "Guard execute flows behind backend approval.",
    excerpt: "if (!approval) throw new Error('blocked');",
    diffPreview: null,
    createdAt: "2026-04-21T08:03:00.000Z",
  }, "en");

  assert.match(pinnedPrompt, /\[Local GitHub context\]/);
  assert.match(pinnedPrompt, /Repository: acme\/console/);
  assert.match(pinnedPrompt, /Find logic regressions in the execute gate\./);
});

test("GitHub review dirty state tracks unsaved local review progress", () => {
  const proposalPlan = {
    planId: "plan-dirty",
  } as GitHubChangePlan;

  assert.equal(isGitHubReviewDirty({
    proposalPlan,
    executionResult: null,
    approvalChecked: false,
    executionError: null,
  }), true);

  assert.equal(isGitHubReviewDirty({
    proposalPlan: null,
    executionResult: null,
    approvalChecked: true,
    executionError: null,
  }), true);

  assert.equal(isGitHubReviewDirty({
    proposalPlan,
    executionResult: {
      planId: "plan-dirty",
      status: "executed",
      branchName: "feature",
      baseSha: "base",
      headSha: "head",
      commitSha: "commit",
      prNumber: 10,
      prUrl: "https://example.test/pr/10",
      targetBranch: "main",
      executedAt: "2026-05-04T08:30:00.000Z",
    },
    approvalChecked: false,
    executionError: null,
  }), false);

  assert.equal(isGitHubReviewDirty({
    proposalPlan,
    executionResult: null,
    approvalChecked: false,
    executionError: "stale execute failed",
  }), true);
});

test("Workbench action semantics keep local review state separate from backend execution", () => {
  const source = readFileSync("web/src/components/GitHubWorkspace.tsx", "utf8");

  assert.match(source, /type WorkbenchActionEffectType =[\s\S]*"local_review_state"[\s\S]*"backend_prepare"[\s\S]*"backend_execute_pr"/);
  assert.match(source, /type WorkbenchActionState =[\s\S]*"unmarked"[\s\S]*"marked"[\s\S]*"removed"[\s\S]*"pr_prepared"[\s\S]*"pr_ready"/);
  assert.doesNotMatch(source, /\|\s*"unstaged"/);
  assert.doesNotMatch(source, /\|\s*"staged"/);
  assert.doesNotMatch(source, /setWorkbenchActionState\("staged"\)/);
  assert.doesNotMatch(source, /status:\$\{workbenchStatus\}[\s\S]*staged/);
  assert.match(source, /Mark for stage/);
  assert.match(source, /Zur Übergabe vormerken/);
  assert.match(source, /Remove from review/);
  assert.match(source, /Aus Review entfernen/);
  assert.match(source, /Prepare PR/);
  assert.match(source, /Create PR/);
  assert.match(source, /data-effect-type=\{workbenchActionEffects\.markForStage\}/);
  assert.match(source, /data-effect-type=\{workbenchActionEffects\.preparePr\}/);
  assert.match(source, /data-effect-type=\{workbenchActionEffects\.createPr\}/);
  assert.match(source, /workbenchActionState !== "pr_prepared"/);
  assert.match(source, /function handleMarkForStage\(\)[\s\S]*setWorkbenchActionState\("marked"\)/);
  assert.match(source, /function handleRemoveFromReview\(\)[\s\S]*setWorkbenchActionState\("removed"\)/);

  const markHandler = source.slice(
    source.indexOf("function handleMarkForStage()"),
    source.indexOf("function handleRemoveFromReview()"),
  );
  const removeHandler = source.slice(
    source.indexOf("function handleRemoveFromReview()"),
    source.indexOf("function handlePreparePr()"),
  );
  assert.doesNotMatch(markHandler, /executeGitHubPlan|handleExecuteProposal|fetch\(/);
  assert.doesNotMatch(removeHandler, /executeGitHubPlan|handleExecuteProposal|fetch\(/);
});

test("Workbench labels are derived from effect, action state, backend capability, and locale", () => {
  assert.equal(deriveWorkbenchActionLabel({
    effectType: "local_review_state",
    actionState: "unmarked",
    action: "mark_for_stage",
    backendCapability: false,
    locale: "en",
  }), "Mark for stage");
  assert.equal(deriveWorkbenchActionLabel({
    effectType: "local_review_state",
    actionState: "marked",
    action: "remove_from_review",
    backendCapability: false,
    locale: "de",
  }), "Aus Review entfernen");
  assert.equal(deriveWorkbenchActionLabel({
    effectType: "backend_prepare",
    actionState: "marked",
    action: "prepare_pr",
    backendCapability: true,
    locale: "de",
  }), "PR vorbereiten");
  assert.equal(deriveWorkbenchActionLabel({
    effectType: "backend_execute_pr",
    actionState: "pr_prepared",
    action: "create_pr",
    backendCapability: true,
    locale: "en",
  }), "Create PR");
  assert.equal(deriveWorkbenchActionLabel({
    effectType: "backend_execute_pr",
    actionState: "pr_prepared",
    action: "create_pr",
    backendCapability: false,
    locale: "de",
  }), "PR vorbereiten");
});

test("Workbench Create PR is guarded by explicit backend execute capability", () => {
  const source = readFileSync("web/src/components/GitHubWorkspace.tsx", "utf8");

  assert.match(source, /backendCapabilities[\s\S]*executePr/);
  assert.match(source, /const executeDisabled =[\s\S]*!backendCapabilities\.executePr/);
  assert.match(source, /data-backend-capability=\{String\(backendCapabilities\.executePr\)\}/);
});
