import { z } from "zod";

const MatrixEnvSchema = z.object({
  MATRIX_ENABLED: z.string().trim().default("false"),
  MATRIX_REQUIRED: z.string().trim().default("false"),
  MATRIX_BASE_URL: z.string().trim().default(""),
  MATRIX_HOMESERVER_URL: z.string().trim().default(""),
  MATRIX_ACCESS_TOKEN: z.string().trim().default(""),
  MATRIX_REFRESH_TOKEN: z.string().trim().default(""),
  MATRIX_CLIENT_ID: z.string().trim().default(""),
  MATRIX_TOKEN_EXPIRES_AT: z.string().trim().default(""),
  MATRIX_EXPECTED_USER_ID: z.string().trim().default(""),
  MATRIX_REQUEST_TIMEOUT_MS: z.string().trim().default("5000")
});

export type MatrixConfig = {
  enabled: boolean;
  required: boolean;
  ready: boolean;
  baseUrl: string | null;
  homeserverUrl: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  clientId: string | null;
  tokenExpiresAt: string | null;
  expectedUserId: string | null;
  requestTimeoutMs: number;
  issues: string[];
};

function parseBoolean(value: string) {
  if (/^(1|true|yes|on)$/i.test(value)) {
    return { value: true, valid: true };
  }

  if (/^(0|false|no|off)$/i.test(value)) {
    return { value: false, valid: true };
  }

  return { value: false, valid: false };
}

function normalizeBaseUrl(input: string) {
  const trimmed = input.trim().replace(/\/+$/, "");

  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);

    if (!url.protocol || !url.host) {
      return null;
    }

    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function normalizeHomeserverUrl(primary: string, fallback: string) {
  return normalizeBaseUrl(primary) ?? normalizeBaseUrl(fallback);
}

function normalizeUserId(input: string) {
  const trimmed = input.trim();

  if (!trimmed) {
    return null;
  }

  if (!trimmed.startsWith("@") || !trimmed.includes(":")) {
    return null;
  }

  return trimmed;
}

function parseTimeout(input: string) {
  const value = Number.parseInt(input.trim(), 10);

  if (!Number.isFinite(value) || Number.isNaN(value) || value < 1000 || value > 30000) {
    return null;
  }

  return value;
}

function normalizeTokenExpiry(input: string) {
  const trimmed = input.trim();

  if (!trimmed) {
    return null;
  }

  const value = new Date(trimmed);

  if (Number.isNaN(value.getTime())) {
    return null;
  }

  return value.toISOString();
}

export function createMatrixConfig(source: NodeJS.ProcessEnv = process.env): MatrixConfig {
  const parsed = MatrixEnvSchema.parse(source);
  const enabledParse = parseBoolean(parsed.MATRIX_ENABLED);
  const requiredParse = parseBoolean(parsed.MATRIX_REQUIRED);
  const baseUrl = normalizeHomeserverUrl(parsed.MATRIX_BASE_URL, parsed.MATRIX_HOMESERVER_URL);
  const accessToken = parsed.MATRIX_ACCESS_TOKEN.trim() ? parsed.MATRIX_ACCESS_TOKEN.trim() : null;
  const refreshToken = parsed.MATRIX_REFRESH_TOKEN.trim() ? parsed.MATRIX_REFRESH_TOKEN.trim() : null;
  const clientId = parsed.MATRIX_CLIENT_ID.trim() ? parsed.MATRIX_CLIENT_ID.trim() : null;
  const tokenExpiresAt = normalizeTokenExpiry(parsed.MATRIX_TOKEN_EXPIRES_AT);
  const expectedUserId = normalizeUserId(parsed.MATRIX_EXPECTED_USER_ID);
  const requestTimeoutMs = parseTimeout(parsed.MATRIX_REQUEST_TIMEOUT_MS);
  const issues: string[] = [];

  if (!enabledParse.valid) {
    issues.push("MATRIX_ENABLED must be a boolean value");
  }

  if (!requiredParse.valid) {
    issues.push("MATRIX_REQUIRED must be a boolean value");
  }

  if (enabledParse.value && !baseUrl) {
    issues.push("MATRIX_BASE_URL is required when MATRIX_ENABLED=true");
  }

  if (enabledParse.value && !accessToken && !refreshToken) {
    issues.push("MATRIX_ACCESS_TOKEN or MATRIX_REFRESH_TOKEN is required when MATRIX_ENABLED=true");
  }

  if (enabledParse.value && refreshToken && !clientId) {
    issues.push("MATRIX_CLIENT_ID is required when MATRIX_REFRESH_TOKEN is set");
  }

  if (parsed.MATRIX_EXPECTED_USER_ID.trim() && !expectedUserId) {
    issues.push("MATRIX_EXPECTED_USER_ID must be a Matrix user ID when set");
  }

  if (parsed.MATRIX_TOKEN_EXPIRES_AT.trim() && !tokenExpiresAt) {
    issues.push("MATRIX_TOKEN_EXPIRES_AT must be an ISO timestamp when set");
  }

  if (requestTimeoutMs === null) {
    issues.push("MATRIX_REQUEST_TIMEOUT_MS must be between 1000 and 30000");
  }

  if (requiredParse.value && (!enabledParse.value || issues.length > 0)) {
    throw new Error(
      `Matrix backend is required but not configured: ${issues.length > 0 ? issues.join("; ") : "MATRIX_ENABLED=false"}`
    );
  }

  const ready = enabledParse.value && issues.length === 0;

  return {
    enabled: enabledParse.value,
    required: requiredParse.value,
    ready,
    baseUrl: ready ? baseUrl : null,
    homeserverUrl: ready ? baseUrl : null,
    accessToken: ready ? accessToken : null,
    refreshToken: ready ? refreshToken : null,
    clientId: ready ? clientId : null,
    tokenExpiresAt: ready ? tokenExpiresAt : null,
    expectedUserId: ready ? expectedUserId : null,
    requestTimeoutMs: requestTimeoutMs ?? 5000,
    issues
  };
}

export function createDisabledMatrixConfig(): MatrixConfig {
  return {
    enabled: false,
    required: false,
    ready: false,
    baseUrl: null,
    homeserverUrl: null,
    accessToken: null,
    refreshToken: null,
    clientId: null,
    tokenExpiresAt: null,
    expectedUserId: null,
    requestTimeoutMs: 5000,
    issues: []
  };
}
