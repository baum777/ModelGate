import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const localEnvPath = fileURLToPath(new URL("../../.env", import.meta.url));

export const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  HOST: z.string().trim().min(1).default("127.0.0.1"),
  OPENROUTER_API_KEY: z.string().trim().min(1, "OPENROUTER_API_KEY is required"),
  OPENROUTER_BASE_URL: z.string().trim().default("https://openrouter.ai/api/v1"),
  OPENROUTER_MODEL: z.string().trim().min(1).default("openrouter/auto"),
  OPENROUTER_MODELS: z.string().trim().default(""),
  APP_NAME: z.string().trim().min(1).default("local-openrouter-chat"),
  DEFAULT_SYSTEM_PROMPT: z
    .string()
    .trim()
    .min(1)
    .default("You are a concise, reliable assistant operating through a local OpenRouter proxy."),
  CORS_ORIGINS: z
    .string()
    .trim()
    .default("http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173")
});

export type AppEnv = {
  PORT: number;
  HOST: string;
  OPENROUTER_API_KEY: string;
  OPENROUTER_BASE_URL: string;
  OPENROUTER_MODEL: string;
  OPENROUTER_MODELS: string[];
  APP_NAME: string;
  DEFAULT_SYSTEM_PROMPT: string;
  CORS_ORIGINS: string[];
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
    CORS_ORIGINS: parseCsvList(parsed.CORS_ORIGINS)
  };
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  if (fs.existsSync(localEnvPath)) {
    dotenv.config({ path: localEnvPath });
  }

  return createEnv(source);
}

export const env = loadEnv();
