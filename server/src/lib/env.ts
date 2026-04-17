import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const localEnvPath = fileURLToPath(new URL("../../../.env", import.meta.url));

export const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  HOST: z.string().trim().min(1).default("127.0.0.1"),
  OPENROUTER_API_KEY: z.string().trim().default(""),
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
  GITHUB_TOKEN: z.string().trim().default(""),
  GITHUB_ALLOWED_REPOS: z.string().trim().default(""),
  GITHUB_AGENT_API_KEY: z.string().trim().default(""),
  GITHUB_API_BASE_URL: z.string().trim().default("https://api.github.com"),
  GITHUB_DEFAULT_OWNER: z.string().trim().default(""),
  GITHUB_BRANCH_PREFIX: z.string().trim().default("modelgate/github"),
  GITHUB_REQUEST_TIMEOUT_MS: z.string().trim().default("8000"),
  GITHUB_PLAN_TTL_MS: z.string().trim().default("720000"),
  GITHUB_MAX_CONTEXT_FILES: z.string().trim().default("6"),
  GITHUB_MAX_CONTEXT_BYTES: z.string().trim().default("32768"),
  GITHUB_SMOKE_REPO: z.string().trim().default(""),
  GITHUB_SMOKE_BASE_BRANCH: z.string().trim().default(""),
  GITHUB_SMOKE_TARGET_BRANCH: z.string().trim().default(""),
  GITHUB_SMOKE_ENABLED: z.string().trim().default("false"),
  GITHUB_APP_ID: z.string().trim().default(""),
  GITHUB_APP_PRIVATE_KEY: z.string().trim().default(""),
  GITHUB_APP_INSTALLATION_ID: z.string().trim().default("")
});

export type AppEnv = {
  PORT: number;
  HOST: string;
  OPENROUTER_API_KEY: string;
  OPENROUTER_BASE_URL: string;
  OPENROUTER_MODEL: string;
  OPENROUTER_MODELS: string[];
  OPENROUTER_REQUEST_TIMEOUT_MS: number;
  APP_NAME: string;
  DEFAULT_SYSTEM_PROMPT: string;
  CORS_ORIGINS: string[];
  GITHUB_TOKEN: string;
  GITHUB_ALLOWED_REPOS: string[];
  GITHUB_AGENT_API_KEY: string;
  GITHUB_API_BASE_URL: string;
  GITHUB_DEFAULT_OWNER: string;
  GITHUB_BRANCH_PREFIX: string;
  GITHUB_REQUEST_TIMEOUT_MS: number;
  GITHUB_PLAN_TTL_MS: number;
  GITHUB_MAX_CONTEXT_FILES: number;
  GITHUB_MAX_CONTEXT_BYTES: number;
  GITHUB_SMOKE_REPO: string;
  GITHUB_SMOKE_BASE_BRANCH: string;
  GITHUB_SMOKE_TARGET_BRANCH: string;
  GITHUB_SMOKE_ENABLED: boolean;
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_APP_INSTALLATION_ID: string;
};

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

  return {
    ...parsed,
    OPENROUTER_MODELS: parseCsvList(parsed.OPENROUTER_MODELS),
    OPENROUTER_REQUEST_TIMEOUT_MS: Number.parseInt(parsed.OPENROUTER_REQUEST_TIMEOUT_MS.trim(), 10),
    CORS_ORIGINS: parseCsvList(parsed.CORS_ORIGINS),
    GITHUB_TOKEN: parsed.GITHUB_TOKEN.trim(),
    GITHUB_ALLOWED_REPOS: parseCsvList(parsed.GITHUB_ALLOWED_REPOS),
    GITHUB_AGENT_API_KEY: parsed.GITHUB_AGENT_API_KEY.trim(),
    GITHUB_API_BASE_URL: parsed.GITHUB_API_BASE_URL.trim().replace(/\/+$/, "") || "https://api.github.com",
    GITHUB_DEFAULT_OWNER: parsed.GITHUB_DEFAULT_OWNER.trim(),
    GITHUB_BRANCH_PREFIX: parsed.GITHUB_BRANCH_PREFIX.trim() || "modelgate/github",
    GITHUB_REQUEST_TIMEOUT_MS: Number.parseInt(parsed.GITHUB_REQUEST_TIMEOUT_MS.trim(), 10),
    GITHUB_PLAN_TTL_MS: Number.parseInt(parsed.GITHUB_PLAN_TTL_MS.trim(), 10),
    GITHUB_MAX_CONTEXT_FILES: Number.parseInt(parsed.GITHUB_MAX_CONTEXT_FILES.trim(), 10),
    GITHUB_MAX_CONTEXT_BYTES: Number.parseInt(parsed.GITHUB_MAX_CONTEXT_BYTES.trim(), 10),
    GITHUB_SMOKE_REPO: parsed.GITHUB_SMOKE_REPO.trim(),
    GITHUB_SMOKE_BASE_BRANCH: parsed.GITHUB_SMOKE_BASE_BRANCH.trim(),
    GITHUB_SMOKE_TARGET_BRANCH: parsed.GITHUB_SMOKE_TARGET_BRANCH.trim(),
    GITHUB_SMOKE_ENABLED: /^(1|true|yes|on)$/i.test(parsed.GITHUB_SMOKE_ENABLED.trim()),
    GITHUB_APP_ID: parsed.GITHUB_APP_ID.trim(),
    GITHUB_APP_PRIVATE_KEY: parsed.GITHUB_APP_PRIVATE_KEY.trim(),
    GITHUB_APP_INSTALLATION_ID: parsed.GITHUB_APP_INSTALLATION_ID.trim()
  };
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  if (fs.existsSync(localEnvPath)) {
    dotenv.config({ path: localEnvPath });
  }

  return createEnv(source);
}

export const env = loadEnv();
