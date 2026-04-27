import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import { createMockOpenRouterClient, createTestEnv } from "../test-support/helpers.js";

test("github routes rely on GitHub backend configuration, not a global admin session", async (t) => {
  const app = createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const routes = [
    { method: "GET" as const, url: "/api/github/repos" },
    {
      method: "POST" as const,
      url: "/api/github/context",
      payload: { repo: { owner: "acme", repo: "widget" }, question: "What is the structure?" }
    },
    {
      method: "POST" as const,
      url: "/api/github/actions/propose",
      payload: { repo: { owner: "acme", repo: "widget" }, objective: "Review the widget flow" }
    },
    { method: "POST" as const, url: "/api/github/actions/plan_123/execute", payload: { approval: true } }
  ];

  for (const request of routes) {
    const response = await app.inject(request);

    assert.equal(response.statusCode, 503);
    assert.deepEqual(JSON.parse(response.body), {
      ok: false,
      error: {
        code: "github_not_configured",
        message: "GitHub backend is not configured"
      }
    });
  }
});
