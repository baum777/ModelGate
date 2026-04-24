import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const localEnvPath = fileURLToPath(new URL("../../../.env", import.meta.url));

export const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  HOST: z.string().trim().min(1).default("127.0.0.1"),
  OPENROUTER_API_KEY: z.string().trim().default(""),
  OPENROUTER_API_KEY_QWEN3_CODER: z.string().trim().default(""),
  OPENROUTER_API_KEY_GPT_OSS_120B_PLANNER: z.string().trim().default(""),
  OPENROUTER_API_KEY_NEMOTRON_3_SUPER_120B: z.string().trim().default(""),
  OPENROUTER_BASE_URL: z.string().trim().default("https://openrouter.ai/api/v1"),
  OPENROUTER_MODEL: z.string().trim().min(1).default("openrouter/auto"),
  OPENROUTER_MODELS: z.string().trim().default(""),
  OPENROUTER_REQUEST_TIMEOUT_MS: z.string().trim().default("15000"),
  APP_NAME: z.string().trim().min(1).default("local-openrouter-chat"),
  DEFAULT_SYSTEM_PROMPT: z
    .string()
    .trim()
    .min(1)
    .default("You are a concise, reliable assistant operating through a local OpenRouter proxy."),
  CORS_ORIGINS: z
    .string()
    .trim()
    .default("http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"),
  CHAT_MODEL: z.string().trim().default(""),
  CODE_AGENT_MODEL: z.string().trim().default(""),
  STRUCTURED_PLAN_MODEL: z.string().trim().default(""),
  MATRIX_ANALYZE_MODEL: z.string().trim().default(""),
  FAST_FALLBACK_MODEL: z.string().trim().default(""),
  DIALOG_FALLBACK_MODEL: z.string().trim().default(""),
  MODEL_ROUTING_MODE: z.string().trim().default("policy"),
  ALLOW_MODEL_FALLBACK: z.string().trim().default("true"),
  MODEL_ROUTING_FAIL_CLOSED: z.string().trim().default("true"),
  MODEL_ROUTING_LOG_ENABLED: z.string().trim().default("false"),
  MODEL_ROUTING_LOG_PATH: z.string().trim().default(".local-ai/logs/WORKFLOW_MODEL_ROUTING.log.md"),
  MATRIX_ANALYZE_LLM_ENABLED: z.string().trim().default("false"),
  MATRIX_EXECUTE_APPROVAL_REQUIRED: z.string().trim().default("true"),
  MATRIX_VERIFY_AFTER_EXECUTE: z.string().trim().default("true"),
  MATRIX_ALLOWED_ACTION_TYPES: z.string().trim().default("set_room_topic"),
  MATRIX_FAIL_CLOSED: z.string().trim().default("true"),
  GITHUB_TOKEN: z.string().trim().default(""),
  GITHUB_ALLOWED_REPOS: z.string().trim().default(""),
  GITHUB_AGENT_API_KEY: z.string().trim().default(""),
  GITHUB_API_BASE_URL: z.string().trim().default("https://api.github.com"),
  GITHUB_DEFAULT_OWNER: z.string().trim().default(""),
  GITHUB_BRANCH_PREFIX: z.string().trim().default("modelgate/github"),
  GITHUB_REQUEST_TIMEOUT_MS: z.string().trim().default("8000"),
  GITHUB_PLAN_TTL_MS: z.string().trim().default("720000"),
  GITHUB_ACTION_STORE_MODE: z.string().trim().default("memory"),
  GITHUB_ACTION_STORE_FILE_PATH: z.string().trim().default(".local-ai/state/github-action-store.json"),
  GITHUB_MAX_CONTEXT_FILES: z.string().trim().default("6"),
  GITHUB_MAX_CONTEXT_BYTES: z.string().trim().default("32768"),
  GITHUB_SMOKE_REPO: z.string().trim().default(""),
  GITHUB_SMOKE_BASE_BRANCH: z.string().trim().default(""),
  GITHUB_SMOKE_TARGET_BRANCH: z.string().trim().default(""),
  GITHUB_SMOKE_ENABLED: z.string().trim().default("false"),
  GITHUB_APP_ID: z.string().trim().default(""),
  GITHUB_APP_PRIVATE_KEY: z.string().trim().default(""),
  GITHUB_APP_INSTALLATION_ID: z.string().trim().default(""),
  RATE_LIMIT_ENABLED: z.string().trim().default("true"),
  RATE_LIMIT_WINDOW_MS: z.string().trim().default("60000"),
  RATE_LIMIT_CHAT_MAX: z.string().trim().default("30"),
  RATE_LIMIT_AUTH_LOGIN_MAX: z.string().trim().default("8"),
  RATE_LIMIT_GITHUB_PROPOSE_MAX: z.string().trim().default("10"),
  RATE_LIMIT_GITHUB_EXECUTE_MAX: z.string().trim().default("6"),
  RATE_LIMIT_MATRIX_EXECUTE_MAX: z.string().trim().default("6"),
  RATE_LIMIT_FAIL_CLOSED: z.string().trim().default("true"),
  JOURNAL_ENABLED: z.string().trim().default("true"),
  JOURNAL_STORE_MODE: z.string().trim().default("memory"),
  JOURNAL_FILE_PATH: z.string().trim().default(".local-ai/state/runtime-journal.json"),
  JOURNAL_MAX_ENTRIES: z.string().trim().default("500"),
  JOURNAL_EXPOSE_RECENT_LIMIT: z.string().trim().default("50"),
  MODEL_GATE_ADMIN_PASSWORD: z.string().trim().default(""),
  MODEL_GATE_SESSION_SECRET: z.string().trim().default(""),
  MODEL_GATE_SESSION_TTL_SECONDS: z.string().trim().default("86400")
});

