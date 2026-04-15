import fs from "node:fs/promises";
import path from "node:path";
import { type LlmRouterLoggingConfig, type LlmRouterTaskType } from "./llm-router.js";

export type RouterDecisionLogResult = "selected" | "failed";

export type RouterDecisionLogEntry = {
  timestamp?: Date;
  taskType: LlmRouterTaskType;
  publicModelId: string;
  providerModelId?: string | null;
  fallbackUsed: boolean;
  candidateCount: number;
  reason: string;
  result: RouterDecisionLogResult;
  promptSummary?: string | null;
};

type FileSystemAdapter = {
  mkdir: typeof fs.mkdir;
  appendFile: typeof fs.appendFile;
};

const DEFAULT_FILE_SYSTEM: FileSystemAdapter = {
  mkdir: fs.mkdir,
  appendFile: fs.appendFile
};

const HIGH_ENTROPY_TOKEN = /\b[a-zA-Z0-9_-]{32,}\b/g;
const BEARER_TOKEN = /\bBearer\s+[a-zA-Z0-9._~+/=-]{8,}\b/gi;
const AUTHORIZATION_HEADER = /(Authorization:\s*)[^\r\n]+/gi;
const SK_PREFIX_TOKEN = /\bsk-[a-zA-Z0-9]{8,}\b/g;

export function redactSensitiveText(input: string) {
  return input
    .replace(AUTHORIZATION_HEADER, "$1[REDACTED]")
    .replace(BEARER_TOKEN, "Bearer [REDACTED]")
    .replace(SK_PREFIX_TOKEN, "sk-[REDACTED]")
    .replace(HIGH_ENTROPY_TOKEN, "[REDACTED]");
}

function summarizePrompt(promptSummary?: string | null) {
  if (!promptSummary || promptSummary.trim().length === 0) {
    return "omitted";
  }

  const redacted = redactSensitiveText(promptSummary.trim());
  return redacted.slice(0, 80);
}

function formatLine(label: string, value: string | number | boolean | null | undefined) {
  return `- ${label}: ${value ?? "omitted"}`;
}

export function buildRouterDecisionMarkdown(entry: RouterDecisionLogEntry) {
  const timestamp = (entry.timestamp ?? new Date()).toISOString();
  const selectedProviderModel = entry.providerModelId && entry.providerModelId.trim().length > 0
    ? entry.providerModelId.trim()
    : "none";

  return [
    `### ${timestamp}`,
    formatLine("Prompt summary", summarizePrompt(entry.promptSummary)),
    formatLine("Detected task type", entry.taskType),
    formatLine("Selected public alias", entry.publicModelId),
    formatLine("Selected provider model", selectedProviderModel),
    formatLine("Fallback used", entry.fallbackUsed),
    formatLine("Candidate count", entry.candidateCount),
    formatLine("Reason", entry.reason),
    formatLine("Result", entry.result)
  ].join("\n") + "\n";
}

export async function appendMarkdownEntry(
  filePath: string,
  markdown: string,
  fileSystem: FileSystemAdapter = DEFAULT_FILE_SYSTEM
) {
  await fileSystem.mkdir(path.dirname(filePath), { recursive: true });
  await fileSystem.appendFile(filePath, markdown.endsWith("\n") ? markdown : `${markdown}\n`, "utf8");
}

export async function recordRouterDecision(
  logging: LlmRouterLoggingConfig,
  entry: RouterDecisionLogEntry,
  fileSystem: FileSystemAdapter = DEFAULT_FILE_SYSTEM
) {
  if (!logging.enabled) {
    return;
  }

  await appendMarkdownEntry(logging.routerLogPath, buildRouterDecisionMarkdown(entry), fileSystem);
}
