import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import { createMockOpenRouterClient, createTestEnv } from "../test-support/helpers.js";
import { OpenRouterError } from "../src/lib/openrouter.js";
import type { LlmRouterPolicy, LlmRouterRule } from "../src/lib/llm-router.js";

function parseSseEvents(body: string) {
  return body
    .trim()
    .split(/\n\n/)
    .filter(Boolean)
    .map((block) => {
      const lines = block.split(/\r?\n/).filter(Boolean);
      const eventLine = lines.find((line) => line.startsWith("event:"));
      const data = lines
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");

      return {
        event: eventLine ? eventLine.slice(6).trimStart() : "message",
        data
      };
    });
}

const ROUTER_RULES: LlmRouterRule[] = [
  { taskType: "coding", keywords: ["code", "build"], model: "coding-primary:free" },
  { taskType: "repo_review", keywords: ["review", "pull request"], model: "repo-review-primary:free" },
  { taskType: "daily", keywords: [], model: "daily-primary:free" }
];

function createRouterPolicy(overrides: Partial<LlmRouterPolicy> = {}): LlmRouterPolicy {
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
      enabled: false,
      routerLogPath: ".local-ai/logs/ROUTER_DECISIONS.log.md",
      modelRunLogPath: ".local-ai/logs/MODEL_RUNS.log.md",
      promptEvidenceLogPath: ".local-ai/logs/PROMPT_EVIDENCE.log.md"
    }
  };
}

test("chat router disabled preserves existing provider target behavior", async (t) => {
  const env = createTestEnv({
    OPENROUTER_MODEL: "openrouter/auto",
    OPENROUTER_MODELS: ["anthropic/claude-3.5-sonnet"]
  });
  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient({
      createChatCompletion: async (request, selection) => {
        assert.equal(request.stream, false);
        assert.equal(selection.publicModelId, "default");
        assert.deepEqual(selection.providerTargets, [
          "openrouter/auto",
          "anthropic/claude-3.5-sonnet"
        ]);

        return {
          model: selection.publicModelId,
          text: "disabled path"
        };
      }
    }),
    llmRouterPolicy: createRouterPolicy({
      enabled: false
    }),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
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

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    ok: true,
    model: "default",
    text: "disabled path"
  });
  assert.doesNotMatch(response.body, /coding-primary:free|repo-review-primary:free/);
});

test("chat router enabled selects the coding model for coding prompts", async (t) => {
  const env = createTestEnv({
    OPENROUTER_MODEL: "openrouter/auto",
    OPENROUTER_MODELS: ["anthropic/claude-3.5-sonnet"]
  });
  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient({
      createChatCompletion: async (request, selection) => {
        assert.equal(request.stream, false);
        assert.equal(selection.publicModelId, "default");
        assert.equal(selection.providerTargets[0], "coding-primary:free");
        assert.ok(selection.providerTargets.includes("default-fallback:free"));

        return {
          model: selection.publicModelId,
          text: "routed coding"
        };
      }
    }),
    llmRouterPolicy: createRouterPolicy({
      enabled: true,
      requireFreeModels: false
    }),
    logger: false
  });

  t.after(async () => {
    await app.close();
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
    text: "routed coding"
  });
  assert.doesNotMatch(response.body, /coding-primary:free/);
});

test("chat router enabled selects the repo review model for review prompts", async (t) => {
  const env = createTestEnv({
    OPENROUTER_MODEL: "openrouter/auto",
    OPENROUTER_MODELS: ["anthropic/claude-3.5-sonnet"]
  });
  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient({
      createChatCompletion: async (request, selection) => {
        assert.equal(request.stream, false);
        assert.equal(selection.publicModelId, "default");
        assert.equal(selection.providerTargets[0], "repo-review-primary:free");

        return {
          model: selection.publicModelId,
          text: "routed review"
        };
      }
    }),
    llmRouterPolicy: createRouterPolicy({
      enabled: true,
      requireFreeModels: false
    }),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
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

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    ok: true,
    model: "default",
    text: "routed review"
  });
  assert.doesNotMatch(response.body, /repo-review-primary:free/);
});

