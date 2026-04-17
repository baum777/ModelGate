import assert from "node:assert/strict";
import test from "node:test";
import { OpenRouterError, createOpenRouterClient } from "../src/lib/openrouter.js";
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
