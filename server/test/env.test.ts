import assert from "node:assert/strict";
import test from "node:test";
import { createEnv } from "../src/lib/env.js";

test("env parsing allows Matrix-only startup without an OpenRouter key", () => {
  const env = createEnv({
    PORT: "8787",
    HOST: "127.0.0.1",
    OPENROUTER_API_KEY: "",
    OPENROUTER_API_KEY_QWEN3_CODER: "qwen-key",
    OPENROUTER_API_KEY_GPT_OSS_120B_PLANNER: "planner-key",
    OPENROUTER_API_KEY_NEMOTRON_3_SUPER_120B: "nemotron-key",
    OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
    OPENROUTER_MODEL: "openrouter/auto",
    OPENROUTER_MODELS: "",
    APP_NAME: "modelgate-test",
    DEFAULT_SYSTEM_PROMPT: "prompt",
    CORS_ORIGINS: "http://localhost:5173",
    CHAT_MODEL: "google/gemma-4-31b-it:free",
    CODE_AGENT_MODEL: "qwen/qwen3-coder:free",
    STRUCTURED_PLAN_MODEL: "",
    MATRIX_ANALYZE_MODEL: "nvidia/nemotron-3-super-120b-a12b:free",
    FAST_FALLBACK_MODEL: "qwen/qwen3-next-80b-a3b-instruct:free",
    DIALOG_FALLBACK_MODEL: "meta-llama/llama-3.3-70b-instruct:free",
    MODEL_ROUTING_MODE: "policy",
    ALLOW_MODEL_FALLBACK: "true",
    MODEL_ROUTING_FAIL_CLOSED: "true",
    MODEL_ROUTING_LOG_ENABLED: "false",
    MODEL_ROUTING_LOG_PATH: ".local-ai/logs/WORKFLOW_MODEL_ROUTING.log.md",
    MATRIX_ANALYZE_LLM_ENABLED: "false",
    MATRIX_EXECUTE_APPROVAL_REQUIRED: "true",
    MATRIX_VERIFY_AFTER_EXECUTE: "true",
    MATRIX_ALLOWED_ACTION_TYPES: "set_room_topic",
    MATRIX_FAIL_CLOSED: "true",
    GITHUB_ACTION_STORE_MODE: "file",
    GITHUB_ACTION_STORE_FILE_PATH: ".local-ai/state/github-action-store.test.json",
    RATE_LIMIT_ENABLED: "true",
    RATE_LIMIT_WINDOW_MS: "60000",
    RATE_LIMIT_CHAT_MAX: "30",
    RATE_LIMIT_AUTH_LOGIN_MAX: "8",
    RATE_LIMIT_GITHUB_PROPOSE_MAX: "10",
    RATE_LIMIT_GITHUB_EXECUTE_MAX: "6",
    RATE_LIMIT_MATRIX_EXECUTE_MAX: "6",
    RATE_LIMIT_FAIL_CLOSED: "true",
    JOURNAL_ENABLED: "true",
    JOURNAL_STORE_MODE: "file",
    JOURNAL_FILE_PATH: ".local-ai/state/runtime-journal.test.json",
    JOURNAL_MAX_ENTRIES: "250",
    JOURNAL_EXPOSE_RECENT_LIMIT: "25",
    MODEL_GATE_ADMIN_PASSWORD: "admin-password",
    MODEL_GATE_SESSION_SECRET: "session-secret",
    MODEL_GATE_SESSION_TTL_SECONDS: "43200"
  });

  assert.equal(env.OPENROUTER_API_KEY, "");
  assert.equal(env.OPENROUTER_API_KEY_QWEN3_CODER, "qwen-key");
  assert.equal(env.OPENROUTER_API_KEY_GPT_OSS_120B_PLANNER, "planner-key");
  assert.equal(env.OPENROUTER_API_KEY_NEMOTRON_3_SUPER_120B, "nemotron-key");
  assert.equal(env.PORT, 8787);
  assert.equal(env.HOST, "127.0.0.1");
  assert.equal(env.APP_NAME, "modelgate-test");
  assert.equal(env.CHAT_MODEL, "google/gemma-4-31b-it:free");
  assert.equal(env.CODE_AGENT_MODEL, "qwen/qwen3-coder:free");
  assert.equal(env.STRUCTURED_PLAN_MODEL, "");
  assert.equal(env.MATRIX_ANALYZE_MODEL, "nvidia/nemotron-3-super-120b-a12b:free");
  assert.equal(env.FAST_FALLBACK_MODEL, "qwen/qwen3-next-80b-a3b-instruct:free");
  assert.equal(env.DIALOG_FALLBACK_MODEL, "meta-llama/llama-3.3-70b-instruct:free");
  assert.equal(env.MODEL_ROUTING_MODE, "policy");
  assert.equal(env.ALLOW_MODEL_FALLBACK, true);
  assert.equal(env.MODEL_ROUTING_FAIL_CLOSED, true);
  assert.equal(env.MODEL_ROUTING_LOG_ENABLED, false);
  assert.equal(env.MODEL_ROUTING_LOG_PATH, ".local-ai/logs/WORKFLOW_MODEL_ROUTING.log.md");
  assert.equal(env.MATRIX_ANALYZE_LLM_ENABLED, false);
  assert.equal(env.MATRIX_EXECUTE_APPROVAL_REQUIRED, true);
  assert.equal(env.MATRIX_VERIFY_AFTER_EXECUTE, true);
  assert.deepEqual(env.MATRIX_ALLOWED_ACTION_TYPES, ["set_room_topic"]);
  assert.equal(env.MATRIX_FAIL_CLOSED, true);
  assert.equal(env.GITHUB_ACTION_STORE_MODE, "file");
  assert.equal(env.GITHUB_ACTION_STORE_FILE_PATH, ".local-ai/state/github-action-store.test.json");
  assert.equal(env.RATE_LIMIT_ENABLED, true);
  assert.equal(env.RATE_LIMIT_WINDOW_MS, 60000);
  assert.equal(env.RATE_LIMIT_CHAT_MAX, 30);
  assert.equal(env.RATE_LIMIT_AUTH_LOGIN_MAX, 8);
  assert.equal(env.RATE_LIMIT_GITHUB_PROPOSE_MAX, 10);
  assert.equal(env.RATE_LIMIT_GITHUB_EXECUTE_MAX, 6);
  assert.equal(env.RATE_LIMIT_MATRIX_EXECUTE_MAX, 6);
  assert.equal(env.RATE_LIMIT_FAIL_CLOSED, true);
  assert.equal(env.JOURNAL_ENABLED, true);
  assert.equal(env.JOURNAL_STORE_MODE, "file");
  assert.equal(env.JOURNAL_FILE_PATH, ".local-ai/state/runtime-journal.test.json");
  assert.equal(env.JOURNAL_MAX_ENTRIES, 250);
  assert.equal(env.JOURNAL_EXPOSE_RECENT_LIMIT, 25);
  assert.equal(env.MODEL_GATE_ADMIN_PASSWORD, "admin-password");
  assert.equal(env.MODEL_GATE_SESSION_SECRET, "session-secret");
  assert.equal(env.MODEL_GATE_SESSION_TTL_SECONDS, 43200);
});

test("env parsing fails closed for malformed rate-limit numbers when configured", () => {
  assert.throws(() => createEnv({
    RATE_LIMIT_FAIL_CLOSED: "true",
    RATE_LIMIT_WINDOW_MS: "invalid"
  }), /RATE_LIMIT_WINDOW_MS must be a positive integer/);
});
