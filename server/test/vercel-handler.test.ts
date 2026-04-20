import assert from "node:assert/strict";
import test from "node:test";
import { createVercelEnv, normalizeVercelRequestUrl } from "../../api/_handler.ts";

test("vercel handler preserves matrix routes and strips the /api prefix for root API calls", () => {
  assert.equal(normalizeVercelRequestUrl("/api/chat"), "/chat");
  assert.equal(normalizeVercelRequestUrl("/api/models?include=all"), "/models?include=all");
  assert.equal(normalizeVercelRequestUrl("/api/health"), "/health");
  assert.equal(normalizeVercelRequestUrl("/api/auth/login"), "/api/auth/login");
  assert.equal(normalizeVercelRequestUrl("/api/auth/me?x=1"), "/api/auth/me?x=1");
  assert.equal(normalizeVercelRequestUrl("/api/matrix/whoami"), "/api/matrix/whoami");
  assert.equal(normalizeVercelRequestUrl("/api/matrix/actions/plan/verify?x=1"), "/api/matrix/actions/plan/verify?x=1");
  assert.equal(normalizeVercelRequestUrl("/api/github/repos"), "/api/github/repos");
  assert.equal(normalizeVercelRequestUrl("/api/github/repos/acme/widget/tree?ref=main"), "/api/github/repos/acme/widget/tree?ref=main");
});

test("vercel env forwards all specialized OpenRouter api keys", () => {
  const env = createVercelEnv({
    OPENROUTER_API_KEY: "default-key",
    OPENROUTER_API_KEY_QWEN3_CODER: "qwen-key",
    OPENROUTER_API_KEY_GPT_OSS_120B_PLANNER: "planner-key",
    OPENROUTER_API_KEY_NEMOTRON_3_SUPER_120B: "nemotron-key"
  });

  assert.equal(env.OPENROUTER_API_KEY, "default-key");
  assert.equal(env.OPENROUTER_API_KEY_QWEN3_CODER, "qwen-key");
  assert.equal(env.OPENROUTER_API_KEY_GPT_OSS_120B_PLANNER, "planner-key");
  assert.equal(env.OPENROUTER_API_KEY_NEMOTRON_3_SUPER_120B, "nemotron-key");
});
