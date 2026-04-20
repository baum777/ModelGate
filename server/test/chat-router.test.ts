import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import { createMockOpenRouterClient, createTestEnv } from "../test-support/helpers.js";
import { OpenRouterError } from "../src/lib/openrouter.js";

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

test("chat routing resolves one public alias and never leaks provider targets", async (t) => {
  const env = createTestEnv({
    CHAT_MODEL: "google/gemma-4-31b-it:free",
    OPENROUTER_MODELS: ["anthropic/claude-3.5-sonnet"]
  });
  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient({
      createChatCompletion: async (_request, selection) => {
        assert.deepEqual(selection.providerTargets, [
          "google/gemma-4-31b-it:free",
          "openrouter/auto",
          "meta-llama/llama-3.3-70b-instruct:free"
        ]);
        return {
          model: selection.publicModelAlias,
          text: "ok"
        };
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
      task: "coding",
      messages: [
        {
          role: "user",
          content: "please implement this"
        }
      ]
    }
  });

  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body) as {
    ok: boolean;
    model: string;
    text: string;
    route: {
      selectedAlias: string;
      taskClass: string;
      fallbackUsed: boolean;
      degraded: boolean;
      streaming: boolean;
    };
  };
  assert.equal(payload.ok, true);
  assert.equal(payload.model, "default");
  assert.equal(payload.route.selectedAlias, "default");
  assert.equal(payload.route.taskClass, "coding");
  assert.equal(payload.route.streaming, false);
  assert.doesNotMatch(response.body, /google\/gemma|anthropic\/claude/);
});

test("streaming route metadata arrives before tokens", async (t) => {
  const env = createTestEnv();
  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient({
      relayChatCompletionStream: async (_request, selection, options) => {
        assert.equal(selection.publicModelAlias, "default");
        options.onToken("Hi");
        return {
          model: selection.publicModelAlias,
          text: "Hi"
        };
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
      stream: true,
      task: "dialog",
      messages: [
        {
          role: "user",
          content: "hello"
        }
      ]
    }
  });

  assert.equal(response.statusCode, 200);
  const events = parseSseEvents(response.body);
  assert.deepEqual(events.map((event) => event.event), ["start", "route", "token", "done"]);
  const routePayload = JSON.parse(events[1].data) as {
    ok: boolean;
    route: {
      selectedAlias: string;
      taskClass: string;
      streaming: boolean;
    };
  };
  assert.equal(routePayload.ok, true);
  assert.equal(routePayload.route.selectedAlias, "default");
  assert.equal(routePayload.route.taskClass, "dialog");
  assert.equal(routePayload.route.streaming, true);
});

test("streaming preserves sanitized upstream failures", async (t) => {
  const env = createTestEnv();
  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient({
      relayChatCompletionStream: async () => {
        throw new OpenRouterError("OpenRouter request failed", 502);
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
      stream: true,
      messages: [
        {
          role: "user",
          content: "hello"
        }
      ]
    }
  });

  assert.equal(response.statusCode, 200);
  const events = parseSseEvents(response.body);
  assert.deepEqual(events.map((event) => event.event), ["start", "route", "error"]);
  const errorPayload = JSON.parse(events[2].data) as {
    ok: boolean;
    error: {
      code: string;
      message: string;
    };
  };
  assert.equal(errorPayload.ok, false);
  assert.equal(errorPayload.error.code, "upstream_error");
});
