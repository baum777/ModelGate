import type { AppEnv } from "./env.js";

export const PUBLIC_MODEL_ALIAS = "default";
export const INTERNAL_LOGICAL_MODEL_ID = "stable-free-default";

export type PublicModelDescriptor = {
  id: string;
  label: string;
  logicalModelId: string;
  selectable: true;
};

export type ResolvedModelSelection = {
  publicModelId: string;
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
  resolveModel(requestedModel?: string): ModelResolution;
};

function dedupeStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function buildProviderTargets(env: AppEnv) {
  return dedupeStrings([
    env.OPENROUTER_MODEL,
    ...env.OPENROUTER_MODELS
  ]);
}

export function buildModelRegistry(env: AppEnv): ModelRegistry {
  const providerTargets = buildProviderTargets(env);

  return {
    publicModels: [
      {
        id: PUBLIC_MODEL_ALIAS,
        label: "Default",
        logicalModelId: INTERNAL_LOGICAL_MODEL_ID,
        selectable: true
      }
    ],
    defaultModelId: PUBLIC_MODEL_ALIAS,
    resolveModel(requestedModel) {
      const normalizedModel = requestedModel?.trim();

      if (normalizedModel && normalizedModel !== PUBLIC_MODEL_ALIAS) {
        return {
          ok: false,
          reason: "unsupported_model"
        };
      }

      if (providerTargets.length === 0) {
        return {
          ok: false,
          reason: "no_eligible_provider_targets"
        };
      }

      return {
        ok: true,
        selection: {
          publicModelId: PUBLIC_MODEL_ALIAS,
          logicalModelId: INTERNAL_LOGICAL_MODEL_ID,
          providerTargets
        }
      };
    }
  };
}
