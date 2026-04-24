import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createFileGitHubActionStore,
  createGitHubActionStoreSelection,
  createInMemoryGitHubActionStore
} from "../src/lib/github-action-store.js";
import { createTestEnv } from "../test-support/helpers.js";

function createPlan(planId: string, withRoutingMetadata = true) {
  return {
    planId,
    repo: {
      owner: "acme",
      repo: "widget",
      fullName: "acme/widget",
      defaultBranch: "main",
      defaultBranchSha: "sha-main",
      description: "Widget repo",
      isPrivate: false,
      status: "ready" as const,
      permissions: {
        canWrite: true
      },
      checkedAt: "2026-01-01T00:00:00.000Z"
    },
    baseRef: "main",
    baseSha: "sha-main",
    branchName: `modelgate/github/${planId}`,
    targetBranch: "main",
    status: "pending_review" as const,
    stale: false,
    requiresApproval: true as const,
    summary: "Plan summary",
    rationale: "Plan rationale",
    riskLevel: "low_surface" as const,
    citations: [],
    diff: [],
    generatedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-01T00:12:00.000Z",
    ...(withRoutingMetadata
      ? {
          routingMetadata: {
            workflowRole: "github_code_agent" as const,
            selectedModel: "qwen/qwen3-coder:free",
            candidateModels: ["qwen/qwen3-coder:free", "qwen/qwen3-next-80b-a3b-instruct:free"],
            fallbackUsed: false,
            selectionSource: "env" as const,
            routingMode: "policy" as const,
            allowFallback: true,
            failClosed: true,
            structuredOutputRequired: true,
            approvalRequired: true,
            mayExecuteExternalTools: false,
            mayWriteExternalState: false,
            policySectionKey: "github_code_agent",
            recordedAt: "2026-01-01T00:00:00.000Z"
          }
        }
      : {}),
    request: {
      repo: {
        owner: "acme",
        repo: "widget"
      },
      objective: "Update widget flow",
      baseBranch: "main"
    },
    context: {
      repo: {
        owner: "acme",
        repo: "widget",
        fullName: "acme/widget",
        defaultBranch: "main",
        defaultBranchSha: "sha-main",
        description: "Widget repo",
        isPrivate: false,
        status: "ready" as const,
        permissions: {
          canWrite: true
        },
        checkedAt: "2026-01-01T00:00:00.000Z"
      },
      ref: "main",
      baseSha: "sha-main",
      question: "Update widget flow",
      files: [],
      citations: [],
      tokenBudget: {
        maxTokens: 0,
        usedTokens: 0,
        truncated: false
      },
      warnings: [],
      generatedAt: "2026-01-01T00:00:00.000Z"
    }
  };
}

test("memory GitHub action store supports create, read, update, and expiry", () => {
  let nowMs = 1_000;
  const store = createInMemoryGitHubActionStore(500, () => nowMs);
  const entry = store.createPlan(createPlan("plan_memory"));

  assert.equal(entry.createdAtMs, 1_000);
  assert.equal(entry.expiresAtMs, 1_500);

  const active = store.readPlan("plan_memory");
  assert.equal(active.state, "active");
  assert.equal(active.plan.summary, "Plan summary");
  assert.equal(active.plan.routingMetadata?.workflowRole, "github_code_agent");

  const updated = store.updatePlan("plan_memory", (plan) => ({
    ...plan,
    summary: "Updated summary"
  }));
  assert.equal(updated.state, "active");
  assert.equal(updated.plan.summary, "Updated summary");

  nowMs = 1_501;
  const expired = store.readPlan("plan_memory");
  assert.equal(expired.state, "expired");

  const removed = store.readPlan("plan_memory");
  assert.equal(removed.state, "missing");
});

test("memory GitHub action store does not update missing or expired plans", () => {
  let nowMs = 1_000;
  const store = createInMemoryGitHubActionStore(200, () => nowMs);
  store.createPlan(createPlan("plan_missing_checks"));

  const missingUpdate = store.updatePlan("plan_not_found", (plan) => plan);
  assert.equal(missingUpdate.state, "missing");

  nowMs = 1_300;
  const expiredUpdate = store.updatePlan("plan_missing_checks", (plan) => ({
    ...plan,
    summary: "Should not apply"
  }));
  assert.equal(expiredUpdate.state, "expired");

  const afterExpiry = store.readPlan("plan_missing_checks");
  assert.equal(afterExpiry.state, "missing");
});

