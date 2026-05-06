import { createApp, type AppDependencies } from "../app.js";
import { createEnv, loadEnv, type AppEnv } from "../lib/env.js";
import { createGitHubConfig, type GitHubConfig } from "../lib/github-env.js";
import { createMatrixConfig, type MatrixConfig } from "../lib/matrix-env.js";
import { buildModelRegistry, type ModelRegistry } from "../lib/model-policy.js";
import { createOpenRouterClient, type OpenRouterClient } from "../lib/openrouter.js";
import { loadModelCapabilitiesConfig, type ModelCapabilitiesConfig } from "../lib/workflow-model-router.js";

export type RuntimeConfig = {
  env: AppEnv;
  githubConfig: GitHubConfig;
  matrixConfig: MatrixConfig;
  modelRegistry: ModelRegistry;
  modelCapabilitiesConfig: ModelCapabilitiesConfig;
  openRouter: OpenRouterClient;
};

export type RuntimeConfigOptions = {
  source?: NodeJS.ProcessEnv;
  loadDotEnv?: boolean;
};

function resolveEnv(options: RuntimeConfigOptions): AppEnv {
  const source = options.source ?? process.env;

  if (options.loadDotEnv) {
    return loadEnv(source);
  }

  return createEnv(source);
}

export function createRuntimeConfig(options: RuntimeConfigOptions = {}): RuntimeConfig {
  const source = options.source ?? process.env;
  const env = resolveEnv(options);
  const modelCapabilitiesConfig = loadModelCapabilitiesConfig();

  return {
    env,
    githubConfig: createGitHubConfig(env),
    matrixConfig: createMatrixConfig(source),
    modelRegistry: buildModelRegistry(env),
    modelCapabilitiesConfig,
    openRouter: createOpenRouterClient({ env })
  };
}

export function createAppFromRuntimeConfig(runtimeConfig: RuntimeConfig, logger: boolean) {
  const deps: AppDependencies = {
    env: runtimeConfig.env,
    openRouter: runtimeConfig.openRouter,
    githubConfig: runtimeConfig.githubConfig,
    matrixConfig: runtimeConfig.matrixConfig,
    modelRegistry: runtimeConfig.modelRegistry,
    modelCapabilitiesConfig: runtimeConfig.modelCapabilitiesConfig,
    logger
  };

  return createApp(deps);
}
