import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import { createMockOpenRouterClient, createTestEnv } from "../test-support/helpers.js";

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
  assert.deepEqual(JSON.parse(modelResponse.body), {
    ok: true,
    defaultModel: "default",
    models: ["default"],
    source: "backend-policy"
  });
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
          "anthropic/claude-3.5-sonnet"
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
  assert.deepEqual(JSON.parse(successResponse.body), {
    ok: true,
    model: "default",
    text: "Hello back"
  });

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
          "anthropic/claude-3.5-sonnet"
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
    "token",
    "token",
    "done"
  ]);
  assert.deepEqual(successEvents.map((event) => JSON.parse(event.data) as { model?: string }).map((event) => event.model), [
    "default",
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
    "done"
  ]);
  assert.deepEqual(zeroTokenEvents.map((event) => JSON.parse(event.data) as { model?: string }).map((event) => event.model), [
    "default",
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
    "error"
  ]);
  assert.deepEqual(failureEvents.map((event) => JSON.parse(event.data) as { model?: string; error?: { code?: string } }).map((event) => event.model), [
    "default",
    undefined
  ]);
  assert.deepEqual(JSON.parse(failureEvents[1].data), {
    ok: false,
    error: {
      code: "upstream_error",
      message: "Chat provider request failed"
    }
  });
  assert.ok(!failureResponse.body.includes("event: done"));
  assert.doesNotMatch(failureResponse.body, /stream exploded/);
});
