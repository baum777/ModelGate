import assert from "node:assert/strict";
import test from "node:test";
import { createAppRateLimiter } from "../src/lib/rate-limit.js";
import type { FastifyRequest } from "fastify";

function createRequest(ip: string): FastifyRequest {
  return {
    ip,
    headers: {},
    socket: {
      remoteAddress: ip
    }
  } as unknown as FastifyRequest;
}

test("rate limiter allows requests below threshold and blocks when exceeded", () => {
  let nowMs = 1_000;
  const limiter = createAppRateLimiter({
    enabled: true,
    windowMs: 60_000,
    chatMax: 2,
    authLoginMax: 2,
    githubProposeMax: 2,
    githubExecuteMax: 2,
    matrixExecuteMax: 2
  }, () => nowMs);
  const request = createRequest("127.0.0.1");

  const first = limiter.check("chat", request);
  const second = limiter.check("chat", request);
  const third = limiter.check("chat", request);

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, false);
  assert.equal(third.retryAfterSeconds, 60);

  nowMs += 60_000;

  const afterWindow = limiter.check("chat", request);
  assert.equal(afterWindow.allowed, true);
});

test("rate limiter sets retry-after and disabled mode allows requests", () => {
  const request = createRequest("127.0.0.1");
  const enabledLimiter = createAppRateLimiter({
    enabled: true,
    windowMs: 30_000,
    chatMax: 1,
    authLoginMax: 1,
    githubProposeMax: 1,
    githubExecuteMax: 1,
    matrixExecuteMax: 1
  }, () => 5_000);
  enabledLimiter.check("auth_login", request);
  const blocked = enabledLimiter.check("auth_login", request);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 30);

  const disabledLimiter = createAppRateLimiter({
    enabled: false,
    windowMs: 30_000,
    chatMax: 1,
    authLoginMax: 1,
    githubProposeMax: 1,
    githubExecuteMax: 1,
    matrixExecuteMax: 1
  }, () => 5_000);
  assert.equal(disabledLimiter.check("auth_login", request).allowed, true);
  assert.equal(disabledLimiter.check("auth_login", request).allowed, true);
});
