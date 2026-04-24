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

test("diagnostics returns safe observability data without exposing secret env values", async (t) => {
  const env = createTestEnv({
    OPENROUTER_API_KEY: "secret-openrouter-token",
    GITHUB_TOKEN: "secret-github-token",
    MODEL_GATE_ADMIN_PASSWORD: "secret-admin-password",
    MODEL_GATE_SESSION_SECRET: "secret-session-secret",
  });
  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/diagnostics"
  });

  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body) as {
    ok: boolean;
    service: string;
    runtimeMode: string;
    models: {
      defaultPublicAlias: string;
      publicAliases: string[];
    };
    routing: {
      mode: string;
      allowFallback: boolean;
      failClosed: boolean;
    };
    rateLimit: {
      enabled: boolean;
      limits: {
        chat: number;
      };
      blockedByScope: {
        chat: number;
      };
    };
    actionStore: {
      mode: "memory" | "file";
    };
    github: {
      configured: boolean;
      ready: boolean;
    };
    matrix: {
      configured: boolean;
      ready: boolean;
    };
    journal: {
      enabled: boolean;
      mode: "memory" | "file";
      maxEntries: number;
      exposeRecentLimit: number;
      recentCount: number;
    };
    counters: {
      chatRequests: number;
      chatStreamStarted: number;
      chatStreamCompleted: number;
      chatStreamError: number;
      chatStreamAborted: number;
      upstreamError: number;
    };
  };

  assert.equal(payload.ok, true);
  assert.equal(payload.service, env.APP_NAME);
  assert.equal(payload.runtimeMode, "local");
  assert.equal(payload.models.defaultPublicAlias, "default");
  assert.deepEqual(payload.models.publicAliases, ["default"]);
  assert.equal(payload.routing.mode, env.MODEL_ROUTING_MODE);
  assert.equal(payload.routing.allowFallback, env.ALLOW_MODEL_FALLBACK);
  assert.equal(payload.routing.failClosed, env.MODEL_ROUTING_FAIL_CLOSED);
  assert.equal(payload.rateLimit.enabled, env.RATE_LIMIT_ENABLED);
  assert.equal(payload.rateLimit.limits.chat, env.RATE_LIMIT_CHAT_MAX);
  assert.equal(payload.rateLimit.blockedByScope.chat, 0);
  assert.equal(payload.actionStore.mode, "memory");
  assert.equal(typeof payload.github.configured, "boolean");
  assert.equal(typeof payload.matrix.configured, "boolean");
  assert.equal(payload.journal.enabled, true);
  assert.equal(payload.journal.mode, "memory");
  assert.equal(payload.counters.chatRequests, 0);

  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /secret-openrouter-token/);
  assert.doesNotMatch(serialized, /secret-github-token/);
  assert.doesNotMatch(serialized, /secret-admin-password/);
  assert.doesNotMatch(serialized, /secret-session-secret/);
});

