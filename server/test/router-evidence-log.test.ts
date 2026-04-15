import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import { createApp } from "../src/app.js";
import { appendMarkdownEntry, buildRouterDecisionMarkdown, redactSensitiveText } from "../src/lib/local-evidence-log.js";
import { createMockOpenRouterClient, createTestEnv } from "../test-support/helpers.js";
import type { LlmRouterPolicy, LlmRouterRule } from "../src/lib/llm-router.js";

const ROUTER_RULES: LlmRouterRule[] = [
  { taskType: "coding", keywords: ["code", "implement"], model: "coding-primary:free" },
  { taskType: "repo_review", keywords: ["review", "pull request"], model: "repo-review-primary:free" },
  { taskType: "daily", keywords: [], model: "daily-primary:free" }
];

function createRouterPolicy(logPath: string, overrides: Partial<LlmRouterPolicy> = {}): LlmRouterPolicy {
  return {
    enabled: overrides.enabled ?? true,
    mode: "rules_first",
    requireFreeModels: overrides.requireFreeModels ?? false,
    maxFallbacks: overrides.maxFallbacks ?? 2,
    failClosed: overrides.failClosed ?? true,
    defaultModel: overrides.defaultModel ?? "default-fallback:free",
    fallbackModel: overrides.fallbackModel ?? "secondary-fallback:free",
    rules: overrides.rules ?? ROUTER_RULES,
    logging: overrides.logging ?? {
      enabled: true,
      routerLogPath: logPath,
      modelRunLogPath: path.join(path.dirname(logPath), "MODEL_RUNS.log.md"),
      promptEvidenceLogPath: path.join(path.dirname(logPath), "PROMPT_EVIDENCE.log.md")
    }
  };
}

function createTempRoot() {
  return mkdtempSync(path.join(os.tmpdir(), "modelgate-router-log-"));
}

