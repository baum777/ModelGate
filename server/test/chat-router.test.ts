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

test("default-free alias maps to the server-configured default model with backend-only fallback targets", async (t) => {
  const env = createTestEnv({
    OPENROUTER_DEFAULT_MODEL: "deepseek/deepseek-v4-flash:free",
    DIALOG_FALLBACK_MODEL: "openai/gpt-oss-120b:free",
    FAST_FALLBACK_MODEL: "",
    OPENROUTER_MODELS: []
  });
  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient({
      createChatCompletion: async (_request, selection) => {
        assert.equal(selection.publicModelAlias, "default-free");
        assert.deepEqual(selection.providerTargets, [
          "deepseek/deepseek-v4-flash:free",
          "openai/gpt-oss-120b:free"
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
      modelAlias: "default-free",
      messages: [
        {
          role: "user",
          content: "hello"
        }
      ]
    }
  });

  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body) as {
    ok: boolean;
    model: string;
    route: {
      selectedAlias: string;
    };
  };
  assert.equal(payload.ok, true);
  assert.equal(payload.model, "default-free");
  assert.equal(payload.route.selectedAlias, "default-free");
});

test("default-free alias fails closed with missing_api_key when no server key exists", async (t) => {
  const env = createTestEnv({
    OPENROUTER_API_KEY: "",
    OPENROUTER_DEFAULT_MODEL: "deepseek/deepseek-v4-flash:free"
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
    method: "POST",
    url: "/chat",
    payload: {
      modelAlias: "default-free",
      messages: [
        {
          role: "user",
          content: "hello"
        }
      ]
    }
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(JSON.parse(response.body), {
    ok: false,
    error: {
      code: "missing_api_key",
      message: "OpenRouter API key is not configured"
    }
  });
});

test("default-free alias fails closed with missing_default_model when no model is configured", async (t) => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  const env = createTestEnv({
    OPENROUTER_DEFAULT_MODEL: "",
    OPENROUTER_API_KEY: "test-openrouter-key"
  });
  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient(),
    logger: false
  });

  t.after(async () => {
    process.env.NODE_ENV = previousNodeEnv;
  });
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/chat",
    payload: {
      modelAlias: "default-free",
      messages: [
        {
          role: "user",
          content: "hello"
        }
      ]
    }
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(JSON.parse(response.body), {
    ok: false,
    error: {
      code: "missing_default_model",
      message: "Default free model is not configured"
    }
  });
});

test("settings-added OpenRouter models become selectable backend-owned aliases", async (t) => {
  const env = createTestEnv();
  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient({
      createChatCompletion: async (_request, selection) => {
        assert.equal(selection.publicModelAlias, "openrouter-1");
        assert.deepEqual(selection.providerTargets, ["anthropic/claude-3.5-sonnet"]);
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

  const addResponse = await app.inject({
    method: "POST",
    url: "/models/openrouter",
    payload: {
      modelId: "anthropic/claude-3.5-sonnet"
    }
  });

  assert.equal(addResponse.statusCode, 200);
  const addPayload = JSON.parse(addResponse.body) as {
    ok: boolean;
    alias: string;
  };
  assert.equal(addPayload.ok, true);
  assert.equal(addPayload.alias, "openrouter-1");

  const modelsResponse = await app.inject({
    method: "GET",
    url: "/models"
  });

  assert.equal(modelsResponse.statusCode, 200);
  const modelsPayload = JSON.parse(modelsResponse.body) as {
    models: string[];
    registry: Array<{ alias: string; label: string }>;
  };
  assert.deepEqual(modelsPayload.models, ["default", "default-free", "openrouter-1"]);
  assert.equal(modelsPayload.registry[2]?.label, "OpenRouter model 1");
  assert.doesNotMatch(modelsResponse.body, /anthropic\/claude/);

  const chatResponse = await app.inject({
    method: "POST",
    url: "/chat",
    payload: {
      modelAlias: "openrouter-1",
      messages: [
        {
          role: "user",
          content: "hello"
        }
      ]
    }
  });

  assert.equal(chatResponse.statusCode, 200);
  const chatPayload = JSON.parse(chatResponse.body) as {
    ok: boolean;
    model: string;
    route: {
      selectedAlias: string;
    };
  };
  assert.equal(chatPayload.ok, true);
  assert.equal(chatPayload.model, "openrouter-1");
  assert.equal(chatPayload.route.selectedAlias, "openrouter-1");
  assert.doesNotMatch(chatResponse.body, /anthropic\/claude/);
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
  assert.equal(errorPayload.error.code, "provider_unavailable");
});
