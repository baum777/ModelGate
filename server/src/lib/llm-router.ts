import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import type { ChatRequest } from "./chat-contract.js";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

export type LlmRouterTaskType =
  | "coding"
  | "repo_review"
  | "architecture"
  | "deep_reasoning"
  | "long_context"
  | "ui_review"
  | "daily";

export type LlmRouterRule = {
  taskType: LlmRouterTaskType;
  keywords: string[];
  model: string;
};

export type LlmRouterLoggingConfig = {
  enabled: boolean;
  routerLogPath: string;
  modelRunLogPath: string;
  promptEvidenceLogPath: string;
};

export type LlmRouterPolicy = {
  enabled: boolean;
  mode: "rules_first";
  requireFreeModels: boolean;
  maxFallbacks: number;
  failClosed: boolean;
  defaultModel: string;
  fallbackModel: string;
  rules: LlmRouterRule[];
  logging: LlmRouterLoggingConfig;
};

export type LlmRouterResolution =
  | {
    ok: true;
    taskType: LlmRouterTaskType;
    selectedModel: string;
    candidateModels: string[];
    fallbackUsed: boolean;
    reason: string;
  }
  | {
    ok: false;
    taskType: LlmRouterTaskType;
    candidateModels: string[];
    reason: string;
    message: string;
  };

type LlmRouterFile = {
  mode?: unknown;
  requireFreeModels?: unknown;
  maxFallbacks?: unknown;
  defaultModel?: unknown;
  fallbackModel?: unknown;
  rules?: unknown;
};

type LlmRouterEnv = NodeJS.ProcessEnv & {
  LLM_ROUTER_ENABLED?: string;
  LLM_ROUTER_MODE?: string;
  LLM_REQUIRE_FREE_MODELS?: string;
  LLM_MAX_FALLBACKS?: string;
  LLM_ROUTER_FAIL_CLOSED?: string;
  LLM_ROUTER_LOG_ENABLED?: string;
  LLM_ROUTER_LOG_PATH?: string;
  LLM_MODEL_RUN_LOG_PATH?: string;
  LLM_PROMPT_EVIDENCE_LOG_PATH?: string;
  LLM_ROUTER_POLICY_PATH?: string;
  LLM_PROMPT_CLASSIFIER_PATH?: string;
  LLM_MODEL_MAP_PATH?: string;
  LLM_FALLBACK_POLICY_PATH?: string;
  LLM_DEFAULT_MODEL?: string;
  LLM_FALLBACK_MODEL?: string;
  LLM_MODEL_CODING?: string;
  LLM_MODEL_REPO_REVIEW?: string;
  LLM_MODEL_ARCHITECTURE?: string;
  LLM_MODEL_DEEP_REASONING?: string;
  LLM_MODEL_LONG_CONTEXT?: string;
  LLM_MODEL_UI_REVIEW?: string;
  LLM_MODEL_DAILY?: string;
};

const DEFAULT_RULES: LlmRouterRule[] = [
  {
    taskType: "coding",
    model: "qwen/qwen3-coder:free",
    keywords: [
      "code",
      "coding",
      "implement",
      "bug",
      "fix",
      "refactor",
      "test",
      "typecheck",
      "build",
      "patch"
    ]
  },
  {
    taskType: "repo_review",
    model: "mistralai/devstral-2512:free",
    keywords: [
      "review",
      "pull request",
      "pr",
      "diff",
      "audit",
      "regression",
      "comments",
      "feedback"
    ]
  },
  {
    taskType: "architecture",
    model: "qwen/qwen3-next-80b-a3b-instruct:free",
    keywords: [
      "architecture",
      "plan",
      "migration",
      "design",
      "boundary",
      "contract",
      "rollout"
    ]
  },
  {
    taskType: "deep_reasoning",
    model: "deepseek/deepseek-r1-0528:free",
    keywords: [
      "why",
      "reason",
      "analysis",
      "tradeoff",
      "diagnose",
      "investigate",
      "root cause",
      "deep"
    ]
  },
  {
    taskType: "long_context",
    model: "nvidia/nemotron-3-super-120b-a12b:free",
    keywords: [
      "long context",
      "summarize",
      "summary",
      "multiple files",
      "across files",
      "history",
      "thread"
    ]
  },
  {
    taskType: "ui_review",
    model: "google/gemma-4-26b-a4b-it:free",
    keywords: [
      "ui",
      "ux",
      "frontend",
      "layout",
      "design",
      "component",
      "screen",
      "styling",
      "visual",
      "stitch"
    ]
  },
  {
    taskType: "daily",
    model: "openai/gpt-oss-120b:free",
    keywords: []
  }
];

