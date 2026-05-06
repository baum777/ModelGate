import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { AppEnv } from "./env.js";
import { appendMarkdownEntry } from "./local-evidence-log.js";
import { normalizeConfiguredModelId } from "./model-id.js";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const DEFAULT_MODEL_CAPABILITIES_PATH = "config/model-capabilities.yml";
const DEFAULT_MODEL_ROUTING_LOG_PATH = ".local-ai/logs/WORKFLOW_MODEL_ROUTING.log.md";

const CapabilitySchema = z.object({
  model_env: z.string().trim().min(1),
  recommended_model: z.string().trim().min(1),
  purpose: z.array(z.string().trim().min(1)),
  strengths: z.array(z.string().trim().min(1)),
  best_practices: z.array(z.string().trim().min(1)),
  structured_output_required: z.boolean(),
  approval_required: z.boolean(),
  may_execute_external_tools: z.boolean(),
  may_write_external_state: z.boolean(),
  fallback_env: z.string().trim().min(1).nullable()
}).strict();

const ModelCapabilitiesSchema = z.object({
  models: z.object({
    chat_primary: CapabilitySchema,
    github_code_agent: CapabilitySchema,
    structured_plan: CapabilitySchema,
    matrix_analyze: CapabilitySchema,
    fast_fallback: CapabilitySchema,
    dialog_fallback: CapabilitySchema
  }).strict(),
  global_policy: z.object({
    frontend_may_request_workflow: z.boolean(),
    frontend_may_select_provider_model: z.boolean(),
    require_backend_owned_model_resolution: z.boolean(),
    require_schema_validation_for_privileged_paths: z.boolean(),
    require_approval_before_execute: z.boolean(),
    allow_fallback_on_execute: z.boolean(),
    fail_closed_on_malformed_output: z.boolean(),
    fail_closed_on_unknown_action_type: z.boolean()
  }).strict()
}).strict();

export type WorkflowModelRole =
  | "chat"
  | "github_code_agent"
  | "structured_plan"
  | "matrix_analyze"
  | "fast_fallback"
  | "dialog_fallback";

export type WorkflowModelSectionKey =
  | "chat_primary"
  | "github_code_agent"
  | "structured_plan"
  | "matrix_analyze"
  | "fast_fallback"
  | "dialog_fallback";
type LegacyWorkflowFallbackKey = keyof AppEnv | "OPENROUTER_MODEL";

export type ModelCapabilityEntry = z.infer<typeof CapabilitySchema>;
export type ModelCapabilitiesConfig = z.infer<typeof ModelCapabilitiesSchema>;
export type ModelCapabilitiesGlobalPolicy = ModelCapabilitiesConfig["global_policy"];

export type WorkflowModelPolicy = {
  role: WorkflowModelRole;
  sectionKey: WorkflowModelSectionKey;
  modelEnv: keyof AppEnv;
  fallbackEnv: string | null;
  selectedModel: string;
  candidateModels: string[];
  fallbackUsed: boolean;
  selectionSource: "env" | "legacy_openrouter_model" | "fallback_env" | "recommended_model";
  routingMode: "policy";
  allowFallback: boolean;
  failClosed: boolean;
  structuredOutputRequired: boolean;
  approvalRequired: boolean;
  mayExecuteExternalTools: boolean;
  mayWriteExternalState: boolean;
  logging: {
    enabled: boolean;
    path: string;
  };
  capabilities: ModelCapabilityEntry;
  globalPolicy: ModelCapabilitiesGlobalPolicy;
};

type WorkflowRouterLogEntry = {
  role: WorkflowModelRole;
  sectionKey: WorkflowModelSectionKey;
  selectedModel: string;
  candidateModels: string[];
  fallbackUsed: boolean;
  selectionSource: WorkflowModelPolicy["selectionSource"];
  allowedFallback: boolean;
  reason: string;
};

const ROLE_SECTION_MAP: Record<WorkflowModelRole, WorkflowModelSectionKey> = {
  chat: "chat_primary",
  github_code_agent: "github_code_agent",
  structured_plan: "structured_plan",
  matrix_analyze: "matrix_analyze",
  fast_fallback: "fast_fallback",
  dialog_fallback: "dialog_fallback"
};

const ROLE_ENV_MAP: Record<WorkflowModelRole, keyof AppEnv> = {
  chat: "CHAT_MODEL",
  github_code_agent: "CODE_AGENT_MODEL",
  structured_plan: "STRUCTURED_PLAN_MODEL",
  matrix_analyze: "MATRIX_ANALYZE_MODEL",
  fast_fallback: "FAST_FALLBACK_MODEL",
  dialog_fallback: "DIALOG_FALLBACK_MODEL"
};

