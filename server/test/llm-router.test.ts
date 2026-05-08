import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  classifyLatestUserMessage,
  loadLlmRouterPolicy,
  resolveLlmRouterSelection,
  type LlmRouterPolicy,
  type LlmRouterRule
} from "../src/lib/llm-router.js";

const BASE_RULES: LlmRouterRule[] = [
  { taskType: "coding", keywords: ["code", "build"], model: "coding-primary:free" },
  { taskType: "repo_review", keywords: ["review", "pull request"], model: "repo-review-primary:free" },
  { taskType: "architecture", keywords: ["architecture", "design"], model: "architecture-primary:free" },
  { taskType: "deep_reasoning", keywords: ["reason", "analysis"], model: "reasoning-primary:free" },
  { taskType: "long_context", keywords: ["long context", "summarize"], model: "context-primary:free" },
  { taskType: "ui_review", keywords: ["ui", "stitch"], model: "ui-primary:free" },
  { taskType: "daily", keywords: [], model: "daily-primary:free" }
];

function createPolicy(overrides: Partial<LlmRouterPolicy> = {}): LlmRouterPolicy {
  return {
    enabled: overrides.enabled ?? true,
    mode: "rules_first",
    requireFreeModels: overrides.requireFreeModels ?? false,
    maxFallbacks: overrides.maxFallbacks ?? 2,
    failClosed: overrides.failClosed ?? true,
    defaultModel: overrides.defaultModel ?? "default-fallback:free",
    fallbackModel: overrides.fallbackModel ?? "secondary-fallback:free",
    rules: overrides.rules ?? BASE_RULES,
    logging: overrides.logging ?? {
      enabled: false,
      routerLogPath: ".local-ai/logs/ROUTER_DECISIONS.log.md",
      modelRunLogPath: ".local-ai/logs/MODEL_RUNS.log.md",
      promptEvidenceLogPath: ".local-ai/logs/PROMPT_EVIDENCE.log.md"
    }
  };
}

test("classifyLatestUserMessage uses the latest user message only", () => {
  const taskType = classifyLatestUserMessage([
    { role: "user", content: "please review this" },
    { role: "assistant", content: "ok" },
    { role: "user", content: "please build this" }
  ], BASE_RULES);

  assert.equal(taskType, "coding");
});

test("classifyLatestUserMessage uses ordered first-match rules", () => {
  const taskType = classifyLatestUserMessage([
    { role: "user", content: "please review the PR and build this" }
  ], [
    { taskType: "repo_review", keywords: ["review"], model: "repo-review-primary:free" },
    { taskType: "coding", keywords: ["build"], model: "coding-primary:free" },
    { taskType: "daily", keywords: [], model: "daily-primary:free" }
  ]);

  assert.equal(taskType, "repo_review");
});

test("classifyLatestUserMessage matches short exact keywords as whole tokens", () => {
  const taskType = classifyLatestUserMessage([
    { role: "user", content: "please review the PR" }
  ], [
    { taskType: "repo_review", keywords: ["pr"], model: "repo-review-primary:free" },
    { taskType: "daily", keywords: [], model: "daily-primary:free" }
  ]);

  assert.equal(taskType, "repo_review");
});

test("resolveLlmRouterSelection keeps the router fallback order deterministic", () => {
  const resolution = resolveLlmRouterSelection({
    messages: [{ role: "user", content: "please code this" }],
    baseProviderTargets: ["legacy-one:free"],
    policy: createPolicy({
      defaultModel: "default-fallback:free",
      fallbackModel: "secondary-fallback:free"
    })
  });

  assert.equal(resolution.ok, true);
  if (!resolution.ok) {
    return;
  }

  assert.equal(resolution.taskType, "coding");
  assert.equal(resolution.selectedModel, "coding-primary:free");
  assert.deepEqual(resolution.candidateModels, [
    "coding-primary:free",
    "default-fallback:free",
    "secondary-fallback:free"
  ]);
  assert.equal(resolution.fallbackUsed, false);
});

