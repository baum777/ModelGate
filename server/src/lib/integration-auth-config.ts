import type { AppEnv } from "./env.js";

export type GitHubAppConfig = {
  enabled: boolean;
  configured: boolean;
  appId: string;
  privateKey: string;
  slug: string;
  installUrl: string;
  requirements: string[];
};

function normalizeBaseUrl(input: string) {
  return input.trim().replace(/\/+$/, "");
}

export function getGitHubAppRequirements(env: AppEnv): string[] {
  const appId = env.GITHUB_APP_ID.trim();
  const privateKey = env.GITHUB_APP_PRIVATE_KEY.trim();
  const slug = env.GITHUB_APP_SLUG.trim();
  const sessionSecret = env.MOSAIC_STACK_SESSION_SECRET.trim();
  const requirements: string[] = [];

  if (appId.length === 0) {
    requirements.push("GITHUB_APP_ID");
  }

  if (privateKey.length === 0) {
    requirements.push("GITHUB_APP_PRIVATE_KEY");
  }

  if (slug.length === 0) {
    requirements.push("GITHUB_APP_SLUG");
  }

  if (sessionSecret.length === 0) {
    requirements.push("MOSAIC_STACK_SESSION_SECRET");
  }

  return requirements;
}

export function formatMissingServerConfigDetails(providerLabel: string, requirements: string[]) {
  if (requirements.length === 0) {
    return null;
  }

  return `Missing ${providerLabel} server config: ${requirements.join(", ")}`;
}

export function resolveGitHubAppConfig(env: AppEnv): GitHubAppConfig {
  const appId = env.GITHUB_APP_ID.trim();
  const privateKey = env.GITHUB_APP_PRIVATE_KEY.trim();
  const slug = env.GITHUB_APP_SLUG.trim();
  const requirements = getGitHubAppRequirements(env);
  const configured = appId.length > 0 || privateKey.length > 0 || slug.length > 0;
  const enabled = requirements.length === 0;

  return {
    enabled,
    configured,
    appId,
    privateKey,
    slug,
    installUrl: `https://github.com/apps/${normalizeBaseUrl(slug || "")}/installations/new`,
    requirements
  };
}
