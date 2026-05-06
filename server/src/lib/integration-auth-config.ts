import type { AppEnv } from "./env.js";

export type GitHubOAuthConfig = {
  enabled: boolean;
  configured: boolean;
  clientId: string;
  clientSecret: string;
  callbackUrl: string | null;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  requirements: string[];
};

function normalizeBaseUrl(input: string) {
  return input.trim().replace(/\/+$/, "");
}

function normalizeHttpUrl(input: string): URL | null {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return null;
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  return parsed;
}

export function getGitHubOAuthRequirements(env: AppEnv): string[] {
  const clientId = env.GITHUB_OAUTH_CLIENT_ID.trim();
  const clientSecret = env.GITHUB_OAUTH_CLIENT_SECRET.trim();
  const callbackUrlRaw = env.GITHUB_OAUTH_CALLBACK_URL.trim();
  const callbackUrlParsed = normalizeHttpUrl(callbackUrlRaw);
  const callbackPathValid = callbackUrlParsed?.pathname === "/api/auth/github/callback";
  const sessionSecret = env.MOSAIC_STACK_SESSION_SECRET.trim();
  const requirements: string[] = [];

  if (clientId.length === 0) {
    requirements.push("GITHUB_OAUTH_CLIENT_ID");
  }

  if (clientSecret.length === 0) {
    requirements.push("GITHUB_OAUTH_CLIENT_SECRET");
  }

  if (callbackUrlRaw.length === 0 || !callbackPathValid) {
    requirements.push("GITHUB_OAUTH_CALLBACK_URL");
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

export function resolveGitHubOAuthConfig(env: AppEnv): GitHubOAuthConfig {
  const clientId = env.GITHUB_OAUTH_CLIENT_ID.trim();
  const clientSecret = env.GITHUB_OAUTH_CLIENT_SECRET.trim();
  const callbackUrlRaw = env.GITHUB_OAUTH_CALLBACK_URL.trim();
  const callbackUrlParsed = normalizeHttpUrl(callbackUrlRaw);
  const callbackPathValid = callbackUrlParsed?.pathname === "/api/auth/github/callback";
  const callbackUrl = callbackPathValid ? callbackUrlParsed.toString() : null;
  const requirements = getGitHubOAuthRequirements(env);
  const configured = clientId.length > 0 || clientSecret.length > 0 || callbackUrlRaw.length > 0;
  const enabled = requirements.length === 0;

  return {
    enabled,
    configured,
    clientId,
    clientSecret,
    callbackUrl,
    authorizeUrl: normalizeBaseUrl(env.GITHUB_OAUTH_AUTHORIZE_URL || "https://github.com/login/oauth/authorize"),
    tokenUrl: normalizeBaseUrl(env.GITHUB_OAUTH_TOKEN_URL || "https://github.com/login/oauth/access_token"),
    scopes: env.GITHUB_OAUTH_SCOPES.length > 0 ? env.GITHUB_OAUTH_SCOPES : ["read:user", "user:email"],
    requirements
  };
}