export type AppEnv = {
  PORT: number;
  HOST: string;
  OPENROUTER_API_KEY: string;
  OPENROUTER_API_KEY_QWEN3_CODER: string;
  OPENROUTER_API_KEY_GPT_OSS_120B_PLANNER: string;
  OPENROUTER_API_KEY_NEMOTRON_3_SUPER_120B: string;
  OPENROUTER_BASE_URL: string;
  OPENROUTER_MODEL: string;
  OPENROUTER_MODELS: string[];
  OPENROUTER_REQUEST_TIMEOUT_MS: number;
  APP_NAME: string;
  DEFAULT_SYSTEM_PROMPT: string;
  CORS_ORIGINS: string[];
  CHAT_MODEL: string;
  CODE_AGENT_MODEL: string;
  STRUCTURED_PLAN_MODEL: string;
  MATRIX_ANALYZE_MODEL: string;
  FAST_FALLBACK_MODEL: string;
  DIALOG_FALLBACK_MODEL: string;
  MODEL_ROUTING_MODE: string;
  ALLOW_MODEL_FALLBACK: boolean;
  MODEL_ROUTING_FAIL_CLOSED: boolean;
  MODEL_ROUTING_LOG_ENABLED: boolean;
  MODEL_ROUTING_LOG_PATH: string;
  MATRIX_ANALYZE_LLM_ENABLED: boolean;
  MATRIX_EXECUTE_APPROVAL_REQUIRED: boolean;
  MATRIX_VERIFY_AFTER_EXECUTE: boolean;
  MATRIX_ALLOWED_ACTION_TYPES: string[];
  MATRIX_FAIL_CLOSED: boolean;
  GITHUB_TOKEN: string;
  GITHUB_ALLOWED_REPOS: string[];
  GITHUB_AGENT_API_KEY: string;
  GITHUB_API_BASE_URL: string;
  GITHUB_DEFAULT_OWNER: string;
  GITHUB_BRANCH_PREFIX: string;
  GITHUB_REQUEST_TIMEOUT_MS: number;
  GITHUB_PLAN_TTL_MS: number;
  GITHUB_ACTION_STORE_MODE: string;
  GITHUB_ACTION_STORE_FILE_PATH: string;
  GITHUB_MAX_CONTEXT_FILES: number;
  GITHUB_MAX_CONTEXT_BYTES: number;
  GITHUB_SMOKE_REPO: string;
  GITHUB_SMOKE_BASE_BRANCH: string;
  GITHUB_SMOKE_TARGET_BRANCH: string;
  GITHUB_SMOKE_ENABLED: boolean;
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_APP_INSTALLATION_ID: string;
  RATE_LIMIT_ENABLED: boolean;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_CHAT_MAX: number;
  RATE_LIMIT_AUTH_LOGIN_MAX: number;
  RATE_LIMIT_GITHUB_PROPOSE_MAX: number;
  RATE_LIMIT_GITHUB_EXECUTE_MAX: number;
  RATE_LIMIT_MATRIX_EXECUTE_MAX: number;
  RATE_LIMIT_FAIL_CLOSED: boolean;
  JOURNAL_ENABLED: boolean;
  JOURNAL_STORE_MODE: string;
  JOURNAL_FILE_PATH: string;
  JOURNAL_MAX_ENTRIES: number;
  JOURNAL_EXPOSE_RECENT_LIMIT: number;
  MODEL_GATE_ADMIN_PASSWORD: string;
  MODEL_GATE_SESSION_SECRET: string;
  MODEL_GATE_SESSION_TTL_SECONDS: number;
};

