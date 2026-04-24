import { createHash } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { AuthConfig } from "./auth.js";
import { verifySessionFromRequest } from "./auth.js";
import type { AppEnv } from "./env.js";

export type RateLimitScope = "chat" | "auth_login" | "github_propose" | "github_execute" | "matrix_execute";
type Clock = () => number;

export type RateLimitConfig = {
  enabled: boolean;
  windowMs: number;
  chatMax: number;
  authLoginMax: number;
  githubProposeMax: number;
  githubExecuteMax: number;
  matrixExecuteMax: number;
};

type RateLimitState = {
  used: number;
  resetAtMs: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export type RateLimitPublicSnapshot = {
  enabled: boolean;
  windowMs: number;
  limits: Record<RateLimitScope, number>;
  blockedByScope: Record<RateLimitScope, number>;
};

function readCookieValue(cookieHeader: string | undefined, cookieName: string) {
  if (!cookieHeader) {
    return null;
  }

  const segments = cookieHeader.split(";");

  for (const segment of segments) {
    const trimmed = segment.trim();
    const prefix = `${cookieName}=`;

    if (!trimmed.startsWith(prefix)) {
      continue;
    }

    return trimmed.slice(prefix.length);
  }

  return null;
}

function hashValue(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

function toRetryAfterSeconds(resetAtMs: number, nowMs: number) {
  const remainingMs = Math.max(0, resetAtMs - nowMs);
  return Math.max(1, Math.ceil(remainingMs / 1000));
}

function readClientIp(request: FastifyRequest) {
  if (typeof request.ip === "string" && request.ip.trim().length > 0) {
    return request.ip.trim();
  }

  const remoteAddress = request.socket?.remoteAddress;

  if (typeof remoteAddress === "string" && remoteAddress.trim().length > 0) {
    return remoteAddress.trim();
  }

  return "unknown";
}

function deriveClientKey(request: FastifyRequest, authConfig?: AuthConfig) {
  if (authConfig && verifySessionFromRequest(request, authConfig)) {
    const cookieHeader = Array.isArray(request.headers.cookie)
      ? request.headers.cookie[0]
      : request.headers.cookie;
    const rawCookieValue = readCookieValue(cookieHeader, authConfig.cookieName);

    if (rawCookieValue && rawCookieValue.trim().length > 0) {
      return `session:${hashValue(rawCookieValue)}`;
    }
  }

  return `ip:${readClientIp(request)}`;
}

function maxForScope(scope: RateLimitScope, config: RateLimitConfig) {
  switch (scope) {
    case "chat":
      return config.chatMax;
    case "auth_login":
      return config.authLoginMax;
    case "github_propose":
      return config.githubProposeMax;
    case "github_execute":
      return config.githubExecuteMax;
    case "matrix_execute":
      return config.matrixExecuteMax;
  }
}

export type AppRateLimiter = {
  check(scope: RateLimitScope, request: FastifyRequest, authConfig?: AuthConfig): RateLimitDecision;
  getPublicSnapshot(): RateLimitPublicSnapshot;
};

export type RateLimitBlockedEvent = {
  scope: RateLimitScope;
  retryAfterSeconds: number;
};

export function createRateLimitConfig(env: AppEnv): RateLimitConfig {
  return {
    enabled: env.RATE_LIMIT_ENABLED,
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    chatMax: env.RATE_LIMIT_CHAT_MAX,
    authLoginMax: env.RATE_LIMIT_AUTH_LOGIN_MAX,
    githubProposeMax: env.RATE_LIMIT_GITHUB_PROPOSE_MAX,
    githubExecuteMax: env.RATE_LIMIT_GITHUB_EXECUTE_MAX,
    matrixExecuteMax: env.RATE_LIMIT_MATRIX_EXECUTE_MAX
  };
}

export function createAppRateLimiter(
  config: RateLimitConfig,
  now: Clock = () => Date.now(),
  onBlocked?: (event: RateLimitBlockedEvent) => void
): AppRateLimiter {
  const state = new Map<string, RateLimitState>();
  const blockedByScope: Record<RateLimitScope, number> = {
    chat: 0,
    auth_login: 0,
    github_propose: 0,
    github_execute: 0,
    matrix_execute: 0
  };

  function buildPublicSnapshot(): RateLimitPublicSnapshot {
    return {
      enabled: config.enabled,
      windowMs: config.windowMs,
      limits: {
        chat: config.chatMax,
        auth_login: config.authLoginMax,
        github_propose: config.githubProposeMax,
        github_execute: config.githubExecuteMax,
        matrix_execute: config.matrixExecuteMax
      },
      blockedByScope: {
        chat: blockedByScope.chat,
        auth_login: blockedByScope.auth_login,
        github_propose: blockedByScope.github_propose,
        github_execute: blockedByScope.github_execute,
        matrix_execute: blockedByScope.matrix_execute
      }
    };
  }

  return {
    check(scope, request, authConfig) {
      if (!config.enabled) {
        return {
          allowed: true,
          retryAfterSeconds: 0
        };
      }

      const nowMs = now();
      const limit = maxForScope(scope, config);
      const key = `${scope}:${deriveClientKey(request, authConfig)}`;
      const existing = state.get(key);

      if (!existing || nowMs >= existing.resetAtMs) {
        const resetAtMs = nowMs + config.windowMs;

        state.set(key, {
          used: 1,
          resetAtMs
        });

        return {
          allowed: true,
          retryAfterSeconds: 0
        };
      }

      if (existing.used >= limit) {
        blockedByScope[scope] += 1;
        const retryAfterSeconds = toRetryAfterSeconds(existing.resetAtMs, nowMs);

        onBlocked?.({
          scope,
          retryAfterSeconds
        });

        return {
          allowed: false,
          retryAfterSeconds
        };
      }

      existing.used += 1;
      state.set(key, existing);

      return {
        allowed: true,
        retryAfterSeconds: 0
      };
    },
    getPublicSnapshot() {
      return buildPublicSnapshot();
    }
  };
}
