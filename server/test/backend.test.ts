import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import { createOpenRouterClient } from "../src/lib/openrouter.js";
import { createMockMatrixClient, createMockOpenRouterClient, createTestEnv, createTestMatrixConfig } from "../test-support/helpers.js";

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

test("health and models return backend-owned metadata", async (t) => {
  const env = createTestEnv();
  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const healthResponse = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(healthResponse.statusCode, 200);
  assert.deepEqual(JSON.parse(healthResponse.body), {
    ok: true,
    service: env.APP_NAME,
    mode: "local",
    upstream: "openrouter",
    defaultModel: "default",
    allowedModelCount: 1,
    streaming: "sse"
  });

  const modelResponse = await app.inject({
    method: "GET",
    url: "/models"
  });

  assert.equal(modelResponse.statusCode, 200);
  const modelsPayload = JSON.parse(modelResponse.body) as {
    ok: boolean;
    defaultModel: string;
    models: string[];
    source: string;
    registry: Array<{ alias: string; label: string }>;
  };
  assert.equal(modelsPayload.ok, true);
  assert.equal(modelsPayload.defaultModel, "default");
  assert.deepEqual(modelsPayload.models, ["default"]);
  assert.equal(modelsPayload.source, "backend-policy");
  assert.equal(modelsPayload.registry[0]?.alias, "default");
  assert.equal(typeof modelsPayload.registry[0]?.label, "string");
});

test("server boots Matrix read-only routes without an OpenRouter key and chat fails closed", async (t) => {
  const env = createTestEnv({
    OPENROUTER_API_KEY: ""
  });
  let fetchCalls = 0;
  const app = createApp({
    env,
    openRouter: createOpenRouterClient({
      env,
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("fetch should not be called without an api key");
      }
    }),
    matrixConfig: createTestMatrixConfig(),
    matrixClient: createMockMatrixClient(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const healthResponse = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(healthResponse.statusCode, 200);

  const modelsResponse = await app.inject({
    method: "GET",
    url: "/models"
  });

  assert.equal(modelsResponse.statusCode, 200);

  const whoamiResponse = await app.inject({
    method: "GET",
    url: "/api/matrix/whoami"
  });

  assert.equal(whoamiResponse.statusCode, 200);
  assert.deepEqual(JSON.parse(whoamiResponse.body), {
    ok: true,
    userId: "@user:matrix.example",
    deviceId: "DEVICE",
    homeserver: "http://matrix.example"
  });

  const chatResponse = await app.inject({
    method: "POST",
    url: "/chat",
    payload: {
      messages: [
        {
          role: "user",
          content: "Hello"
        }
      ]
    }
  });

  assert.equal(chatResponse.statusCode, 503);
  assert.deepEqual(JSON.parse(chatResponse.body), {
    ok: false,
    error: {
      code: "upstream_error",
      message: "OpenRouter API key is not configured"
    }
  });
  assert.equal(fetchCalls, 0);
});

test("/chat rejects invalid payloads with a sanitized 400", async (t) => {
  const app = createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/chat",
    payload: {
      stream: false,
      messages: [
        {
          role: "system",
          content: "nope"
        }
      ]
    }
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.body), {
    ok: false,
    error: {
      code: "invalid_request",
      message: "Invalid chat request"
    }
  });
});

test("/chat rejects unsupported public model aliases with a sanitized 400", async (t) => {
  const app = createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient({
      createChatCompletion: async () => {
        throw new Error("should not be called");
      }
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
      model: "openrouter/auto",
      messages: [
        {
          role: "user",
          content: "Hello"
        }
      ]
    }
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.body), {
    ok: false,
    error: {
      code: "invalid_request",
      message: "Invalid chat request"
    }
  });
});