function parsePositiveIntOrDefault(input: string, fallback: number) {
  const value = Number.parseInt(input.trim(), 10);

  if (!Number.isFinite(value) || Number.isNaN(value) || value < 1) {
    return fallback;
  }

  return value;
}

function parseBoolean(input: string) {
  return /^(1|true|yes|on)$/i.test(input.trim());
}

function parsePositiveIntWithPolicy(input: string, fallback: number, failClosed: boolean, name: string) {
  const value = Number.parseInt(input.trim(), 10);

  if (!Number.isFinite(value) || Number.isNaN(value) || value < 1) {
    if (failClosed) {
      throw new Error(`${name} must be a positive integer`);
    }

    return fallback;
  }

  return value;
}

function parseCsvList(input: string): string[] {
  return [...new Set(
    input
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  )];
}

export function createEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = EnvSchema.parse(source);
  const rateLimitFailClosed = parseBoolean(parsed.RATE_LIMIT_FAIL_CLOSED.trim());

  const normalized: AppEnv = {
    PORT: parsed.PORT,
    HOST: parsed.HOST.trim(),
    OPENROUTER_API_KEY: parsed.OPENROUTER_API_KEY.trim(),
    OPENROUTER_API_KEY_QWEN3_CODER: parsed.OPENROUTER_API_KEY_QWEN3_CODER.trim(),
    OPENROUTER_API_KEY_GPT_OSS_120B_PLANNER: parsed.OPENROUTER_API_KEY_GPT_OSS_120B_PLANNER.trim(),
    OPENROUTER_API_KEY_NEMOTRON_3_SUPER_120B: parsed.OPENROUTER_API_KEY_NEMOTRON_3_SUPER_120B.trim(),
    OPENROUTER_BASE_URL: parsed.OPENROUTER_BASE_URL.trim(),
    OPENROUTER_MODEL: parsed.OPENROUTER_MODEL.trim(),
    OPENROUTER_MODELS: parseCsvList(parsed.OPENROUTER_MODELS),
    OPENROUTER_REQUEST_TIMEOUT_MS: Number.parseInt(parsed.OPENROUTER_REQUEST_TIMEOUT_MS.trim(), 10),
    APP_NAME: parsed.APP_NAME.trim(),
    DEFAULT_SYSTEM_PROMPT: parsed.DEFAULT_SYSTEM_PROMPT.trim(),
    CORS_ORIGINS: parseCsvList(parsed.CORS_ORIGINS),
    CHAT_MODEL: parsed.CHAT_MODEL.trim(),
    CODE_AGENT_MODEL: parsed.CODE_AGENT_MODEL.trim(),
    STRUCTURED_PLAN_MODEL: parsed.STRUCTURED_PLAN_MODEL.trim(),
    MATRIX_ANALYZE_MODEL: parsed.MATRIX_ANALYZE_MODEL.trim(),
    FAST_FALLBACK_MODEL: parsed.FAST_FALLBACK_MODEL.trim(),
    DIALOG_FALLBACK_MODEL: parsed.DIALOG_FALLBACK_MODEL.trim(),
    MODEL_ROUTING_MODE: parsed.MODEL_ROUTING_MODE.trim() || "policy",
    ALLOW_MODEL_FALLBACK: parseBoolean(parsed.ALLOW_MODEL_FALLBACK.trim()),
    MODEL_ROUTING_FAIL_CLOSED: parseBoolean(parsed.MODEL_ROUTING_FAIL_CLOSED.trim()),
    MODEL_ROUTING_LOG_ENABLED: parseBoolean(parsed.MODEL_ROUTING_LOG_ENABLED.trim()),
    MODEL_ROUTING_LOG_PATH: parsed.MODEL_ROUTING_LOG_PATH.trim() || ".local-ai/logs/WORKFLOW_MODEL_ROUTING.log.md",
    MATRIX_ANALYZE_LLM_ENABLED: parseBoolean(parsed.MATRIX_ANALYZE_LLM_ENABLED.trim()),
    MATRIX_EXECUTE_APPROVAL_REQUIRED: parseBoolean(parsed.MATRIX_EXECUTE_APPROVAL_REQUIRED.trim()),
    MATRIX_VERIFY_AFTER_EXECUTE: parseBoolean(parsed.MATRIX_VERIFY_AFTER_EXECUTE.trim()),
    MATRIX_ALLOWED_ACTION_TYPES: parseCsvList(parsed.MATRIX_ALLOWED_ACTION_TYPES),
    MATRIX_FAIL_CLOSED: parseBoolean(parsed.MATRIX_FAIL_CLOSED.trim()),
    GITHUB_TOKEN: parsed.GITHUB_TOKEN.trim(),
    GITHUB_ALLOWED_REPOS: parseCsvList(parsed.GITHUB_ALLOWED_REPOS),
    GITHUB_AGENT_API_KEY: parsed.GITHUB_AGENT_API_KEY.trim(),
    GITHUB_API_BASE_URL: parsed.GITHUB_API_BASE_URL.trim().replace(/\/+$/, "") || "https://api.github.com",
    GITHUB_DEFAULT_OWNER: parsed.GITHUB_DEFAULT_OWNER.trim(),
    GITHUB_BRANCH_PREFIX: parsed.GITHUB_BRANCH_PREFIX.trim() || "modelgate/github",
    GITHUB_REQUEST_TIMEOUT_MS: Number.parseInt(parsed.GITHUB_REQUEST_TIMEOUT_MS.trim(), 10),
    GITHUB_PLAN_TTL_MS: Number.parseInt(parsed.GITHUB_PLAN_TTL_MS.trim(), 10),
    GITHUB_ACTION_STORE_MODE: parsed.GITHUB_ACTION_STORE_MODE.trim() || "memory",
    GITHUB_ACTION_STORE_FILE_PATH: parsed.GITHUB_ACTION_STORE_FILE_PATH.trim() || ".local-ai/state/github-action-store.json",
    GITHUB_MAX_CONTEXT_FILES: Number.parseInt(parsed.GITHUB_MAX_CONTEXT_FILES.trim(), 10),
    GITHUB_MAX_CONTEXT_BYTES: Number.parseInt(parsed.GITHUB_MAX_CONTEXT_BYTES.trim(), 10),
    GITHUB_SMOKE_REPO: parsed.GITHUB_SMOKE_REPO.trim(),
    GITHUB_SMOKE_BASE_BRANCH: parsed.GITHUB_SMOKE_BASE_BRANCH.trim(),
    GITHUB_SMOKE_TARGET_BRANCH: parsed.GITHUB_SMOKE_TARGET_BRANCH.trim(),
    GITHUB_SMOKE_ENABLED: parseBoolean(parsed.GITHUB_SMOKE_ENABLED.trim()),
    GITHUB_APP_ID: parsed.GITHUB_APP_ID.trim(),
    GITHUB_APP_PRIVATE_KEY: parsed.GITHUB_APP_PRIVATE_KEY.trim(),
    GITHUB_APP_INSTALLATION_ID: parsed.GITHUB_APP_INSTALLATION_ID.trim(),
    RATE_LIMIT_ENABLED: parseBoolean(parsed.RATE_LIMIT_ENABLED.trim()),
    RATE_LIMIT_WINDOW_MS: parsePositiveIntWithPolicy(
      parsed.RATE_LIMIT_WINDOW_MS,
      60_000,
      rateLimitFailClosed,
      "RATE_LIMIT_WINDOW_MS"
    ),
    RATE_LIMIT_CHAT_MAX: parsePositiveIntWithPolicy(
      parsed.RATE_LIMIT_CHAT_MAX,
      30,
      rateLimitFailClosed,
      "RATE_LIMIT_CHAT_MAX"
    ),
    RATE_LIMIT_AUTH_LOGIN_MAX: parsePositiveIntWithPolicy(
      parsed.RATE_LIMIT_AUTH_LOGIN_MAX,
      8,
      rateLimitFailClosed,
      "RATE_LIMIT_AUTH_LOGIN_MAX"
    ),
    RATE_LIMIT_GITHUB_PROPOSE_MAX: parsePositiveIntWithPolicy(
      parsed.RATE_LIMIT_GITHUB_PROPOSE_MAX,
      10,
      rateLimitFailClosed,
      "RATE_LIMIT_GITHUB_PROPOSE_MAX"
    ),
    RATE_LIMIT_GITHUB_EXECUTE_MAX: parsePositiveIntWithPolicy(
      parsed.RATE_LIMIT_GITHUB_EXECUTE_MAX,
      6,
      rateLimitFailClosed,
      "RATE_LIMIT_GITHUB_EXECUTE_MAX"
    ),
    RATE_LIMIT_MATRIX_EXECUTE_MAX: parsePositiveIntWithPolicy(
      parsed.RATE_LIMIT_MATRIX_EXECUTE_MAX,
      6,
      rateLimitFailClosed,
      "RATE_LIMIT_MATRIX_EXECUTE_MAX"
    ),
    RATE_LIMIT_FAIL_CLOSED: rateLimitFailClosed,
    JOURNAL_ENABLED: parseBoolean(parsed.JOURNAL_ENABLED.trim()),
    JOURNAL_STORE_MODE: parsed.JOURNAL_STORE_MODE.trim() || "memory",
    JOURNAL_FILE_PATH: parsed.JOURNAL_FILE_PATH.trim() || ".local-ai/state/runtime-journal.json",
    JOURNAL_MAX_ENTRIES: parsePositiveIntOrDefault(parsed.JOURNAL_MAX_ENTRIES, 500),
    JOURNAL_EXPOSE_RECENT_LIMIT: parsePositiveIntOrDefault(parsed.JOURNAL_EXPOSE_RECENT_LIMIT, 50),
    MODEL_GATE_ADMIN_PASSWORD: parsed.MODEL_GATE_ADMIN_PASSWORD.trim(),
    MODEL_GATE_SESSION_SECRET: parsed.MODEL_GATE_SESSION_SECRET.trim(),
    MODEL_GATE_SESSION_TTL_SECONDS: parsePositiveIntOrDefault(parsed.MODEL_GATE_SESSION_TTL_SECONDS, 86_400)
  };

  return normalized;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  if (fs.existsSync(localEnvPath)) {
    dotenv.config({ path: localEnvPath });
  }

  return createEnv(source);
}

export const env = loadEnv();