test("resolveLlmRouterSelection enforces free-model candidates", () => {
  const resolution = resolveLlmRouterSelection({
    messages: [{ role: "user", content: "please code this" }],
    baseProviderTargets: ["legacy-nonfree"],
    policy: createPolicy({
      requireFreeModels: true,
      rules: BASE_RULES.map((rule) => rule.taskType === "coding"
        ? { ...rule, model: "coding-primary" }
        : rule)
    })
  });

  assert.equal(resolution.ok, true);
  if (!resolution.ok) {
    return;
  }

  assert.equal(resolution.selectedModel, "default-fallback:free");
  assert.deepEqual(resolution.candidateModels, [
    "default-fallback:free",
    "secondary-fallback:free"
  ]);
  assert.equal(resolution.fallbackUsed, true);
});

test("resolveLlmRouterSelection caps fallback attempts", () => {
  const resolution = resolveLlmRouterSelection({
    messages: [{ role: "user", content: "please code this" }],
    baseProviderTargets: ["legacy-one:free", "legacy-two:free"],
    policy: createPolicy({
      maxFallbacks: 1,
      defaultModel: "default-fallback:free",
      fallbackModel: "secondary-fallback:free"
    })
  });

  assert.equal(resolution.ok, true);
  if (!resolution.ok) {
    return;
  }

  assert.deepEqual(resolution.candidateModels, [
    "coding-primary:free",
    "default-fallback:free"
  ]);
});

test("resolveLlmRouterSelection fails closed when no valid candidate remains", () => {
  const resolution = resolveLlmRouterSelection({
    messages: [{ role: "user", content: "please code this" }],
    baseProviderTargets: ["legacy-nonfree"],
    policy: createPolicy({
      requireFreeModels: true,
      rules: BASE_RULES.map((rule) => ({ ...rule, model: `${rule.taskType}-nonfree` })),
      defaultModel: "default-nonfree",
      fallbackModel: "fallback-nonfree"
    })
  });

  assert.equal(resolution.ok, false);
  if (resolution.ok) {
    return;
  }

  assert.equal(resolution.reason, "no_valid_candidate");
  assert.match(resolution.message, /failed closed/i);
});

test("loadLlmRouterPolicy remains disabled when routing is off", () => {
  const policy = loadLlmRouterPolicy({
    LLM_ROUTER_ENABLED: "false",
    LLM_REQUIRE_FREE_MODELS: "true",
    LLM_MAX_FALLBACKS: "2",
    LLM_ROUTER_FAIL_CLOSED: "true",
    LLM_DEFAULT_MODEL: "disabled-default:free",
    LLM_FALLBACK_MODEL: "disabled-fallback:free"
  });

  assert.equal(policy.enabled, false);

  const resolution = resolveLlmRouterSelection({
    messages: [{ role: "user", content: "please review this" }],
    baseProviderTargets: ["existing-a:free", "existing-b:free"],
    policy
  });

  assert.equal(resolution.ok, true);
  if (!resolution.ok) {
    return;
  }

  assert.equal(resolution.reason, "router_disabled");
  assert.deepEqual(resolution.candidateModels, ["existing-a:free", "existing-b:free"]);
  assert.equal(resolution.selectedModel, "existing-a:free");
});

test("loadLlmRouterPolicy rejects malformed repo config", () => {
  const repoRoot = mkTempRepo();
  const configDir = path.join(repoRoot, "config");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(path.join(configDir, "llm-router.yml"), [
    "mode: not_rules_first",
    "requireFreeModels: true",
    "maxFallbacks: 2",
    "defaultModel: openrouter/free",
    "fallbackModel: openai/gpt-oss-120b:free",
    "rules:",
    "  - taskType: coding",
    "    keywords: [code]",
    "    model: coding-primary:free",
    "  - taskType: repo_review",
    "    keywords: [review]",
    "    model: repo-review-primary:free",
    "  - taskType: architecture",
    "    keywords: [architecture]",
    "    model: architecture-primary:free",
    "  - taskType: deep_reasoning",
    "    keywords: [reason]",
    "    model: reason-primary:free",
    "  - taskType: long_context",
    "    keywords: [summary]",
    "    model: context-primary:free",
    "  - taskType: ui_review",
    "    keywords: [ui]",
    "    model: ui-primary:free",
    "  - taskType: daily",
    "    keywords: []",
    "    model: daily-primary:free"
  ].join("\n"));

  assert.throws(
    () => loadLlmRouterPolicy({
      LLM_ROUTER_ENABLED: "true"
    }, { repoRoot }),
    /rules_first mode/
  );
});

function mkTempRepo() {
  const root = path.join(tmpdir(), `mosaicstacked-router-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });

  return root;
}
