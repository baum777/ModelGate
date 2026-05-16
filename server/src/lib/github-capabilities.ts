import { timingSafeEqual } from "node:crypto";
import type { GitHubConfig } from "./github-env.js";

export type GitHubExecuteBlockReason =
  | "github_not_configured"
  | "missing_admin_key"
  | "invalid_admin_key";

export type GitHubClientCapabilities = {
  canExecute: boolean;
  executeBlockReason: GitHubExecuteBlockReason | null;
  generatedAt: string;
};

function hasConfiguredAdminKey(config: GitHubConfig) {
  return Boolean(config.agentApiKey && config.agentApiKey.trim().length > 0);
}

function hasMatchingAdminKey(config: GitHubConfig, providedAdminKey: string | null) {
  const configuredKey = config.agentApiKey?.trim();
  const providedKey = providedAdminKey?.trim() ?? "";

  if (!configuredKey || providedKey.length === 0) {
    return false;
  }

  const configuredKeyBuffer = Buffer.from(configuredKey);
  const providedKeyBuffer = Buffer.from(providedKey);

  if (configuredKeyBuffer.length !== providedKeyBuffer.length) {
    return false;
  }

  return timingSafeEqual(configuredKeyBuffer, providedKeyBuffer);
}

export function deriveGitHubClientCapabilities(options: {
  config: GitHubConfig;
  providedAdminKey: string | null;
  now?: Date;
}): GitHubClientCapabilities {
  const generatedAt = (options.now ?? new Date()).toISOString();

  if (!options.config.ready || !hasConfiguredAdminKey(options.config)) {
    return {
      canExecute: false,
      executeBlockReason: "github_not_configured",
      generatedAt,
    };
  }

  const providedAdminKey = options.providedAdminKey?.trim() ?? "";

  if (providedAdminKey.length === 0) {
    return {
      canExecute: false,
      executeBlockReason: "missing_admin_key",
      generatedAt,
    };
  }

  if (!hasMatchingAdminKey(options.config, providedAdminKey)) {
    return {
      canExecute: false,
      executeBlockReason: "invalid_admin_key",
      generatedAt,
    };
  }

  return {
    canExecute: true,
    executeBlockReason: null,
    generatedAt,
  };
}
