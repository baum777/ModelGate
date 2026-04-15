import { z } from "zod";

const MatrixEnvSchema = z.object({
  MATRIX_ENABLED: z.string().trim().default("false"),
  MATRIX_REQUIRED: z.string().trim().default("false"),
  MATRIX_BASE_URL: z.string().trim().default(""),
  MATRIX_ACCESS_TOKEN: z.string().trim().default(""),
  MATRIX_EXPECTED_USER_ID: z.string().trim().default(""),
  MATRIX_REQUEST_TIMEOUT_MS: z.string().trim().default("5000")
});

export type MatrixConfig = {
  enabled: boolean;
  required: boolean;
  ready: boolean;
  baseUrl: string | null;
  accessToken: string | null;
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

export function createMatrixConfig(source: NodeJS.ProcessEnv = process.env): MatrixConfig {
  const parsed = MatrixEnvSchema.parse(source);
  const enabledParse = parseBoolean(parsed.MATRIX_ENABLED);
  const requiredParse = parseBoolean(parsed.MATRIX_REQUIRED);
  const baseUrl = normalizeBaseUrl(parsed.MATRIX_BASE_URL);
  const accessToken = parsed.MATRIX_ACCESS_TOKEN.trim() ? parsed.MATRIX_ACCESS_TOKEN.trim() : null;
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

  if (enabledParse.value && !accessToken) {
    issues.push("MATRIX_ACCESS_TOKEN is required when MATRIX_ENABLED=true");
  }

  if (parsed.MATRIX_EXPECTED_USER_ID.trim() && !expectedUserId) {
    issues.push("MATRIX_EXPECTED_USER_ID must be a Matrix user ID when set");
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
    accessToken: ready ? accessToken : null,
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
    accessToken: null,
    expectedUserId: null,
    requestTimeoutMs: 5000,
    issues: []
  };
}
