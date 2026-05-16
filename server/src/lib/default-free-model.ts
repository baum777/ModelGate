import type { AppEnv } from "./env.js";
import { normalizeConfiguredModelId } from "./model-id.js";
import type { UserOpenRouterCredential } from "./openrouter-credential-store.js";

export const DEFAULT_FREE_MODEL_ALIAS = "default-free";
export const DEFAULT_FREE_MODEL_LOGICAL_ID = "stable-default-free";
export const DEFAULT_FREE_MODEL_DEV_FALLBACK = "deepseek/deepseek-v4-flash:free";
const DEFAULT_FREE_LABEL = "Free default";

export type DefaultFreeStatusCode = "configured" | "missing_key" | "missing_model";
export type DefaultFreeSource = "user_configured" | "env_configured" | "dev_fallback";

export type DefaultFreeConfiguration = {
  alias: typeof DEFAULT_FREE_MODEL_ALIAS;
  logicalModelId: typeof DEFAULT_FREE_MODEL_LOGICAL_ID;
  label: string;
  source: DefaultFreeSource;
  status: DefaultFreeStatusCode;
  modelId: string | null;
  providerTargets: string[];
  apiKey: string | null;
  usedDevFallbackModel: boolean;
};

function normalizeApiKey(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function dedupe(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function buildFallbackTargets(env: AppEnv, primaryModelId: string) {
  return dedupe([
    normalizeConfiguredModelId(env.DIALOG_FALLBACK_MODEL),
    normalizeConfiguredModelId(env.FAST_FALLBACK_MODEL),
    ...env.OPENROUTER_MODELS.map((value) => normalizeConfiguredModelId(value) ?? value)
  ]).filter((value) => value !== primaryModelId);
}

function resolveLabel(env: AppEnv) {
  const trimmed = env.OPENROUTER_DEFAULT_LABEL.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_FREE_LABEL;
}

function resolveEnvDefaultModel(env: AppEnv) {
  const configured = normalizeConfiguredModelId(env.OPENROUTER_DEFAULT_MODEL);

  if (configured) {
    return {
      modelId: configured,
      source: "env_configured" as const,
      usedDevFallbackModel: false,
    };
  }

  if (process.env.NODE_ENV !== "production") {
    return {
      modelId: DEFAULT_FREE_MODEL_DEV_FALLBACK,
      source: "dev_fallback" as const,
      usedDevFallbackModel: true,
    };
  }

  return {
    modelId: null,
    source: "env_configured" as const,
    usedDevFallbackModel: false,
  };
}

export function resolveDefaultFreeConfiguration(env: AppEnv, userCredential: UserOpenRouterCredential | null): DefaultFreeConfiguration {
  const label = resolveLabel(env);

  if (userCredential) {
    const modelId = normalizeConfiguredModelId(userCredential.modelId) ?? userCredential.modelId.trim();
    const apiKey = normalizeApiKey(userCredential.apiKey);

    if (!modelId) {
      return {
        alias: DEFAULT_FREE_MODEL_ALIAS,
        logicalModelId: DEFAULT_FREE_MODEL_LOGICAL_ID,
        label,
        source: "user_configured",
        status: "missing_model",
        modelId: null,
        providerTargets: [],
        apiKey,
        usedDevFallbackModel: false,
      };
    }

    if (!apiKey) {
      return {
        alias: DEFAULT_FREE_MODEL_ALIAS,
        logicalModelId: DEFAULT_FREE_MODEL_LOGICAL_ID,
        label,
        source: "user_configured",
        status: "missing_key",
        modelId,
        providerTargets: [modelId],
        apiKey: null,
        usedDevFallbackModel: false,
      };
    }

    return {
      alias: DEFAULT_FREE_MODEL_ALIAS,
      logicalModelId: DEFAULT_FREE_MODEL_LOGICAL_ID,
      label,
      source: "user_configured",
      status: "configured",
      modelId,
      providerTargets: [modelId],
      apiKey,
      usedDevFallbackModel: false,
    };
  }

  const envDefault = resolveEnvDefaultModel(env);
  const apiKey = normalizeApiKey(env.OPENROUTER_API_KEY);

  if (!envDefault.modelId) {
    return {
      alias: DEFAULT_FREE_MODEL_ALIAS,
      logicalModelId: DEFAULT_FREE_MODEL_LOGICAL_ID,
      label,
      source: envDefault.source,
      status: "missing_model",
      modelId: null,
      providerTargets: [],
      apiKey,
      usedDevFallbackModel: envDefault.usedDevFallbackModel,
    };
  }

  const providerTargets = [
    envDefault.modelId,
    ...buildFallbackTargets(env, envDefault.modelId)
  ];

  if (!apiKey) {
    return {
      alias: DEFAULT_FREE_MODEL_ALIAS,
      logicalModelId: DEFAULT_FREE_MODEL_LOGICAL_ID,
      label,
      source: envDefault.source,
      status: "missing_key",
      modelId: envDefault.modelId,
      providerTargets,
      apiKey: null,
      usedDevFallbackModel: envDefault.usedDevFallbackModel,
    };
  }

  return {
    alias: DEFAULT_FREE_MODEL_ALIAS,
    logicalModelId: DEFAULT_FREE_MODEL_LOGICAL_ID,
    label,
    source: envDefault.source,
    status: "configured",
    modelId: envDefault.modelId,
    providerTargets,
    apiKey,
    usedDevFallbackModel: envDefault.usedDevFallbackModel,
  };
}