const DEFAULT_ROUTER_POLICY_PATH = "config/llm-router.yml";
const DEFAULT_ROUTER_LOG_PATH = ".local-ai/logs/ROUTER_DECISIONS.log.md";
const DEFAULT_MODEL_RUN_LOG_PATH = ".local-ai/logs/MODEL_RUNS.log.md";
const DEFAULT_PROMPT_EVIDENCE_LOG_PATH = ".local-ai/logs/PROMPT_EVIDENCE.log.md";

function parseBoolean(input: string | undefined, defaultValue: boolean) {
  if (input === undefined || input.trim().length === 0) {
    return defaultValue;
  }

  if (/^(1|true|yes|on)$/i.test(input.trim())) {
    return true;
  }

  if (/^(0|false|no|off)$/i.test(input.trim())) {
    return false;
  }

  throw new Error(`Invalid boolean value: ${input}`);
}

function parseInteger(input: string | undefined, defaultValue: number) {
  if (input === undefined || input.trim().length === 0) {
    return defaultValue;
  }

  const value = Number.parseInt(input.trim(), 10);

  if (!Number.isFinite(value) || Number.isNaN(value)) {
    throw new Error(`Invalid integer value: ${input}`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(input: string) {
  return ` ${input.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

function normalizeModelId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

function normalizeTaskType(value: unknown): LlmRouterTaskType | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim() as LlmRouterTaskType;
  return DEFAULT_RULES.some((rule) => rule.taskType === normalized) ? normalized : null;
}

function normalizeKeywords(value: unknown): string[] | null {
  if (value === undefined) {
    return null;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const keywords = value
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean);

  return keywords;
}

function readPolicyFragment(payload: unknown, sourceLabel: string): LlmRouterFile {
  if (!isRecord(payload)) {
    throw new Error(`LLM router policy at ${sourceLabel} must be a YAML object`);
  }

  return {
    mode: payload.mode,
    requireFreeModels: payload.requireFreeModels,
    maxFallbacks: payload.maxFallbacks,
    defaultModel: payload.defaultModel,
    fallbackModel: payload.fallbackModel,
    rules: payload.rules
  };
}

function readYamlFile(filePath: string) {
  const content = fs.readFileSync(filePath, "utf8");
  return parseYaml(content) as unknown;
}

function resolveRepoPath(repoRoot: string, candidatePath: string) {
  return path.isAbsolute(candidatePath) ? candidatePath : path.join(repoRoot, candidatePath);
}

function loadPolicyFragment(repoRoot: string, candidatePath: string | undefined, label: string) {
  if (!candidatePath || candidatePath.trim().length === 0) {
    return null;
  }

  const filePath = resolveRepoPath(repoRoot, candidatePath.trim());

  if (!fs.existsSync(filePath)) {
    throw new Error(`LLM router policy file not found at ${label}: ${filePath}`);
  }

  return readPolicyFragment(readYamlFile(filePath), filePath);
}

function mergeRules(baseRules: LlmRouterRule[], overrideRules?: unknown) {
  if (overrideRules === undefined) {
    return baseRules;
  }

  if (!Array.isArray(overrideRules)) {
    throw new Error("LLM router rules must be an array");
  }

  const nextRules = [...baseRules];

  for (const entry of overrideRules) {
    if (!isRecord(entry)) {
      throw new Error("LLM router rule entries must be objects");
    }

    const taskType = normalizeTaskType(entry.taskType);

    if (!taskType) {
      throw new Error("LLM router rule taskType is invalid");
    }

    const existingIndex = nextRules.findIndex((rule) => rule.taskType === taskType);
    const existingRule = existingIndex >= 0 ? nextRules[existingIndex] : undefined;
    const keywords = normalizeKeywords(entry.keywords) ?? existingRule?.keywords ?? [];
    const model = normalizeModelId(entry.model) ?? existingRule?.model ?? null;

    if (!model) {
      throw new Error(`LLM router rule for ${taskType} requires a model`);
    }

    const rule: LlmRouterRule = {
      taskType,
      keywords,
      model
    };

    if (existingIndex >= 0) {
      nextRules[existingIndex] = rule;
    } else {
      nextRules.push(rule);
    }
  }

  return nextRules;
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isFreeModel(model: string) {
  const normalized = model.trim().toLowerCase();
  return normalized === "openrouter/free" || normalized.endsWith(":free");
}

function defaultPolicyFromRules(rules: LlmRouterRule[], overrides?: Partial<LlmRouterPolicy>): LlmRouterPolicy {
  const logging: LlmRouterLoggingConfig = {
    enabled: false,
    routerLogPath: DEFAULT_ROUTER_LOG_PATH,
    modelRunLogPath: DEFAULT_MODEL_RUN_LOG_PATH,
    promptEvidenceLogPath: DEFAULT_PROMPT_EVIDENCE_LOG_PATH
  };

  return {
    enabled: overrides?.enabled ?? false,
    mode: "rules_first",
    requireFreeModels: overrides?.requireFreeModels ?? true,
    maxFallbacks: overrides?.maxFallbacks ?? 2,
    failClosed: overrides?.failClosed ?? true,
    defaultModel: overrides?.defaultModel ?? "openrouter/free",
    fallbackModel: overrides?.fallbackModel ?? "openai/gpt-oss-120b:free",
    rules,
    logging
  };
}

function normalizePolicyRules(rules: LlmRouterRule[]) {
  const normalized = rules.map((rule) => ({
    taskType: rule.taskType,
    keywords: rule.keywords.map((keyword) => keyword.trim()).filter(Boolean),
    model: rule.model.trim()
  }));

  const seen = new Set<string>();

  for (const rule of normalized) {
    if (seen.has(rule.taskType)) {
      throw new Error(`LLM router policy defines duplicate rule for ${rule.taskType}`);
    }

    seen.add(rule.taskType);
  }

  const missing = DEFAULT_RULES
    .map((rule) => rule.taskType)
    .filter((taskType) => !seen.has(taskType));

  if (missing.length > 0) {
    throw new Error(`LLM router policy is missing rules for: ${missing.join(", ")}`);
  }

  const daily = normalized.find((rule) => rule.taskType === "daily");

  if (!daily || daily.model.length === 0) {
    throw new Error("LLM router policy requires a daily catch-all model");
  }

  return normalized;
}

function validatePolicy(policy: LlmRouterPolicy) {
  if (policy.mode !== "rules_first") {
    throw new Error("LLM router only supports rules_first mode");
  }

  if (!Number.isInteger(policy.maxFallbacks) || policy.maxFallbacks < 0) {
    throw new Error("LLM router maxFallbacks must be a non-negative integer");
  }

  if (policy.defaultModel.trim().length === 0) {
    throw new Error("LLM router defaultModel is required");
  }

  if (policy.fallbackModel.trim().length === 0) {
    throw new Error("LLM router fallbackModel is required");
  }

  for (const rule of policy.rules) {
    if (rule.taskType !== "daily" && rule.keywords.length === 0) {
      throw new Error(`LLM router rule ${rule.taskType} requires at least one keyword`);
    }

    if (rule.model.trim().length === 0) {
      throw new Error(`LLM router rule ${rule.taskType} requires a model`);
    }
  }

  return policy;
}

function buildPolicyFromFiles(repoRoot: string, env: LlmRouterEnv) {
  const basePath = env.LLM_ROUTER_POLICY_PATH ?? DEFAULT_ROUTER_POLICY_PATH;
  const baseFilePath = resolveRepoPath(repoRoot, basePath);

  if (!fs.existsSync(baseFilePath)) {
    throw new Error(`LLM router policy file not found: ${baseFilePath}`);
  }

  const baseFragment = readPolicyFragment(readYamlFile(baseFilePath), baseFilePath);
  const classifierFragment = loadPolicyFragment(repoRoot, env.LLM_PROMPT_CLASSIFIER_PATH, "LLM_PROMPT_CLASSIFIER_PATH");
  const modelMapFragment = loadPolicyFragment(repoRoot, env.LLM_MODEL_MAP_PATH, "LLM_MODEL_MAP_PATH");
  const fallbackFragment = loadPolicyFragment(repoRoot, env.LLM_FALLBACK_POLICY_PATH, "LLM_FALLBACK_POLICY_PATH");

  let rules = mergeRules(DEFAULT_RULES, baseFragment.rules);

  if (classifierFragment?.rules !== undefined) {
    rules = mergeRules(rules, classifierFragment.rules);
  }

  if (modelMapFragment?.rules !== undefined) {
    rules = mergeRules(rules, modelMapFragment.rules);
  }

  rules = normalizePolicyRules(rules);
  const fallbackConfig = fallbackFragment ?? {};

  const envRuleOverrides: Partial<Record<LlmRouterTaskType, string | undefined>> = {
    coding: env.LLM_MODEL_CODING,
    repo_review: env.LLM_MODEL_REPO_REVIEW,
    architecture: env.LLM_MODEL_ARCHITECTURE,
    deep_reasoning: env.LLM_MODEL_DEEP_REASONING,
    long_context: env.LLM_MODEL_LONG_CONTEXT,
    ui_review: env.LLM_MODEL_UI_REVIEW,
    daily: env.LLM_MODEL_DAILY
  };

  const nextRules = rules.map((rule) => {
    const envModel = envRuleOverrides[rule.taskType];
    const model = normalizeModelId(envModel) ?? rule.model;

    return {
      ...rule,
      model
    };
  });

  const policy: LlmRouterPolicy = {
    enabled: parseBoolean(env.LLM_ROUTER_ENABLED, true),
    mode: (env.LLM_ROUTER_MODE?.trim()
      || (fallbackConfig.mode as string | undefined)
      || (baseFragment.mode as string | undefined)
      || "rules_first") as "rules_first",
    requireFreeModels: parseBoolean(
      env.LLM_REQUIRE_FREE_MODELS,
      (fallbackConfig.requireFreeModels as boolean | undefined)
        ?? (baseFragment.requireFreeModels as boolean | undefined)
        ?? true
    ),
    maxFallbacks: parseInteger(
      env.LLM_MAX_FALLBACKS,
      (fallbackConfig.maxFallbacks as number | undefined)
        ?? (baseFragment.maxFallbacks as number | undefined)
        ?? 2
    ),
    failClosed: parseBoolean(env.LLM_ROUTER_FAIL_CLOSED, true),
    defaultModel: normalizeModelId(env.LLM_DEFAULT_MODEL)
      ?? normalizeModelId(fallbackConfig.defaultModel)
      ?? normalizeModelId(baseFragment.defaultModel)
      ?? "openrouter/free",
    fallbackModel: normalizeModelId(env.LLM_FALLBACK_MODEL)
      ?? normalizeModelId(fallbackConfig.fallbackModel)
      ?? normalizeModelId(baseFragment.fallbackModel)
      ?? "openai/gpt-oss-120b:free",
    rules: nextRules,
    logging: {
      enabled: parseBoolean(env.LLM_ROUTER_LOG_ENABLED, false),
      routerLogPath: resolveRepoPath(repoRoot, env.LLM_ROUTER_LOG_PATH ?? DEFAULT_ROUTER_LOG_PATH),
      modelRunLogPath: resolveRepoPath(repoRoot, env.LLM_MODEL_RUN_LOG_PATH ?? DEFAULT_MODEL_RUN_LOG_PATH),
      promptEvidenceLogPath: resolveRepoPath(
        repoRoot,
        env.LLM_PROMPT_EVIDENCE_LOG_PATH ?? DEFAULT_PROMPT_EVIDENCE_LOG_PATH
      )
    }
  };

  return validatePolicy(policy);
}

export function loadLlmRouterPolicy(
  source: LlmRouterEnv = process.env,
  options: { repoRoot?: string } = {}
) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;

  if (parseBoolean(source.LLM_ROUTER_ENABLED, false) === false) {
    const policy = defaultPolicyFromRules(DEFAULT_RULES.map((rule) => ({ ...rule })), {
      enabled: false,
      mode: "rules_first",
      requireFreeModels: parseBoolean(source.LLM_REQUIRE_FREE_MODELS, true),
      maxFallbacks: parseInteger(source.LLM_MAX_FALLBACKS, 2),
      failClosed: parseBoolean(source.LLM_ROUTER_FAIL_CLOSED, true),
      defaultModel: normalizeModelId(source.LLM_DEFAULT_MODEL) ?? "openrouter/free",
      fallbackModel: normalizeModelId(source.LLM_FALLBACK_MODEL) ?? "openai/gpt-oss-120b:free"
    });

    return {
      ...policy,
      logging: {
        enabled: parseBoolean(source.LLM_ROUTER_LOG_ENABLED, false),
        routerLogPath: resolveRepoPath(repoRoot, source.LLM_ROUTER_LOG_PATH ?? DEFAULT_ROUTER_LOG_PATH),
        modelRunLogPath: resolveRepoPath(repoRoot, source.LLM_MODEL_RUN_LOG_PATH ?? DEFAULT_MODEL_RUN_LOG_PATH),
        promptEvidenceLogPath: resolveRepoPath(
          repoRoot,
          source.LLM_PROMPT_EVIDENCE_LOG_PATH ?? DEFAULT_PROMPT_EVIDENCE_LOG_PATH
        )
      }
    };
  }

  return buildPolicyFromFiles(repoRoot, source);
}

function getLatestUserMessage(messages: ChatRequest["messages"]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message.role === "user" && typeof message.content === "string") {
      return message.content;
    }
  }

  return "";
}

export function classifyLatestUserMessage(messages: ChatRequest["messages"], rules: LlmRouterRule[]) {
  const latestUserMessage = getLatestUserMessage(messages);
  const haystack = normalizeText(latestUserMessage);

  for (const rule of rules) {
    if (rule.taskType === "daily") {
      continue;
    }

    for (const keyword of rule.keywords) {
      const needle = normalizeText(keyword);

      if (haystack.includes(needle)) {
        return rule.taskType;
      }
    }
  }

  return "daily";
}

function buildCandidateModels(taskType: LlmRouterTaskType, policy: LlmRouterPolicy, baseProviderTargets: string[]) {
  const rule = policy.rules.find((entry) => entry.taskType === taskType) ?? policy.rules.find((entry) => entry.taskType === "daily");

  if (!rule) {
    return [];
  }

  const rawCandidates = unique([
    rule.model,
    policy.defaultModel,
    policy.fallbackModel,
    ...baseProviderTargets
  ]);

  const cappedCandidates = rawCandidates.slice(0, 1 + policy.maxFallbacks);

  return policy.requireFreeModels
    ? cappedCandidates.filter((candidate) => isFreeModel(candidate))
    : cappedCandidates;
}

export function resolveLlmRouterSelection(options: {
  messages: ChatRequest["messages"];
  baseProviderTargets: string[];
  policy: LlmRouterPolicy;
}): LlmRouterResolution {
  const baseProviderTargets = unique(options.baseProviderTargets);

  if (!options.policy.enabled) {
    const candidateModels = baseProviderTargets.length > 0 ? baseProviderTargets : [options.policy.defaultModel];

    return {
      ok: true,
      taskType: "daily",
      selectedModel: candidateModels[0],
      candidateModels,
      fallbackUsed: false,
      reason: "router_disabled"
    };
  }

  const taskType = classifyLatestUserMessage(options.messages, options.policy.rules);
  const rule = options.policy.rules.find((entry) => entry.taskType === taskType) ?? options.policy.rules.find((entry) => entry.taskType === "daily");
  const candidateModels = buildCandidateModels(taskType, options.policy, baseProviderTargets);

  if (candidateModels.length === 0) {
    return {
      ok: false,
      taskType,
      candidateModels,
      reason: "no_valid_candidate",
      message: options.policy.failClosed
        ? "LLM router failed closed because no valid model candidate remained"
        : "LLM router had no valid model candidate"
    };
  }

  const selectedModel = candidateModels[0];

  return {
    ok: true,
    taskType,
    selectedModel,
    candidateModels,
    fallbackUsed: selectedModel !== (rule?.model ?? selectedModel),
    reason: taskType === "daily" ? "catch_all" : "matched_rule"
  };
}

export function isFreeModelCandidate(model: string) {
  return isFreeModel(model);
}