test("/chat returns the non-stream response shape and sanitizes provider failures", async (t) => {
  const env = createTestEnv();
  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient({
      createChatCompletion: async (request, selection) => {
        assert.equal(request.stream, false);
        assert.equal(selection.publicModelId, "default");
        assert.equal(selection.logicalModelId, "stable-free-default");
        assert.deepEqual(selection.providerTargets, [
          "openrouter/auto",
          "meta-llama/llama-3.3-70b-instruct:free",
          "google/gemma-4-31b-it:free"
        ]);
        assert.deepEqual(request.messages, [
          {
            role: "user",
            content: "Hello"
          }
        ]);

        return {
          model: selection.publicModelId,
          text: "Hello back"
        };
      }
    }),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const successResponse = await app.inject({
    method: "POST",
    url: "/chat",
    payload: {
      messages: [
        {
          role: "user",
          content: "Hello"
        }
      ]
    }
  });

  assert.equal(successResponse.statusCode, 200);
  const successPayload = JSON.parse(successResponse.body) as {
    ok: boolean;
    model: string;
    text: string;
    route: {
      selectedAlias: string;
      fallbackUsed: boolean;
      degraded: boolean;
      streaming: boolean;
    };
  };
  assert.equal(successPayload.ok, true);
  assert.equal(successPayload.model, "default");
  assert.equal(successPayload.text, "Hello back");
  assert.equal(successPayload.route.selectedAlias, "default");
  assert.equal(successPayload.route.streaming, false);

  const failingApp = createApp({
    env,
    openRouter: createMockOpenRouterClient({
      createChatCompletion: async () => {
        throw new Error("upstream exploded");
      }
    }),
    logger: false
  });

  t.after(async () => {
    await failingApp.close();
  });

  const failureResponse = await failingApp.inject({
    method: "POST",
    url: "/chat",
    payload: {
      messages: [
        {
          role: "user",
          content: "Hello"
        }
      ]
    }
  });

  assert.equal(failureResponse.statusCode, 502);
  assert.deepEqual(JSON.parse(failureResponse.body), {
    ok: false,
    error: {
      code: "upstream_error",
      message: "Chat provider request failed"
    }
  });
  assert.doesNotMatch(failureResponse.body, /upstream exploded/);
});

test("/chat streams start, token, done, and sanitized error frames", async (t) => {
  const env = createTestEnv();
  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient({
      relayChatCompletionStream: async (_request, selection, options) => {
        assert.equal(selection.publicModelId, "default");
        assert.equal(selection.logicalModelId, "stable-free-default");
        assert.deepEqual(selection.providerTargets, [
          "openrouter/auto",
          "meta-llama/llama-3.3-70b-instruct:free",
          "google/gemma-4-31b-it:free"
        ]);
        options.onToken("Hello");
        options.onToken(" world");

        return {
          model: selection.publicModelId,
          text: "Hello world"
        };
      }
    }),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const successResponse = await app.inject({
    method: "POST",
    url: "/chat",
    payload: {
      stream: true,
      messages: [
        {
          role: "user",
          content: "Stream please"
        }
      ]
    }
  });

  assert.equal(successResponse.statusCode, 200);
  assert.match(successResponse.headers["content-type"] ?? "", /text\/event-stream/);
  const successEvents = parseSseEvents(successResponse.body);
  assert.deepEqual(successEvents.map((event) => event.event), [
    "start",
    "route",
    "token",
    "token",
    "done"
  ]);
  assert.deepEqual(successEvents.map((event) => JSON.parse(event.data) as { model?: string }).map((event) => event.model), [
    "default",
    undefined,
    undefined,
    undefined,
    "default"
  ]);
  assert.ok(!successResponse.body.includes("event: delta"));

  const zeroTokenApp = createApp({
    env,
    openRouter: createMockOpenRouterClient({
      relayChatCompletionStream: async (_request, selection) => ({
        model: selection.publicModelId,
        text: ""
      })
    }),
    logger: false
  });

  t.after(async () => {
    await zeroTokenApp.close();
  });

  const zeroTokenResponse = await zeroTokenApp.inject({
    method: "POST",
    url: "/chat",
    payload: {
      stream: true,
      messages: [
        {
          role: "user",
          content: "Stream please"
        }
      ]
    }
  });

  assert.equal(zeroTokenResponse.statusCode, 200);
  const zeroTokenEvents = parseSseEvents(zeroTokenResponse.body);
  assert.deepEqual(zeroTokenEvents.map((event) => event.event), [
    "start",
    "route",
    "done"
  ]);
  assert.deepEqual(zeroTokenEvents.map((event) => JSON.parse(event.data) as { model?: string }).map((event) => event.model), [
    "default",
    undefined,
    "default"
  ]);
  assert.ok(!zeroTokenResponse.body.includes("event: token"));

  const failingApp = createApp({
    env,
    openRouter: createMockOpenRouterClient({
      relayChatCompletionStream: async () => {
        throw new Error("stream exploded");
      }
    }),
    logger: false
  });

  t.after(async () => {
    await failingApp.close();
  });

  const failureResponse = await failingApp.inject({
    method: "POST",
    url: "/chat",
    payload: {
      stream: true,
      messages: [
        {
          role: "user",
          content: "Stream please"
        }
      ]
    }
  });

  assert.equal(failureResponse.statusCode, 200);
  assert.match(failureResponse.headers["content-type"] ?? "", /text\/event-stream/);
  const failureEvents = parseSseEvents(failureResponse.body);
  assert.deepEqual(failureEvents.map((event) => event.event), [
    "start",
    "route",
    "error"
  ]);
  assert.deepEqual(failureEvents.map((event) => JSON.parse(event.data) as { model?: string; error?: { code?: string } }).map((event) => event.model), [
    "default",
    undefined,
    undefined
  ]);
  assert.deepEqual(JSON.parse(failureEvents[2].data), {
    ok: false,
    error: {
      code: "upstream_error",
      message: "Chat provider request failed"
    }
  });
  assert.ok(!failureResponse.body.includes("event: done"));
  assert.doesNotMatch(failureResponse.body, /stream exploded/);
});

