import assert from "node:assert/strict";
import test from "node:test";
import { normalizeVercelRequestUrl } from "../../api/_handler.ts";

test("vercel handler preserves matrix routes and strips the /api prefix for root API calls", () => {
  assert.equal(normalizeVercelRequestUrl("/api/chat"), "/chat");
  assert.equal(normalizeVercelRequestUrl("/api/models?include=all"), "/models?include=all");
  assert.equal(normalizeVercelRequestUrl("/api/health"), "/health");
  assert.equal(normalizeVercelRequestUrl("/api/auth/login"), "/api/auth/login");
  assert.equal(normalizeVercelRequestUrl("/api/auth/me?x=1"), "/api/auth/me?x=1");
  assert.equal(normalizeVercelRequestUrl("/api/matrix/whoami"), "/api/matrix/whoami");
  assert.equal(normalizeVercelRequestUrl("/api/matrix/actions/plan/verify?x=1"), "/api/matrix/actions/plan/verify?x=1");
  assert.equal(normalizeVercelRequestUrl("/api/github/repos"), "/api/github/repos");
  assert.equal(normalizeVercelRequestUrl("/api/github/repos/acme/widget/tree?ref=main"), "/api/github/repos/acme/widget/tree?ref=main");
});