test("/journal/recent returns bounded safe entries and supports source filter", async (t) => {
  const app = createApp({
    env: createTestEnv({
      JOURNAL_MAX_ENTRIES: 10,
      JOURNAL_EXPOSE_RECENT_LIMIT: 5
    }),
    openRouter: createMockOpenRouterClient({
      relayChatCompletionStream: async (_request, selection, options) => {
        options.onToken("hello");
        return {
          model: selection.publicModelId,
          text: "hello"
        };
      }
    }),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  await app.inject({
    method: "POST",
    url: "/chat",
    payload: {
      stream: true,
      messages: [
        {
          role: "user",
          content: "hello world"
        }
      ]
    }
  });

  const allResponse = await app.inject({
    method: "GET",
    url: "/journal/recent?limit=2"
  });

  assert.equal(allResponse.statusCode, 200);
  const allPayload = JSON.parse(allResponse.body) as {
    ok: boolean;
    entries: Array<{
      source: string;
      eventType: string;
      summary: string;
      safeMetadata: Record<string, unknown>;
      redaction: {
        contentStored: boolean;
        secretsStored: boolean;
      };
    }>;
  };
  assert.equal(allPayload.ok, true);
  assert.ok(allPayload.entries.length >= 1);
  assert.equal(allPayload.entries[0]?.redaction.contentStored, false);
  assert.equal(allPayload.entries[0]?.redaction.secretsStored, false);
  assert.doesNotMatch(JSON.stringify(allPayload), /hello world/);

  const sourceResponse = await app.inject({
    method: "GET",
    url: "/journal/recent?source=chat&limit=10"
  });

  assert.equal(sourceResponse.statusCode, 200);
  const sourcePayload = JSON.parse(sourceResponse.body) as {
    entries: Array<{
      source: string;
    }>;
  };
  assert.ok(sourcePayload.entries.every((entry) => entry.source === "chat"));
});

test("diagnostics counters track chat traffic and rate-limit blocked scope safely", async (t) => {
  const app = createApp({
    env: createTestEnv({
      RATE_LIMIT_WINDOW_MS: 60_000,
      RATE_LIMIT_CHAT_MAX: 1
    }),
    openRouter: createMockOpenRouterClient({
      relayChatCompletionStream: async (_request, selection, options) => {
        options.onToken("hello");
        return {
          model: selection.publicModelId,
          text: "hello"
        };
      }
    }),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const allowed = await app.inject({
    method: "POST",
    url: "/chat",
    payload: {
      stream: true,
      messages: [
        {
          role: "user",
          content: "first"
        }
      ]
    }
  });
  assert.equal(allowed.statusCode, 200);

  const blocked = await app.inject({
    method: "POST",
    url: "/chat",
    payload: {
      messages: [
        {
          role: "user",
          content: "second"
        }
      ]
    }
  });
  assert.equal(blocked.statusCode, 429);

  const diagnostics = await app.inject({
    method: "GET",
    url: "/diagnostics"
  });
  assert.equal(diagnostics.statusCode, 200);

  const payload = JSON.parse(diagnostics.body) as {
    counters: {
      chatRequests: number;
      chatStreamStarted: number;
      chatStreamCompleted: number;
      chatStreamError: number;
    };
    rateLimit: {
      blockedByScope: {
        chat: number;
      };
    };
  };

  assert.equal(payload.counters.chatRequests, 2);
  assert.equal(payload.counters.chatStreamStarted, 1);
  assert.equal(payload.counters.chatStreamCompleted, 1);
  assert.equal(payload.counters.chatStreamError, 0);
  assert.equal(payload.rateLimit.blockedByScope.chat, 1);

  const journal = await app.inject({
    method: "GET",
    url: "/journal/recent?source=rate_limit&limit=5"
  });
  assert.equal(journal.statusCode, 200);
  const journalPayload = JSON.parse(journal.body) as {
    entries: Array<{
      eventType: string;
      source: string;
    }>;
  };
  assert.ok(journalPayload.entries.some((entry) => entry.eventType === "rate_limit_blocked" && entry.source === "rate_limit"));
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

test("/chat returns 429 before upstream calls when rate-limited", async (t) => {
  let upstreamCalls = 0;
  const app = createApp({
    env: createTestEnv({
      RATE_LIMIT_WINDOW_MS: 60_000,
      RATE_LIMIT_CHAT_MAX: 1
    }),
    openRouter: createMockOpenRouterClient({
      createChatCompletion: async (request, selection) => {
        upstreamCalls += 1;
        return {
          model: selection.publicModelId,
          text: request.messages[0]?.content ?? ""
        };
      }
    }),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const firstResponse = await app.inject({
    method: "POST",
    url: "/chat",
    payload: {
      messages: [
        {
          role: "user",
          content: "hello"
        }
      ]
    }
  });

  assert.equal(firstResponse.statusCode, 200);

  const secondResponse = await app.inject({
    method: "POST",
    url: "/chat",
    payload: {
      stream: true,
      messages: [
        {
          role: "user",
          content: "hello again"
        }
      ]
    }
  });

  assert.equal(secondResponse.statusCode, 429);
  assert.equal(secondResponse.headers["retry-after"], "60");
  assert.deepEqual(JSON.parse(secondResponse.body), {
    ok: false,
    error: {
      code: "rate_limited",
      message: "Chat rate limit exceeded"
    }
  });
  assert.equal(upstreamCalls, 1);
  assert.doesNotMatch(secondResponse.headers["content-type"] ?? "", /text\/event-stream/);
});
