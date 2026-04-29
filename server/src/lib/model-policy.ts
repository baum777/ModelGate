import type { AppEnv } from "./env.js";
import { normalizeConfiguredModelId } from "./model-id.js";

export const PUBLIC_MODEL_ALIAS = "default";
export const INTERNAL_LOGICAL_MODEL_ID = "stable-free-default";

export type PublicModelTier = "core" | "specialized" | "fallback";

export type PublicModelDescriptor = {
  alias: string;
  label: string;
  description: string;
  capabilities: string[];
  tier: PublicModelTier;
  streaming: boolean;
  recommendedFor: string[];
  default?: true;
  available?: boolean;
  logicalModelId: string;
  providerTargets: string[];
  selectable: true;
};

export type PublicModelRegistryEntry = Omit<PublicModelDescriptor, "logicalModelId" | "providerTargets" | "selectable">;

export type ResolvedModelSelection = {
  publicModelId: string;
  publicModelAlias: string;
  logicalModelId: string;
  providerTargets: string[];
};

export type ModelResolution =
  | {
    ok: true;
    selection: ResolvedModelSelection;
  }
  | {
    ok: false;
    reason: "unsupported_model" | "no_eligible_provider_targets";
  };

export type ModelRegistry = {
  publicModels: PublicModelDescriptor[];
  defaultModelId: string;
  defaultModelAlias: string;
  addOpenRouterModel(modelId: string): PublicModelRegistryEntry | null;
  resolveModel(requestedModel?: string): ModelResolution;
  getPublicRegistry(): PublicModelRegistryEntry[];
};

function dedupeStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function buildProviderTargets(env: AppEnv) {
  return dedupeStrings([
    normalizeConfiguredModelId(env.CHAT_MODEL) ?? null,
    normalizeConfiguredModelId(env.OPENROUTER_MODEL) ?? null,
    ...env.OPENROUTER_MODELS.map((value) => normalizeConfiguredModelId(value) ?? value)
  ]).filter((value) => value.toLowerCase() !== "default");
}

function normalizeOpenRouterModelInput(input: string) {
  const normalized = normalizeConfiguredModelId(input) ?? input.trim();

  if (!/^[A-Za-z0-9_.:-]+\/[A-Za-z0-9_.:-]+$/.test(normalized)) {
    return null;
  }

  return normalized;
}

function buildConfiguredOpenRouterModel(index: number, modelId: string): PublicModelDescriptor {
  const modelNumber = index + 1;

  return {
    alias: `openrouter-${modelNumber}`,
    label: `OpenRouter model ${modelNumber}`,
    description: "Backend-owned OpenRouter model added in Settings.",
    capabilities: ["chat", "streaming"],
    tier: "specialized",
    streaming: true,
    recommendedFor: ["configured_openrouter"],
    available: true,
    logicalModelId: `settings-openrouter-${modelNumber}`,
    providerTargets: [modelId],
    selectable: true
  };
}

function toPublicModelRegistryEntry(model: PublicModelDescriptor): PublicModelRegistryEntry {
  return {
    alias: model.alias,
    label: model.label,
    description: model.description,
    capabilities: model.capabilities,
    tier: model.tier,
    streaming: model.streaming,
    recommendedFor: model.recommendedFor,
    default: model.default,
    available: model.available
  };
}

export function buildModelRegistry(env: AppEnv): ModelRegistry {
  const providerTargets = buildProviderTargets(env);
  const isAvailable = providerTargets.length > 0;
  const configuredOpenRouterModelIds: string[] = [];
  const publicModel: PublicModelDescriptor = {
    alias: PUBLIC_MODEL_ALIAS,
    label: "Default Assistant",
    description: "Backend-governed general chat mode with deterministic policy routing.",
    capabilities: ["chat", "streaming", "fallback-aware"],
    tier: "core",
    streaming: true,
    recommendedFor: ["general_chat", "summaries", "guided_assistance"],
    default: true,
    available: isAvailable,
    logicalModelId: INTERNAL_LOGICAL_MODEL_ID,
    providerTargets,
    selectable: true
  };
  const publicModels = [publicModel];

  return {
    publicModels,
    defaultModelId: PUBLIC_MODEL_ALIAS,
    defaultModelAlias: PUBLIC_MODEL_ALIAS,
    addOpenRouterModel(modelId) {
      const normalizedModel = normalizeOpenRouterModelInput(modelId);

      if (!normalizedModel) {
        return null;
      }

      const existingIndex = configuredOpenRouterModelIds.indexOf(normalizedModel);

      if (existingIndex !== -1) {
        const existingModel = publicModels[existingIndex + 1];

        return existingModel ? toPublicModelRegistryEntry(existingModel) : null;
      }

      configuredOpenRouterModelIds.push(normalizedModel);
      const configuredModel = buildConfiguredOpenRouterModel(configuredOpenRouterModelIds.length - 1, normalizedModel);
      publicModels.push(configuredModel);

      return toPublicModelRegistryEntry(configuredModel);
    },
    resolveModel(requestedModel) {
      const normalizedModel = requestedModel?.trim();
      const requestedAlias = normalizedModel && normalizedModel.length > 0 ? normalizedModel : PUBLIC_MODEL_ALIAS;
      const selectedModel = publicModels.find((model) => model.alias === requestedAlias);

      if (!selectedModel) {
        return {
          ok: false,
          reason: "unsupported_model"
        };
      }

      if (selectedModel.providerTargets.length === 0) {
        return {
          ok: false,
          reason: "no_eligible_provider_targets"
        };
      }

      return {
        ok: true,
        selection: {
          publicModelId: selectedModel.alias,
          publicModelAlias: selectedModel.alias,
          logicalModelId: selectedModel.logicalModelId,
          providerTargets: selectedModel.providerTargets
        }
      };
    },
    getPublicRegistry() {
      return publicModels.map((model) => toPublicModelRegistryEntry(model));
    }
  };
}
