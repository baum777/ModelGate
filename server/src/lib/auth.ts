import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { AppEnv } from "./env.js";

const AUTH_COOKIE_NAME = "modelgate_admin_session";
const AUTH_COOKIE_VERSION = "v1";
const AUTH_COOKIE_SAME_SITE = "Lax";
const DEFAULT_SESSION_TTL_SECONDS = 86_400;

export type AuthConfig = {
  ready: boolean;
  adminPassword: string | null;
  sessionSecret: string | null;
  sessionTtlSeconds: number;
  cookieName: string;
  issues: string[];
};

type SessionCookieParts = {
  version: string;
  issuedAtMs: number;
  nonce: string;
  signature: string;
};

function isProductionDeployment() {
  return process.env.NODE_ENV === "production";
}

function buildCookieAttributes(cookieName: string, value: string, maxAgeSeconds: number) {
  const attributes = [
    `${cookieName}=${value}`,
    "HttpOnly",
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    `SameSite=${AUTH_COOKIE_SAME_SITE}`
  ];

  if (isProductionDeployment()) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

function parseCookieHeader(cookieHeader: string | undefined, cookieName: string) {
  if (!cookieHeader) {
    return null;
  }

  for (const segment of cookieHeader.split(";")) {
    const trimmed = segment.trim();

    if (!trimmed.startsWith(`${cookieName}=`)) {
      continue;
    }

    return trimmed.slice(cookieName.length + 1);
  }

  return null;
}

function parseSessionCookie(rawValue: string): SessionCookieParts | null {
  let decodedValue: string;

  try {
    decodedValue = decodeURIComponent(rawValue);
  } catch {
    return null;
  }

  const parts = decodedValue.split(".");

  if (parts.length !== 4) {
    return null;
  }

  const [version, issuedAt, nonce, signature] = parts;

  if (version !== AUTH_COOKIE_VERSION) {
    return null;
  }

  if (!issuedAt || !nonce || !signature) {
    return null;
  }

  const issuedAtMs = Number.parseInt(issuedAt, 10);

  if (!Number.isFinite(issuedAtMs) || Number.isNaN(issuedAtMs) || issuedAtMs < 0) {
    return null;
  }

  return {
    version,
    issuedAtMs,
    nonce,
    signature
  };
}

function buildSessionSignature(sessionSecret: string, issuedAtMs: number, nonce: string) {
  const payload = `${issuedAtMs}.${nonce}`;
  return createHmac("sha256", sessionSecret).update(payload).digest("hex");
}

function buildSessionValue(sessionSecret: string, issuedAtMs: number, nonce: string) {
  const signature = buildSessionSignature(sessionSecret, issuedAtMs, nonce);
  return `${AUTH_COOKIE_VERSION}.${issuedAtMs}.${nonce}.${signature}`;
}

function compareStringsSecurely(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function createAuthConfig(env: AppEnv): AuthConfig {
  const adminPassword = env.MODEL_GATE_ADMIN_PASSWORD.trim() || null;
  const sessionSecret = env.MODEL_GATE_SESSION_SECRET.trim() || null;
  const sessionTtlSeconds = env.MODEL_GATE_SESSION_TTL_SECONDS > 0
    ? Math.floor(env.MODEL_GATE_SESSION_TTL_SECONDS)
    : DEFAULT_SESSION_TTL_SECONDS;
  const issues: string[] = [];

  if (!adminPassword) {
    issues.push("MODEL_GATE_ADMIN_PASSWORD is required");
  }

  if (!sessionSecret) {
    issues.push("MODEL_GATE_SESSION_SECRET is required");
  }

  return {
    ready: issues.length === 0,
    adminPassword,
    sessionSecret,
    sessionTtlSeconds,
    cookieName: AUTH_COOKIE_NAME,
    issues
  };
}

export function verifyAdminPassword(password: string, config: AuthConfig): boolean {
  if (!config.ready || !config.adminPassword) {
    return false;
  }

  const expectedPassword = config.adminPassword;
  const providedPassword = password;

  return compareStringsSecurely(expectedPassword, providedPassword);
}

export function createSessionCookie(config: AuthConfig): string {
  if (!config.ready || !config.sessionSecret) {
    throw new Error("Auth is not configured");
  }

  const issuedAtMs = Date.now();
  const nonce = randomBytes(16).toString("hex");
  const value = encodeURIComponent(buildSessionValue(config.sessionSecret, issuedAtMs, nonce));

  return buildCookieAttributes(config.cookieName, value, config.sessionTtlSeconds);
}

export function verifySessionFromRequest(request: FastifyRequest, config: AuthConfig): boolean {
  if (!config.ready || !config.sessionSecret) {
    return false;
  }

  const cookieHeader = Array.isArray(request.headers.cookie)
    ? request.headers.cookie[0]
    : request.headers.cookie;
  const rawCookieValue = parseCookieHeader(cookieHeader, config.cookieName);

  if (!rawCookieValue) {
    return false;
  }

  const parsed = parseSessionCookie(rawCookieValue);

  if (!parsed) {
    return false;
  }

  const ageMs = Date.now() - parsed.issuedAtMs;

  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > config.sessionTtlSeconds * 1000) {
    return false;
  }

  const expectedSignature = buildSessionSignature(config.sessionSecret, parsed.issuedAtMs, parsed.nonce);
  return compareStringsSecurely(expectedSignature, parsed.signature);
}

export function clearSessionCookie(config: AuthConfig): string {
  const cookieValue = encodeURIComponent("");
  const parts = [
    `${config.cookieName}=${cookieValue}`,
    "HttpOnly",
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    `SameSite=${AUTH_COOKIE_SAME_SITE}`
  ];

  if (isProductionDeployment()) {
    parts.push("Secure");
  }

  return parts.join("; ");
}
