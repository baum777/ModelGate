import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import { deriveGitHubClientCapabilities } from "../src/lib/github-capabilities.js";
import { createMockOpenRouterClient, createTestEnv, createTestGitHubConfig } from "../test-support/helpers.js";

test("deriveGitHubClientCapabilities blocks when github execution is not configured", () => {
  const notReady = deriveGitHubClientCapabilities({
    config: createTestGitHubConfig({ ready: false, agentApiKey: "secret" }),
    providedAdminKey: "secret",
    now: new Date("2026-05-16T08:00:00.000Z"),
  });

  assert.equal(notReady.canExecute, false);
  assert.equal(notReady.executeBlockReason, "github_not_configured");
  assert.equal(notReady.generatedAt, "2026-05-16T08:00:00.000Z");

  const noAdminKey = deriveGitHubClientCapabilities({
    config: createTestGitHubConfig({ agentApiKey: null }),
    providedAdminKey: "secret",
  });

  assert.equal(noAdminKey.canExecute, false);
  assert.equal(noAdminKey.executeBlockReason, "github_not_configured");
});

test("deriveGitHubClientCapabilities validates admin key presence and value", () => {
  const missing = deriveGitHubClientCapabilities({
    config: createTestGitHubConfig({ agentApiKey: "secret" }),
    providedAdminKey: null,
  });
  assert.equal(missing.canExecute, false);
  assert.equal(missing.executeBlockReason, "missing_admin_key");

  const invalid = deriveGitHubClientCapabilities({
    config: createTestGitHubConfig({ agentApiKey: "secret" }),
    providedAdminKey: "wrong",
  });
  assert.equal(invalid.canExecute, false);
  assert.equal(invalid.executeBlockReason, "invalid_admin_key");

  const allowed = deriveGitHubClientCapabilities({
    config: createTestGitHubConfig({ agentApiKey: "secret" }),
    providedAdminKey: "secret",
  });
  assert.equal(allowed.canExecute, true);
  assert.equal(allowed.executeBlockReason, null);
});

test("GET /api/github/capabilities returns server-authoritative execute capability", async (t) => {
  const app = createApp({
    env: createTestEnv(),
    githubConfig: createTestGitHubConfig({ agentApiKey: "secret" }),
    openRouter: createMockOpenRouterClient(),
    logger: false,
  });

  t.after(async () => {
    await app.close();
  });

  const missingKeyResponse = await app.inject({
    method: "GET",
    url: "/api/github/capabilities",
  });
  assert.equal(missingKeyResponse.statusCode, 200);
  assert.deepEqual(JSON.parse(missingKeyResponse.body), {
    ok: true,
    canExecute: false,
    executeBlockReason: "missing_admin_key",
    generatedAt: JSON.parse(missingKeyResponse.body).generatedAt,
  });

  const validKeyResponse = await app.inject({
    method: "GET",
    url: "/api/github/capabilities",
    headers: {
      "x-mosaicstacked-admin-key": "secret",
    },
  });
  assert.equal(validKeyResponse.statusCode, 200);
  assert.deepEqual(JSON.parse(validKeyResponse.body), {
    ok: true,
    canExecute: true,
    executeBlockReason: null,
    generatedAt: JSON.parse(validKeyResponse.body).generatedAt,
  });
});