test("redactSensitiveText redacts secrets and long token-like strings", () => {
  const redacted = redactSensitiveText([
    "Bearer sk-testsecretvalue",
    "Authorization: Bearer abcdefghijklmnopqrstuvwxyz1234567890",
    "sk-live-1234567890abcdef",
    "0123456789abcdef0123456789abcdef"
  ].join(" "));

  assert.doesNotMatch(redacted, /sk-testsecretvalue|sk-live-1234567890abcdef|abcdefghijklmnopqrstuvwxyz1234567890/);
  assert.doesNotMatch(redacted, /Authorization:\s*Bearer\s+[^[]+/i);
  assert.match(redacted, /\[REDACTED\]/);
});

test("buildRouterDecisionMarkdown omits raw prompts by default", () => {
  const markdown = buildRouterDecisionMarkdown({
    taskType: "coding",
    publicModelId: "default",
    providerModelId: "coding-primary:free",
    fallbackUsed: false,
    candidateCount: 2,
    reason: "matched_rule",
    result: "selected"
  });

  assert.match(markdown, /Prompt summary: omitted/);
  assert.match(markdown, /Selected public alias: default/);
  assert.match(markdown, /Selected provider model: coding-primary:free/);
});

test("buildRouterDecisionMarkdown redacts any provided prompt summary", () => {
  const markdown = buildRouterDecisionMarkdown({
    taskType: "coding",
    publicModelId: "default",
    providerModelId: "coding-primary:free",
    fallbackUsed: false,
    candidateCount: 2,
    reason: "matched_rule",
    result: "selected",
    promptSummary: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz1234567890 sk-live-1234567890abcdef"
  });

  assert.doesNotMatch(markdown, /abcdefghijklmnopqrstuvwxyz1234567890|sk-live-1234567890abcdef/);
  assert.match(markdown, /Prompt summary:/);
  assert.match(markdown, /\[REDACTED\]/);
});

test("appendMarkdownEntry appends rather than overwrites", async () => {
  const root = createTempRoot();
  const filePath = path.join(root, "logs", "ROUTER_DECISIONS.log.md");

  await appendMarkdownEntry(filePath, "### first\n- Result: selected\n");
  await appendMarkdownEntry(filePath, "### second\n- Result: selected\n");

  const content = readFileSync(filePath, "utf8");
  assert.match(content, /### first/);
  assert.match(content, /### second/);
  assert.equal((content.match(/### /g) ?? []).length, 2);
});

test("chat router logging disabled creates no evidence file", async (t) => {
  const root = createTempRoot();
  const logPath = path.join(root, "logs", "ROUTER_DECISIONS.log.md");
  const env = createTestEnv({
    OPENROUTER_MODEL: "openrouter/auto",
    OPENROUTER_MODELS: ["anthropic/claude-3.5-sonnet"]
  });

  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient({
      createChatCompletion: async (request, selection) => {
        assert.equal(selection.publicModelId, "default");
        return {
          model: selection.publicModelId,
          text: "ok"
        };
      }
    }),
    llmRouterPolicy: createRouterPolicy(logPath, {
      logging: {
        enabled: false,
        routerLogPath: logPath,
        modelRunLogPath: path.join(root, "MODEL_RUNS.log.md"),
        promptEvidenceLogPath: path.join(root, "PROMPT_EVIDENCE.log.md")
      }
    }),
    logger: false
  });

  t.after(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  const response = await app.inject({
    method: "POST",
    url: "/chat",
    payload: {
      messages: [
        {
          role: "user",
          content: "please code this"
        }
      ]
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(existsSync(logPath), false);
});

test("chat router logging enabled appends markdown evidence and preserves the public alias", async (t) => {
  const root = createTempRoot();
  const logPath = path.join(root, "logs", "ROUTER_DECISIONS.log.md");
  const env = createTestEnv({
    OPENROUTER_MODEL: "openrouter/auto",
    OPENROUTER_MODELS: ["anthropic/claude-3.5-sonnet"]
  });

  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient({
      createChatCompletion: async (_request, selection) => {
        return {
          model: selection.publicModelId,
          text: "logged"
        };
      }
    }),
    llmRouterPolicy: createRouterPolicy(logPath),
    logger: false
  });

  t.after(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  const firstResponse = await app.inject({
    method: "POST",
    url: "/chat",
    payload: {
      messages: [
        {
          role: "user",
          content: "please implement this"
        }
      ]
    }
  });

  assert.equal(firstResponse.statusCode, 200);
  assert.deepEqual(JSON.parse(firstResponse.body), {
    ok: true,
    model: "default",
    text: "logged"
  });
  assert.doesNotMatch(firstResponse.body, /coding-primary:free|repo-review-primary:free/);

  const secondResponse = await app.inject({
    method: "POST",
    url: "/chat",
    payload: {
      messages: [
        {
          role: "user",
          content: "please review this pull request"
        }
      ]
    }
  });

  assert.equal(secondResponse.statusCode, 200);
  assert.deepEqual(JSON.parse(secondResponse.body), {
    ok: true,
    model: "default",
    text: "logged"
  });
  assert.doesNotMatch(secondResponse.body, /coding-primary:free|repo-review-primary:free/);

  const content = readFileSync(logPath, "utf8");
  assert.match(content, /### /);
  assert.match(content, /Detected task type: coding/);
  assert.match(content, /Detected task type: repo_review/);
  assert.match(content, /Selected public alias: default/);
  assert.match(content, /Selected provider model: coding-primary:free/);
  assert.match(content, /Selected provider model: repo-review-primary:free/);
  assert.doesNotMatch(content, /please implement this|please review this pull request/);
  assert.equal((content.match(/### /g) ?? []).length, 2);
});

test("chat router logging failure does not break chat", async (t) => {
  const root = createTempRoot();
  const logPath = path.join(root, "logs", "ROUTER_DECISIONS.log.md");
  mkdirSync(logPath, { recursive: true });
  const env = createTestEnv({
    OPENROUTER_MODEL: "openrouter/auto",
    OPENROUTER_MODELS: ["anthropic/claude-3.5-sonnet"]
  });

  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient({
      createChatCompletion: async (_request, selection) => ({
        model: selection.publicModelId,
        text: "still ok"
      })
    }),
    llmRouterPolicy: createRouterPolicy(logPath),
    logger: false
  });

  t.after(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  const response = await app.inject({
    method: "POST",
    url: "/chat",
    payload: {
      messages: [
        {
          role: "user",
          content: "please code this"
        }
      ]
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    ok: true,
    model: "default",
    text: "still ok"
  });
  assert.doesNotMatch(response.body, /coding-primary:free|repo-review-primary:free/);
});
