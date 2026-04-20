import assert from "node:assert/strict";
import test from "node:test";
import type { AppEnv } from "../src/lib/env.js";
import { OpenRouterError, createOpenRouterClient, resolveOpenRouterApiKey } from "../src/lib/openrouter.js";
import { createTestEnv } from "../test-support/helpers.js";

function parseRequestBody(init: RequestInit | undefined) {
  if (typeof init?.body === "string") {
    return JSON.parse(init.body) as { model?: string; stream?: boolean };
  }

  if (init?.body) {
    return JSON.parse(String(init.body)) as { model?: string; stream?: boolean };
  }

  return {};
}

function readAuthorizationHeader(init: RequestInit | undefined) {
  return new Headers(init?.headers).get("authorization");
}

test("openrouter key resolver uses the qwen-specific key for qwen models", () => {
  const env = createTestEnv({
    OPENROUTER_API_KEY: "default-key",
    OPENROUTER_API_KEY_QWEN3_CODER: "qwen-key"
  });

  assert.equal(resolveOpenRouterApiKey(env, "qwen/qwen3-coder:free"), "qwen-key");
});

test("openrouter key resolver uses the planner-specific key for gpt-oss planner models", () => {
  const env = createTestEnv({
    OPENROUTER_API_KEY: "default-key",
    OPENROUTER_API_KEY_GPT_OSS_120B_PLANNER: "planner-key"
  });

  assert.equal(resolveOpenRouterApiKey(env, "openai/gpt-oss-120b:free"), "planner-key");
});

test("openrouter key resolver uses the nemotron-specific key for nemotron models", () => {
  const env = createTestEnv({
    OPENROUTER_API_KEY: "default-key",
    OPENROUTER_API_KEY_NEMOTRON_3_SUPER_120B: "nemotron-key"
  });

  assert.equal(resolveOpenRouterApiKey(env, "nvidia/nemotron-3-super-120b-a12b:free"), "nemotron-key");
});

test("openrouter key resolver uses the default key for standard models", () => {
  const env = createTestEnv({
    OPENROUTER_API_KEY: "default-key"
  });

  assert.equal(resolveOpenRouterApiKey(env, "anthropic/claude-3.5-sonnet"), "default-key");
});

test("openrouter key resolver fails closed when a specialized key is missing", () => {
  const env = createTestEnv({
    OPENROUTER_API_KEY: "default-key",
    OPENROUTER_API_KEY_QWEN3_CODER: ""
  });

  assert.throws(
    () => resolveOpenRouterApiKey(env, "qwen/qwen3-coder:free"),
    (error) => error instanceof OpenRouterError
      && error.status === 503
      && error.message === "OpenRouter API key OPENROUTER_API_KEY_QWEN3_CODER is not configured for qwen/qwen3-coder"
  );
});

test("openrouter client retries hidden provider targets and returns the public model alias", async () => {
  const env = createTestEnv({
    OPENROUTER_MODEL: "openrouter/auto",
    OPENROUTER_MODELS: ["anthropic/claude-3.5-sonnet"]
  });

  const calls: string[] = [];

  const fetchImpl: typeof fetch = async (_url, init) => {
    const body = parseRequestBody(init);
    calls.push(`${body.stream ? "stream" : "chat"}:${body.model}`);

    if (body.model === "openrouter/auto") {
      return new Response("upstream unavailable", { status: 503 });
    }

    if (body.model === "anthropic/claude-3.5-sonnet" && body.stream) {
      return new Response(
        [
          `data: ${JSON.stringify({ choices: [{ delta: { content: "Hello" } }] })}`,
          "",
          `data: ${JSON.stringify({ choices: [{ delta: { content: " world" } }] })}`,
          "",
          `data: ${JSON.stringify({ choices: [{ finish_reason: "stop" }] })}`,
          "",
          "data: [DONE]",
          ""
        ].join("\n"),
        {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8"
          }
        }
      );
    }

    if (body.model === "anthropic/claude-3.5-sonnet") {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "fallback text"
              }
            }
          ]
        }),
        {
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    return new Response("unexpected target", { status: 500 });
  };

  const client = createOpenRouterClient({
    env,
    fetchImpl
  });

  const selection = {
    publicModelId: "default",
    logicalModelId: "stable-free-default",
    providerTargets: [
      "openrouter/auto",
      "anthropic/claude-3.5-sonnet"
    ]
  };

  const nonStreamResult = await client.createChatCompletion(
    {
      messages: [
        {
          role: "user",
          content: "Hello"
        }
      ],
      stream: false
    },
    selection
  );

  assert.deepEqual(nonStreamResult, {
    model: "default",
    text: "fallback text"
  });
  assert.deepEqual(calls, [
    "chat:openrouter/auto",
    "chat:anthropic/claude-3.5-sonnet"
  ]);

  calls.length = 0;

  const streamedTokens: string[] = [];
  const streamResult = await client.relayChatCompletionStream(
    {
      messages: [
        {
          role: "user",
          content: "Stream please"
        }
      ],
      stream: true
    },
    selection,
    {
      onToken: (delta) => {
        streamedTokens.push(delta);
      }
    }
  );

  assert.deepEqual(streamResult, {
    model: "default",
    text: "Hello world"
  });
  assert.deepEqual(streamedTokens, ["Hello", " world"]);
  assert.deepEqual(calls, [
    "stream:openrouter/auto",
    "stream:anthropic/claude-3.5-sonnet"
  ]);
});

