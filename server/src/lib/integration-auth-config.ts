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

export type GitHubOAuthConfig = {
  enabled: boolean;
  configured: boolean;
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
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

export function getGitHubOAuthRequirements(env: AppEnv): string[] {
  const clientId = env.GITHUB_OAUTH_CLIENT_ID.trim();
  const clientSecret = env.GITHUB_OAUTH_CLIENT_SECRET.trim();
  const callbackUrl = env.GITHUB_OAUTH_CALLBACK_URL.trim();
  const sessionSecret = env.MOSAIC_STACK_SESSION_SECRET.trim();
  const requirements: string[] = [];

  if (clientId.length === 0) {
    requirements.push("GITHUB_OAUTH_CLIENT_ID");
  }

  if (clientSecret.length === 0) {
    requirements.push("GITHUB_OAUTH_CLIENT_SECRET");
  }

  if (callbackUrl.length === 0) {
    requirements.push("GITHUB_OAUTH_CALLBACK_URL");
  }

  if (sessionSecret.length === 0) {
    requirements.push("MOSAIC_STACK_SESSION_SECRET");
  }

  return requirements;
}

export function resolveGitHubOAuthConfig(env: AppEnv): GitHubOAuthConfig {
  const clientId = env.GITHUB_OAUTH_CLIENT_ID.trim();
  const clientSecret = env.GITHUB_OAUTH_CLIENT_SECRET.trim();
  const callbackUrl = env.GITHUB_OAUTH_CALLBACK_URL.trim();
  const authorizeUrl = env.GITHUB_OAUTH_AUTHORIZE_URL.trim();
  const tokenUrl = env.GITHUB_OAUTH_TOKEN_URL.trim();
  const requirements = getGitHubOAuthRequirements(env);
  const configured = clientId.length > 0 || clientSecret.length > 0;

  return {
    enabled: requirements.length === 0,
    configured,
    clientId,
    clientSecret,
    callbackUrl,
    authorizeUrl,
    tokenUrl,
    scopes: env.GITHUB_OAUTH_SCOPES,
    requirements
  };
}