test("chat router enabled fails closed when free-model enforcement removes every candidate", async (t) => {
  let called = false;
  const env = createTestEnv({
    OPENROUTER_MODEL: "openrouter/auto",
    OPENROUTER_MODELS: ["anthropic/claude-3.5-sonnet"]
  });
  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient({
      createChatCompletion: async () => {
        called = true;
        throw new Error("should not be called");
      }
    }),
    llmRouterPolicy: createRouterPolicy({
      enabled: true,
      requireFreeModels: true,
      defaultModel: "default-nonfree",
      fallbackModel: "fallback-nonfree",
      rules: [
        { taskType: "coding", keywords: ["code", "build"], model: "coding-nonfree" },
        { taskType: "repo_review", keywords: ["review"], model: "review-nonfree" },
        { taskType: "daily", keywords: [], model: "daily-nonfree" }
      ]
    }),
    logger: false
  });

  t.after(async () => {
    await app.close();
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

  assert.equal(called, false);
  assert.equal(response.statusCode, 502);
  assert.deepEqual(JSON.parse(response.body), {
    ok: false,
    error: {
      code: "upstream_error",
      message: "Chat provider request failed"
    }
  });
  assert.doesNotMatch(response.body, /coding-nonfree|review-nonfree|daily-nonfree/);
});

test("chat router surfaces upstream openrouter failures with their specific message", async (t) => {
  const env = createTestEnv({
    OPENROUTER_MODEL: "openrouter/auto",
    OPENROUTER_MODELS: ["anthropic/claude-3.5-sonnet"]
  });
  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient({
      createChatCompletion: async () => {
        throw new OpenRouterError("OpenRouter API key OPENROUTER_API_KEY_QWEN3_CODER is not configured for qwen/qwen3-coder", 503);
      }
    }),
    llmRouterPolicy: createRouterPolicy({
      enabled: false
    }),
    logger: false
  });

  t.after(async () => {
    await app.close();
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

  assert.equal(response.statusCode, 503);
  assert.deepEqual(JSON.parse(response.body), {
    ok: false,
    error: {
      code: "upstream_error",
      message: "OpenRouter API key OPENROUTER_API_KEY_QWEN3_CODER is not configured for qwen/qwen3-coder"
    }
  });
});

test("chat router enabled streaming still terminates with exactly one final event", async (t) => {
  const env = createTestEnv({
    OPENROUTER_MODEL: "openrouter/auto",
    OPENROUTER_MODELS: ["anthropic/claude-3.5-sonnet"]
  });
  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient({
      relayChatCompletionStream: async (_request, selection, options) => {
        assert.equal(selection.publicModelId, "default");
        assert.equal(selection.providerTargets[0], "coding-primary:free");
        options.onToken("Hello");

        return {
          model: selection.publicModelId,
          text: "Hello"
        };
      }
    }),
    llmRouterPolicy: createRouterPolicy({
      enabled: true,
      requireFreeModels: false
    }),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/chat",
    payload: {
      stream: true,
      messages: [
        {
          role: "user",
          content: "please code this"
        }
      ]
    }
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] ?? "", /text\/event-stream/);
  const events = parseSseEvents(response.body);
  assert.deepEqual(events.map((event) => event.event), [
    "start",
    "token",
    "done"
  ]);
  assert.deepEqual(events.map((event) => JSON.parse(event.data) as { model?: string }).map((event) => event.model), [
    "default",
    undefined,
    "default"
  ]);
  assert.doesNotMatch(response.body, /coding-primary:free/);
});

test("chat router surfaces upstream openrouter failures in streaming responses", async (t) => {
  const env = createTestEnv({
    OPENROUTER_MODEL: "openrouter/auto",
    OPENROUTER_MODELS: ["anthropic/claude-3.5-sonnet"]
  });
  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient({
      relayChatCompletionStream: async () => {
        throw new OpenRouterError("OpenRouter API key OPENROUTER_API_KEY_QWEN3_CODER is not configured for qwen/qwen3-coder", 503);
      }
    }),
    llmRouterPolicy: createRouterPolicy({
      enabled: false
    }),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/chat",
    payload: {
      stream: true,
      messages: [
        {
          role: "user",
          content: "please code this"
        }
      ]
    }
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] ?? "", /text\/event-stream/);
  const events = parseSseEvents(response.body);
  assert.deepEqual(events.map((event) => event.event), [
    "start",
    "error"
  ]);
  assert.equal(JSON.parse(events[1].data).error.message, "OpenRouter API key OPENROUTER_API_KEY_QWEN3_CODER is not configured for qwen/qwen3-coder");
});