test("openrouter client fails closed when the api key is missing", async () => {
  let fetchCalls = 0;

  const client = createOpenRouterClient({
    env: createTestEnv({
      OPENROUTER_API_KEY: ""
    }),
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("fetch should not be called without an api key");
    }
  });

  await assert.rejects(
    client.createChatCompletion(
      {
        messages: [
          {
            role: "user",
            content: "Hello"
          }
        ],
        stream: false
      },
      {
        publicModelId: "default",
        logicalModelId: "stable-free-default",
        providerTargets: ["openrouter/auto"]
      }
    ),
    (error) => error instanceof OpenRouterError && error.status === 503 && error.message === "OpenRouter API key is not configured"
  );

  await assert.rejects(
    client.relayChatCompletionStream(
      {
        messages: [
          {
            role: "user",
            content: "Stream please"
          }
        ],
        stream: true
      },
      {
        publicModelId: "default",
        logicalModelId: "stable-free-default",
        providerTargets: ["openrouter/auto"]
      },
      {
        onToken: () => {}
      }
    ),
    (error) => error instanceof OpenRouterError && error.status === 503 && error.message === "OpenRouter API key is not configured"
  );

  assert.equal(fetchCalls, 0);
});

test("openrouter client sends the qwen-specific key to upstream requests", async () => {
  const env = createTestEnv({
    OPENROUTER_API_KEY: "default-key",
    OPENROUTER_API_KEY_QWEN3_CODER: "qwen-key"
  });

  const seenHeaders: Array<string | null> = [];

  const client = createOpenRouterClient({
    env,
    fetchImpl: async (_url, init) => {
      seenHeaders.push(readAuthorizationHeader(init));

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "ok"
              }
            }
          ]
        }),
        {
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }
  });

  const result = await client.createChatCompletion(
    {
      messages: [
        {
          role: "user",
          content: "Hello"
        }
      ],
      stream: false
    },
    {
      publicModelId: "default",
      logicalModelId: "stable-free-default",
      providerTargets: ["qwen/qwen3-coder:free"]
    }
  );

  assert.equal(result.text, "ok");
  assert.deepEqual(seenHeaders, ["Bearer qwen-key"]);
});

test("openrouter client does not fall back to the default key for specialized models", async () => {
  const env = createTestEnv({
    OPENROUTER_API_KEY: "default-key",
    OPENROUTER_API_KEY_QWEN3_CODER: ""
  });

  let fetchCalls = 0;
  const client = createOpenRouterClient({
    env,
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("fetch should not be called when a specialized key is missing");
    }
  });

  await assert.rejects(
    client.createChatCompletion(
      {
        messages: [
          {
            role: "user",
            content: "Hello"
          }
        ],
        stream: false
      },
      {
        publicModelId: "default",
        logicalModelId: "stable-free-default",
        providerTargets: ["qwen/qwen3-coder:free", "openrouter/auto"]
      }
    ),
    (error) => error instanceof OpenRouterError
      && error.status === 503
      && error.message === "OpenRouter API key OPENROUTER_API_KEY_QWEN3_CODER is not configured for qwen/qwen3-coder"
  );

  assert.equal(fetchCalls, 0);
});

test("openrouter key resolver fails closed when a specialized key property is absent", () => {
  const env = {
    OPENROUTER_API_KEY: "default-key"
  } as AppEnv;

  assert.throws(
    () => resolveOpenRouterApiKey(env, "qwen/qwen3-coder:free"),
    (error) => error instanceof OpenRouterError
      && error.status === 503
      && error.message === "OpenRouter API key OPENROUTER_API_KEY_QWEN3_CODER is not configured for qwen/qwen3-coder"
  );
});

test("openrouter client times out upstream requests and aborts cleanly", async () => {
  const env = createTestEnv({
    OPENROUTER_REQUEST_TIMEOUT_MS: 250
  });
  let fetchCalls = 0;

  const client = createOpenRouterClient({
    env,
    fetchImpl: async (_url, init) => {
      fetchCalls += 1;

      return await new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;

        if (signal?.aborted) {
          reject(Object.assign(new Error("AbortError"), { name: "AbortError" }));
          return;
        }

        signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("AbortError"), { name: "AbortError" }));
        }, { once: true });
      });
    }
  });

  await assert.rejects(
    client.createChatCompletion(
      {
        messages: [
          {
            role: "user",
            content: "Hello"
          }
        ],
        stream: false
      },
      {
        publicModelId: "default",
        logicalModelId: "stable-free-default",
        providerTargets: ["openrouter/auto"]
      }
    ),
    (error) => error instanceof OpenRouterError && error.status === 504 && error.message === "OpenRouter request timed out"
  );

  assert.equal(fetchCalls, 1);
});
