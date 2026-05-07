import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import { createOpenRouterClient } from "../src/lib/openrouter.js";
import { createTestEnv } from "../test-support/helpers.js";

const SECRET_KEY = "sk-or-v1-secret-user-openrouter-key";

function cookieHeaderFrom(response: { headers: Record<string, string | string[] | undefined> }) {
  const raw = response.headers["set-cookie"];
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];

  return values.map((value) => value.split(";", 1)[0]).join("; ");
}

test("OpenRouter settings save creates a backend profile cookie and never returns the api key", async (t) => {
  const env = createTestEnv({
    USER_CREDENTIALS_ENCRYPTION_KEY: "user-credentials-test-key",
    USER_CREDENTIALS_STORE_MODE: "memory"
  });
  const app = createApp({
    env,
    openRouter: createOpenRouterClient({
      env,
      fetchImpl: async () => new Response("should not be called by save", { status: 500 })
    }),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const saveResponse = await app.inject({
    method: "POST",
    url: "/settings/openrouter/credentials",
    payload: {
      apiKey: SECRET_KEY,
      modelId: "anthropic/claude-3.5-sonnet"
    }
  });

  assert.equal(saveResponse.statusCode, 200);
  assert.match(String(saveResponse.headers["set-cookie"]), /mosaicstack_local_profile=/);
  assert.match(String(saveResponse.headers["set-cookie"]), /HttpOnly/);
  assert.match(String(saveResponse.headers["set-cookie"]), /SameSite=Lax/);
  assert.doesNotMatch(saveResponse.body, /sk-or-v1-secret-user-openrouter-key/);

  const cookie = cookieHeaderFrom(saveResponse);
  const statusResponse = await app.inject({
    method: "GET",
    url: "/settings/openrouter/status",
    headers: {
      cookie
    }
  });

  assert.equal(statusResponse.statusCode, 200);
  assert.deepEqual(JSON.parse(statusResponse.body), {
    configured: true,
    models: [
      {
        alias: "user_openrouter_default",
        label: "anthropic/claude-3.5-sonnet",
        source: "user_configured"
      }
    ]
  });
  assert.doesNotMatch(statusResponse.body, /sk-or-v1-secret-user-openrouter-key/);
});

test("OpenRouter settings rejects body-supplied credential owner authority", async (t) => {
  const app = createApp({
    env: createTestEnv({
      USER_CREDENTIALS_ENCRYPTION_KEY: "user-credentials-test-key",
      USER_CREDENTIALS_STORE_MODE: "memory"
    }),
    openRouter: createOpenRouterClient({
      env: createTestEnv(),
      fetchImpl: async () => new Response("should not be called", { status: 500 })
    }),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/settings/openrouter/credentials",
    payload: {
      profileId: "attacker-profile",
      apiKey: SECRET_KEY,
      modelId: "anthropic/claude-3.5-sonnet"
    }
  });

  assert.equal(response.statusCode, 400);
  assert.doesNotMatch(response.body, /sk-or-v1-secret-user-openrouter-key/);
});

test("OpenRouter test route validates a provided key and model without persisting", async (t) => {
  let calls = 0;
  const env = createTestEnv({
    USER_CREDENTIALS_ENCRYPTION_KEY: "user-credentials-test-key",
    USER_CREDENTIALS_STORE_MODE: "memory"
  });
  const app = createApp({
    env,
    openRouter: createOpenRouterClient({
      env,
      fetchImpl: async (_url, init) => {
        calls += 1;
        const headers = new Headers(init?.headers);
        const body = typeof init?.body === "string" ? JSON.parse(init.body) as { model: string } : { model: "" };

        assert.equal(headers.get("authorization"), `Bearer ${SECRET_KEY}`);
        assert.equal(body.model, "anthropic/claude-3.5-sonnet");

        return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
          headers: {
            "Content-Type": "application/json"
          }
        });
      }
    }),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/settings/openrouter/test",
    payload: {
      apiKey: SECRET_KEY,
      modelId: "anthropic/claude-3.5-sonnet"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    ok: true,
    configured: false,
    model: {
      alias: "user_openrouter_default",
      label: "anthropic/claude-3.5-sonnet",
      source: "user_configured"
    }
  });
  assert.equal(calls, 1);
  assert.doesNotMatch(response.body, /sk-or-v1-secret-user-openrouter-key/);

  const statusResponse = await app.inject({
    method: "GET",
    url: "/settings/openrouter/status",
    headers: {
      cookie: cookieHeaderFrom(response)
    }
  });

  assert.equal(statusResponse.statusCode, 200);
  assert.deepEqual(JSON.parse(statusResponse.body), {
    configured: false,
    models: []
  });
});

test("chat fails closed for user OpenRouter alias until profile credentials are configured", async (t) => {
  let calls = 0;
  const env = createTestEnv({
    OPENROUTER_API_KEY: "legacy-env-key-must-not-be-used",
    USER_CREDENTIALS_ENCRYPTION_KEY: "user-credentials-test-key",
    USER_CREDENTIALS_STORE_MODE: "memory"
  });
  const app = createApp({
    env,
    openRouter: createOpenRouterClient({
      env,
      fetchImpl: async () => {
        calls += 1;
        return new Response("should not be called", { status: 500 });
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
      modelAlias: "user_openrouter_default",
      messages: [
        {
          role: "user",
          content: "hello"
        }
      ]
    }
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(JSON.parse(response.body), {
    ok: false,
    error: {
      code: "credentials_not_configured",
      message: "OpenRouter credentials not configured"
    }
  });
  assert.equal(calls, 0);
  assert.doesNotMatch(response.body, /legacy-env-key-must-not-be-used/);
});

test("chat resolves user OpenRouter alias through profile cookie credentials", async (t) => {
  const seen: Array<{ authorization: string | null; model: string }> = [];
  const env = createTestEnv({
    USER_CREDENTIALS_ENCRYPTION_KEY: "user-credentials-test-key",
    USER_CREDENTIALS_STORE_MODE: "memory"
  });
  const app = createApp({
    env,
    openRouter: createOpenRouterClient({
      env,
      fetchImpl: async (_url, init) => {
        const headers = new Headers(init?.headers);
        const body = typeof init?.body === "string" ? JSON.parse(init.body) as { model: string } : { model: "" };
        seen.push({
          authorization: headers.get("authorization"),
          model: body.model
        });

        return new Response(JSON.stringify({ choices: [{ message: { content: "user-key ok" } }] }), {
          headers: {
            "Content-Type": "application/json"
          }
        });
      }
    }),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const saveResponse = await app.inject({
    method: "POST",
    url: "/settings/openrouter/credentials",
    payload: {
      apiKey: SECRET_KEY,
      modelId: "anthropic/claude-3.5-sonnet"
    }
  });
  const cookie = cookieHeaderFrom(saveResponse);

  const chatResponse = await app.inject({
    method: "POST",
    url: "/chat",
    headers: {
      cookie
    },
    payload: {
      modelAlias: "user_openrouter_default",
      messages: [
        {
          role: "user",
          content: "hello"
        }
      ]
    }
  });

  assert.equal(chatResponse.statusCode, 200);
  assert.deepEqual(seen, [
    {
      authorization: `Bearer ${SECRET_KEY}`,
      model: "anthropic/claude-3.5-sonnet"
    }
  ]);
  assert.deepEqual(JSON.parse(chatResponse.body), {
    ok: true,
    model: "user_openrouter_default",
    text: "user-key ok",
    route: {
      selectedAlias: "user_openrouter_default",
      taskClass: "dialog",
      fallbackUsed: false,
      degraded: false,
      streaming: false,
      policyVersion: "user-openrouter/v1",
      decisionReason: "source=user_configured",
      retryCount: 0
    }
  });
  assert.doesNotMatch(chatResponse.body, /sk-or-v1-secret-user-openrouter-key/);
});

test("production fails closed when user credential encryption is not configured", async (t) => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const env = createTestEnv({
    USER_CREDENTIALS_ENCRYPTION_KEY: "",
    USER_CREDENTIALS_STORE_MODE: "file"
  });
  const app = createApp({
    env,
    openRouter: createOpenRouterClient({
      env,
      fetchImpl: async () => new Response("should not be called", { status: 500 })
    }),
    logger: false
  });

  t.after(async () => {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/settings/openrouter/credentials",
    payload: {
      apiKey: SECRET_KEY,
      modelId: "anthropic/claude-3.5-sonnet"
    }
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(JSON.parse(response.body), {
    ok: false,
    error: {
      code: "credential_encryption_not_configured",
      message: "User credential encryption is not configured"
    }
  });
  assert.doesNotMatch(response.body, /sk-or-v1-secret-user-openrouter-key/);
});
