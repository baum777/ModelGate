import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import { createMockOpenRouterClient, createTestEnv } from "../test-support/helpers.js";

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
    defaultModel: env.OPENROUTER_MODEL,
    allowedModelCount: 2,
    streaming: "sse"
  });

  const modelResponse = await app.inject({
    method: "GET",
    url: "/models"
  });

  assert.equal(modelResponse.statusCode, 200);
  assert.deepEqual(JSON.parse(modelResponse.body), {
    ok: true,
    defaultModel: env.OPENROUTER_MODEL,
    models: ["openrouter/auto", "anthropic/claude-3.5-sonnet"],
    source: "local-config"
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

test("/chat returns the non-stream response shape and sanitizes provider failures", async (t) => {
  const env = createTestEnv();
  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient({
      createChatCompletion: async (request) => {
        assert.equal(request.stream, false);
        assert.deepEqual(request.messages, [
          {
            role: "user",
            content: "Hello"
          }
        ]);

        return {
          model: "openrouter/auto",
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
    model: "openrouter/auto",
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
      relayChatCompletionStream: async (_request, options) => {
        options.onToken("Hello");
        options.onToken(" world");

        return {
          model: "openrouter/auto",
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
  assert.ok(successResponse.body.includes("event: start"));
  assert.ok(successResponse.body.includes("event: token"));
  assert.ok(successResponse.body.includes("event: done"));
  assert.ok(successResponse.body.indexOf("event: start") < successResponse.body.indexOf("event: token"));
  assert.ok(successResponse.body.indexOf("event: token") < successResponse.body.indexOf("event: done"));
  assert.ok(!successResponse.body.includes("event: delta"));

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
  assert.ok(failureResponse.body.includes("event: start"));
  assert.ok(failureResponse.body.includes("event: error"));
  assert.doesNotMatch(failureResponse.body, /stream exploded/);
});
