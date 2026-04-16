import assert from "node:assert/strict";
import test from "node:test";
import { createEnv } from "../src/lib/env.js";

test("env parsing allows Matrix-only startup without an OpenRouter key", () => {
  const env = createEnv({
    PORT: "8787",
    HOST: "127.0.0.1",
    OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
    OPENROUTER_MODEL: "openrouter/auto",
    OPENROUTER_MODELS: "",
    APP_NAME: "modelgate-test",
    DEFAULT_SYSTEM_PROMPT: "prompt",
    CORS_ORIGINS: "http://localhost:5173"
  });

  assert.equal(env.OPENROUTER_API_KEY, "");
  assert.equal(env.PORT, 8787);
  assert.equal(env.HOST, "127.0.0.1");
  assert.equal(env.APP_NAME, "modelgate-test");
});
