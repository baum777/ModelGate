import assert from "node:assert/strict";
import test from "node:test";
import { createVercelRuntimeConfig, normalizeVercelRequestUrl } from "../../api/_handler.ts";
import { createRuntimeConfig } from "../src/runtime/create-runtime-config.js";

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

test("local and vercel runtime builders normalize env from one shared source", () => {
  const source: NodeJS.ProcessEnv = {
    PORT: "9876",
    HOST: "0.0.0.0",
    OPENROUTER_API_KEY: "default-key",
    OPENROUTER_API_KEY_QWEN3_CODER: "qwen-key",
    OPENROUTER_API_KEY_GPT_OSS_120B_PLANNER: "planner-key",
    OPENROUTER_API_KEY_NEMOTRON_3_SUPER_120B: "nemotron-key",
    CHAT_MODEL: "google/gemma-4-31b-it:free",
    OPENROUTER_MODEL: "openrouter/auto",
    OPENROUTER_MODELS: "openrouter/auto,anthropic/claude-3.5-sonnet",
    GITHUB_ALLOWED_REPOS: "acme/widget"
  };
  const localRuntime = createRuntimeConfig({
    source,
    loadDotEnv: false
  });
  const vercelRuntime = createVercelRuntimeConfig(source);

  assert.equal(localRuntime.env.PORT, 9876);
  assert.equal(vercelRuntime.env.PORT, 9876);
  assert.equal(localRuntime.env.HOST, "0.0.0.0");
  assert.equal(vercelRuntime.env.HOST, "0.0.0.0");
  assert.deepEqual(localRuntime.env.OPENROUTER_MODELS, vercelRuntime.env.OPENROUTER_MODELS);
  assert.equal(localRuntime.env.CHAT_MODEL, vercelRuntime.env.CHAT_MODEL);
});