const FALLBACK_CHAIN: Record<WorkflowModelRole, LegacyWorkflowFallbackKey[]> = {
  chat: ["OPENROUTER_MODEL", "DIALOG_FALLBACK_MODEL"],
  github_code_agent: ["FAST_FALLBACK_MODEL"],
  structured_plan: ["CODE_AGENT_MODEL"],
  matrix_analyze: ["FAST_FALLBACK_MODEL"],
  fast_fallback: ["DIALOG_FALLBACK_MODEL"],
  dialog_fallback: []
};

function resolveRepoPath(repoRoot: string, candidatePath: string) {
  return path.isAbsolute(candidatePath) ? candidatePath : path.join(repoRoot, candidatePath);
}

function readYamlFile(filePath: string) {
  const content = fs.readFileSync(filePath, "utf8");
  return parseYaml(content) as unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function validateConfig(payload: unknown, sourceLabel: string): ModelCapabilitiesConfig {
  const parsed = ModelCapabilitiesSchema.safeParse(payload);

  if (!parsed.success) {
    throw new Error(`Model capabilities config at ${sourceLabel} is invalid: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
  }

  return parsed.data;
}

export function loadModelCapabilitiesConfig(options: { repoRoot?: string; filePath?: string } = {}) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const filePath = resolveRepoPath(repoRoot, options.filePath ?? DEFAULT_MODEL_CAPABILITIES_PATH);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Model capabilities config file not found: ${filePath}`);
  }

  return validateConfig(readYamlFile(filePath), filePath);
}

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

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function readWorkflowModelValue(env: AppEnv, key: LegacyWorkflowFallbackKey) {
  if (key === "OPENROUTER_MODEL") {
    return normalizeConfiguredModelId(env.OPENROUTER_MODEL);
  }

  const value = env[key];

  if (typeof value !== "string") {
    return null;
  }

  return normalizeConfiguredModelId(value);
}

function resolveCandidateModels(role: WorkflowModelRole, env: AppEnv, config: ModelCapabilitiesConfig, allowFallback: boolean) {
  const section = config.models[ROLE_SECTION_MAP[role]];
  const primaryEnvValue = readWorkflowModelValue(env, ROLE_ENV_MAP[role]);
  const legacyPrimary = role === "chat" ? normalizeConfiguredModelId(env.OPENROUTER_MODEL) : null;
  const fallbackCandidates = allowFallback
    ? FALLBACK_CHAIN[role].map((key) => readWorkflowModelValue(env, key))
    : [];
  const recommended = allowFallback ? normalizeConfiguredModelId(section.recommended_model) : null;

  return unique([
    primaryEnvValue,
    legacyPrimary,
    ...fallbackCandidates,
    recommended
  ]);
}

function selectWorkflowCandidate(role: WorkflowModelRole, env: AppEnv, config: ModelCapabilitiesConfig, allowFallback: boolean) {
  const section = config.models[ROLE_SECTION_MAP[role]];
  const candidateModels = resolveCandidateModels(role, env, config, allowFallback);

  if (candidateModels.length === 0) {
    throw new Error(`Workflow model routing failed closed for ${role} because no valid candidate remained`);
  }

  const selectedModel = candidateModels[0];
  const primaryEnvValue = readWorkflowModelValue(env, ROLE_ENV_MAP[role]);
  const legacyPrimary = role === "chat" ? normalizeConfiguredModelId(env.OPENROUTER_MODEL) : null;
  const primarySelection = primaryEnvValue ?? legacyPrimary;
  const fallbackCandidateValues = allowFallback ? FALLBACK_CHAIN[role].map((key) => readWorkflowModelValue(env, key)) : [];
  const fallbackUsed = selectedModel !== primarySelection;

  let selectionSource: WorkflowModelPolicy["selectionSource"] = "recommended_model";

  if (primaryEnvValue && selectedModel === primaryEnvValue) {
    selectionSource = "env";
  } else if (role === "chat" && legacyPrimary && selectedModel === legacyPrimary) {
    selectionSource = "legacy_openrouter_model";
  } else if (fallbackCandidateValues.includes(selectedModel)) {
    selectionSource = "fallback_env";
  } else {
    selectionSource = "recommended_model";
  }

  return {
    section,
    candidateModels,
    selectedModel,
    fallbackUsed,
    selectionSource
  };
}

export function resolveWorkflowModelPolicy(
  role: WorkflowModelRole,
  env: AppEnv,
  config: ModelCapabilitiesConfig
): WorkflowModelPolicy {
  const sectionKey = ROLE_SECTION_MAP[role];
  const section = config.models[sectionKey];
  const routingMode = env.MODEL_ROUTING_MODE.trim() || "policy";

  if (routingMode !== "policy") {
    throw new Error(`Unsupported workflow model routing mode: ${routingMode}`);
  }

  const allowFallback = env.ALLOW_MODEL_FALLBACK;
  const selection = selectWorkflowCandidate(role, env, config, allowFallback);
  const loggingEnabled = env.MODEL_ROUTING_LOG_ENABLED;
  const routingLogPath = normalizeConfiguredModelId(env.MODEL_ROUTING_LOG_PATH) ?? DEFAULT_MODEL_ROUTING_LOG_PATH;

  return {
    role,
    sectionKey,
    modelEnv: ROLE_ENV_MAP[role],
    fallbackEnv: section.fallback_env,
    selectedModel: selection.selectedModel,
    candidateModels: selection.candidateModels,
    fallbackUsed: selection.fallbackUsed,
    selectionSource: selection.selectionSource,
    routingMode: "policy",
    allowFallback,
    failClosed: env.MODEL_ROUTING_FAIL_CLOSED,
    structuredOutputRequired: section.structured_output_required,
    approvalRequired: section.approval_required,
    mayExecuteExternalTools: section.may_execute_external_tools,
    mayWriteExternalState: section.may_write_external_state,
    logging: {
      enabled: loggingEnabled,
      path: resolveRepoPath(fileURLToPath(new URL("../../../", import.meta.url)), routingLogPath)
    },
    capabilities: section,
    globalPolicy: config.global_policy
  };
}

export function resolveGitHubProposalModel(env: AppEnv, config: ModelCapabilitiesConfig) {
  return resolveWorkflowModelPolicy("github_code_agent", env, config);
}

export function resolveStructuredPlanModel(env: AppEnv, config: ModelCapabilitiesConfig) {
  return resolveWorkflowModelPolicy("structured_plan", env, config);
}

export function resolveChatModel(env: AppEnv, config: ModelCapabilitiesConfig) {
  return resolveWorkflowModelPolicy("chat", env, config);
}

export function resolveMatrixAnalyzeModel(env: AppEnv, config: ModelCapabilitiesConfig) {
  return resolveWorkflowModelPolicy("matrix_analyze", env, config);
}

export function assertNoFrontendProviderModelOverride(body: unknown) {
  const blockedKeys = new Set([
    "providerModel",
    "provider_model",
    "providerModelId",
    "provider_model_id",
    "providerTargets",
    "provider_targets",
    "selectedProvider",
    "selected_provider",
    "openrouterModel",
    "openrouter_model",
    "hiddenProviderTargets",
    "hidden_provider_targets"
  ]);

  function walk(value: unknown): boolean {
    const record = asRecord(value);

    if (!record) {
      return false;
    }

    for (const [key, nested] of Object.entries(record)) {
      if (blockedKeys.has(key)) {
        return true;
      }

      if (walk(nested)) {
        return true;
      }
    }

    return false;
  }

  if (walk(body)) {
    throw new Error("Frontend may not supply privileged provider model overrides");
  }
}

export function assertStructuredOutputIfRequired(policy: WorkflowModelPolicy, parsedOutput: unknown) {
  if (!policy.structuredOutputRequired) {
    return;
  }

  if (typeof parsedOutput !== "object" || parsedOutput === null || Array.isArray(parsedOutput)) {
    throw new Error(`Workflow ${policy.role} requires structured JSON output`);
  }
}

export function assertExecuteFallbackBlocked(context: {
  workflow: WorkflowModelRole;
  fallbackUsed: boolean;
  allowFallbackOnExecute: boolean;
}) {
  if (context.allowFallbackOnExecute) {
    return;
  }

  if (context.fallbackUsed) {
    throw new Error(`Execute path for ${context.workflow} must not silently fallback`);
  }
}

export async function recordWorkflowModelDecision(policy: WorkflowModelPolicy, reason: string) {
  if (!policy.logging.enabled) {
    return;
  }

  const timestamp = new Date().toISOString();
  const markdown = [
    `### ${timestamp}`,
    `- Role: ${policy.role}`,
    `- Section: ${policy.sectionKey}`,
    `- Selected model: ${policy.selectedModel}`,
    `- Candidate count: ${policy.candidateModels.length}`,
    `- Fallback used: ${policy.fallbackUsed}`,
    `- Selection source: ${policy.selectionSource}`,
    `- Routing mode: ${policy.routingMode}`,
    `- Allow fallback: ${policy.allowFallback}`,
    `- Reason: ${reason}`
  ].join("\n") + "\n";

  await appendMarkdownEntry(policy.logging.path, markdown);
}