test("file GitHub action store supports create, read, update, expiry, and restart recovery", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "modelgate-github-store-"));
  const filePath = path.join(tempDir, "github-action-store.json");
  let nowMs = 5_000;
  const store = createFileGitHubActionStore({
    filePath,
    ttlMs: 400,
    now: () => nowMs
  });

  const created = store.createPlan(createPlan("plan_file"));
  assert.equal(created.createdAtMs, 5_000);
  assert.ok(fs.existsSync(filePath));

  const sameProcessRead = store.readPlan("plan_file");
  assert.equal(sameProcessRead.state, "active");
  assert.equal(sameProcessRead.plan.planId, "plan_file");

  const updated = store.updatePlan("plan_file", (plan) => ({
    ...plan,
    rationale: "Updated rationale"
  }));
  assert.equal(updated.state, "active");
  assert.equal(updated.plan.rationale, "Updated rationale");

  const reloadedStore = createFileGitHubActionStore({
    filePath,
    ttlMs: 400,
    now: () => nowMs
  });
  const reloadedRead = reloadedStore.readPlan("plan_file");
  assert.equal(reloadedRead.state, "active");
  assert.equal(reloadedRead.plan.rationale, "Updated rationale");
  assert.equal(reloadedRead.plan.routingMetadata?.selectedModel, "qwen/qwen3-coder:free");

  nowMs = 5_500;
  const expired = reloadedStore.readPlan("plan_file");
  assert.equal(expired.state, "expired");

  const missingAfterExpiry = reloadedStore.readPlan("plan_file");
  assert.equal(missingAfterExpiry.state, "missing");

  const persistedAfterExpiry = JSON.parse(fs.readFileSync(filePath, "utf8")) as { plans: unknown[] };
  assert.deepEqual(persistedAfterExpiry.plans, []);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("file GitHub action store starts empty when persisted state is malformed", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "modelgate-github-store-malformed-"));
  const filePath = path.join(tempDir, "github-action-store.json");
  fs.writeFileSync(filePath, "{not-json", "utf8");

  const store = createFileGitHubActionStore({
    filePath,
    ttlMs: 1_000,
    now: () => 10_000
  });
  const lookup = store.readPlan("plan_unknown");
  assert.equal(lookup.state, "missing");

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("file GitHub action store starts empty when persisted routing metadata is malformed", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "modelgate-github-store-routing-malformed-"));
  const filePath = path.join(tempDir, "github-action-store.json");
  const invalidSnapshot = {
    version: 1,
    plans: [
      {
        ...createPlan("plan_invalid_routing"),
        routingMetadata: {
          selectedModel: "qwen/qwen3-coder:free"
        }
      }
    ]
  };
  fs.writeFileSync(filePath, JSON.stringify(invalidSnapshot), "utf8");

  const store = createFileGitHubActionStore({
    filePath,
    ttlMs: 1_000,
    now: () => 10_000
  });

  const lookup = store.readPlan("plan_invalid_routing");
  assert.equal(lookup.state, "missing");

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("GitHub action store selection defaults to memory mode", () => {
  const selection = createGitHubActionStoreSelection(createTestEnv());
  assert.equal(selection.mode, "memory");
  assert.equal(selection.filePath, ".local-ai/state/github-action-store.json");
});

test("GitHub action store selection enables file mode only when explicitly configured", () => {
  const selection = createGitHubActionStoreSelection(createTestEnv({
    GITHUB_ACTION_STORE_MODE: "file",
    GITHUB_ACTION_STORE_FILE_PATH: ".local-ai/state/github-store-dev.json"
  }));
  assert.equal(selection.mode, "file");
  assert.equal(selection.filePath, ".local-ai/state/github-store-dev.json");

  const fallbackSelection = createGitHubActionStoreSelection(createTestEnv({
    GITHUB_ACTION_STORE_MODE: "unknown-mode"
  }));
  assert.equal(fallbackSelection.mode, "memory");
});
