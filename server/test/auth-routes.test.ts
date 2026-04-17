import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import { createMockOpenRouterClient, createTestEnv } from "../test-support/helpers.js";

function readSetCookie(response: { headers: Record<string, unknown> }) {
  const header = response.headers["set-cookie"];

  if (Array.isArray(header)) {
    return header[0] ?? null;
  }

  return typeof header === "string" ? header : null;
}

test("auth login fails closed when server config is missing", async (t) => {
  const app = createApp({
    env: createTestEnv({
      MODEL_GATE_ADMIN_PASSWORD: "",
      MODEL_GATE_SESSION_SECRET: ""
    }),
    openRouter: createMockOpenRouterClient(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      password: "anything"
    }
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(JSON.parse(response.body), {
    code: "auth_not_configured"
  });
});

test("auth login rejects invalid credentials and accepts the configured password", async (t) => {
  const app = createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const wrongResponse = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      password: "wrong-password"
    }
  });

  assert.equal(wrongResponse.statusCode, 401);
  assert.deepEqual(JSON.parse(wrongResponse.body), {
    code: "auth_invalid_credentials"
  });

  const successResponse = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      password: "test-admin-password"
    }
  });

  assert.equal(successResponse.statusCode, 200);
  assert.deepEqual(JSON.parse(successResponse.body), {
    authenticated: true
  });

  const setCookie = readSetCookie(successResponse);
  assert.ok(setCookie);
  assert.match(setCookie ?? "", /HttpOnly/);
  assert.match(setCookie ?? "", /SameSite=Lax/);
  assert.match(setCookie ?? "", /Path=\//);
  assert.match(setCookie ?? "", /Max-Age=86400/);
});

test("auth session checks require a valid cookie and logout clears it", async (t) => {
  const app = createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const unauthenticatedResponse = await app.inject({
    method: "GET",
    url: "/api/auth/me"
  });

  assert.equal(unauthenticatedResponse.statusCode, 401);
  assert.deepEqual(JSON.parse(unauthenticatedResponse.body), {
    authenticated: false
  });

  const loginResponse = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      password: "test-admin-password"
    }
  });

  const sessionCookie = readSetCookie(loginResponse);

  assert.ok(sessionCookie);

  const authenticatedResponse = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  assert.equal(authenticatedResponse.statusCode, 200);
  assert.deepEqual(JSON.parse(authenticatedResponse.body), {
    authenticated: true
  });

  const logoutResponse = await app.inject({
    method: "POST",
    url: "/api/auth/logout",
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  assert.equal(logoutResponse.statusCode, 200);
  assert.deepEqual(JSON.parse(logoutResponse.body), {
    authenticated: false
  });
  const clearCookie = readSetCookie(logoutResponse);
  assert.ok(clearCookie);
  assert.match(clearCookie ?? "", /Max-Age=0/);
});