test("/chat stream over HTTP always ends with exactly one terminal event", async (t) => {
  const env = createTestEnv();
  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient({
      relayChatCompletionStream: async (_request, selection, options) => {
        options.onToken("Hello");

        return {
          model: selection.publicModelId,
          text: "Hello"
        };
      }
    }),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  await app.listen({
    host: "127.0.0.1",
    port: 0
  });

  const address = app.server.address();

  if (!address || typeof address === "string") {
    throw new Error("Test server did not expose an address");
  }

  const successResponse = await fetch(`http://127.0.0.1:${address.port}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      stream: true,
      messages: [
        {
          role: "user",
          content: "Stream please"
        }
      ]
    })
  });

  assert.equal(successResponse.status, 200);
  assert.match(successResponse.headers.get("content-type") ?? "", /text\/event-stream/);
  const successEvents = parseSseEvents(await successResponse.text());
  assert.deepEqual(successEvents.map((event) => event.event), [
    "start",
    "route",
    "token",
    "done"
  ]);
  assert.deepEqual(successEvents.map((event) => JSON.parse(event.data) as { model?: string }).map((event) => event.model), [
    "default",
    undefined,
    undefined,
    "default"
  ]);

  const failingApp = createApp({
    env,
    openRouter: createMockOpenRouterClient({
      relayChatCompletionStream: async () => {
        throw new Error("stream exploded");
      }
    }),
    logger: false
  });

  t.after(async () => {
    await failingApp.close();
  });

  await failingApp.listen({
    host: "127.0.0.1",
    port: 0
  });

  const failingAddress = failingApp.server.address();

  if (!failingAddress || typeof failingAddress === "string") {
    throw new Error("Failing test server did not expose an address");
  }

  const failureResponse = await fetch(`http://127.0.0.1:${failingAddress.port}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      stream: true,
      messages: [
        {
          role: "user",
          content: "Stream please"
        }
      ]
    })
  });

  assert.equal(failureResponse.status, 200);
  assert.match(failureResponse.headers.get("content-type") ?? "", /text\/event-stream/);
  const failureEvents = parseSseEvents(await failureResponse.text());
  assert.deepEqual(failureEvents.map((event) => event.event), [
    "start",
    "route",
    "error"
  ]);
  assert.deepEqual(JSON.parse(failureEvents[2].data), {
    ok: false,
    error: {
      code: "upstream_error",
      message: "Chat provider request failed"
    }
  });
});
