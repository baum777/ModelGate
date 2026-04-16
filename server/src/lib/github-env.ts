import type { AppEnv } from "./env.js";

export type GitHubConfig = {
  enabled: boolean;
  ready: boolean;
  baseUrl: string;
  token: string | null;
  allowedRepos: string[];
  allowedRepoSet: Set<string>;
  defaultOwner: string | null;
  branchPrefix: string;
  requestTimeoutMs: number;
  planTtlMs: number;
  maxContextFiles: number;
  maxContextBytes: number;
  smokeRepo: string | null;
  smokeBaseBranch: string | null;
  smokeTargetBranch: string | null;
  smokeEnabled: boolean;
  issues: string[];
};

function parseBoolean(value: string) {
  if (/^(1|true|yes|on)$/i.test(value)) {
    return { value: true, valid: true };
  }

  if (/^(0|false|no|off)$/i.test(value)) {
    return { value: false, valid: true };
  }

  return { value: false, valid: false };
}

function parseCsvList(value: string) {
  return [...new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  )];
}

function normalizeBaseUrl(input: string) {
  const trimmed = input.trim().replace(/\/+$/, "");

  if (!trimmed) {
    return "https://api.github.com";
  }

  try {
    const url = new URL(trimmed);

    if (!url.protocol || !url.host) {
      return "https://api.github.com";
    }

    return url.toString().replace(/\/+$/, "");
  } catch {
    return "https://api.github.com";
  }
}

function normalizeRepoName(input: string) {
  const trimmed = input.trim();

  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split("/");

  if (parts.length !== 2) {
    return null;
  }

  const owner = parts[0]?.trim();
  const repo = parts[1]?.trim();

  if (!owner || !repo) {
    return null;
  }

  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    return null;
  }

  return `${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

function parsePositiveInt(input: string, fallback: number, min: number, max: number) {
  const value = Number.parseInt(input.trim(), 10);

  if (!Number.isFinite(value) || Number.isNaN(value) || value < min || value > max) {
    return fallback;
  }

  return value;
}

export function createGitHubConfig(env: AppEnv): GitHubConfig {
  const token = env.GITHUB_TOKEN.trim() || null;
  const baseUrl = normalizeBaseUrl(env.GITHUB_API_BASE_URL);
  const allowedRepos = [...new Set(
    env.GITHUB_ALLOWED_REPOS
      .map(normalizeRepoName)
      .filter((value): value is string => value !== null)
  )];
  const defaultOwner = env.GITHUB_DEFAULT_OWNER.trim() || null;
  const branchPrefix = env.GITHUB_BRANCH_PREFIX.trim().replace(/^\/+|\/+$/g, "") || "modelgate/github";
  const requestTimeoutMs = Number.isFinite(env.GITHUB_REQUEST_TIMEOUT_MS)
    ? env.GITHUB_REQUEST_TIMEOUT_MS
    : 8000;
  const planTtlMs = Number.isFinite(env.GITHUB_PLAN_TTL_MS)
    ? env.GITHUB_PLAN_TTL_MS
    : 12 * 60 * 1000;
  const maxContextFiles = Number.isFinite(env.GITHUB_MAX_CONTEXT_FILES)
    ? env.GITHUB_MAX_CONTEXT_FILES
    : 6;
  const maxContextBytes = Number.isFinite(env.GITHUB_MAX_CONTEXT_BYTES)
    ? env.GITHUB_MAX_CONTEXT_BYTES
    : 32_768;
  const smokeRepo = env.GITHUB_SMOKE_REPO.trim() || null;
  const smokeBaseBranch = env.GITHUB_SMOKE_BASE_BRANCH.trim() || null;
  const smokeTargetBranch = env.GITHUB_SMOKE_TARGET_BRANCH.trim() || null;
  const smokeEnabled = Boolean(env.GITHUB_SMOKE_ENABLED);
  const issues: string[] = [];

  if (!token) {
    issues.push("GITHUB_TOKEN is required");
  }

  if (env.GITHUB_ALLOWED_REPOS.length === 0) {
    issues.push("GITHUB_ALLOWED_REPOS must contain at least one repository");
  }

  for (const rawRepo of env.GITHUB_ALLOWED_REPOS) {
    if (!normalizeRepoName(rawRepo)) {
      issues.push(`GITHUB_ALLOWED_REPOS entry is invalid: ${rawRepo}`);
    }
  }

  if (!Number.isFinite(env.GITHUB_REQUEST_TIMEOUT_MS) || env.GITHUB_REQUEST_TIMEOUT_MS < 1000 || env.GITHUB_REQUEST_TIMEOUT_MS > 30000) {
    issues.push("GITHUB_REQUEST_TIMEOUT_MS must be between 1000 and 30000");
  }

  if (!Number.isFinite(env.GITHUB_PLAN_TTL_MS) || env.GITHUB_PLAN_TTL_MS < 60_000 || env.GITHUB_PLAN_TTL_MS > 24 * 60 * 60 * 1000) {
    issues.push("GITHUB_PLAN_TTL_MS must be between 60000 and 86400000");
  }

  if (!Number.isFinite(env.GITHUB_MAX_CONTEXT_FILES) || env.GITHUB_MAX_CONTEXT_FILES < 1 || env.GITHUB_MAX_CONTEXT_FILES > 20) {
    issues.push("GITHUB_MAX_CONTEXT_FILES must be between 1 and 20");
  }

  if (!Number.isFinite(env.GITHUB_MAX_CONTEXT_BYTES) || env.GITHUB_MAX_CONTEXT_BYTES < 256 || env.GITHUB_MAX_CONTEXT_BYTES > 200_000) {
    issues.push("GITHUB_MAX_CONTEXT_BYTES must be between 256 and 200000");
  }

  const enabled = Boolean(token || env.GITHUB_ALLOWED_REPOS.length > 0 || issues.length > 0);
  const ready = Boolean(token && allowedRepos.length > 0 && issues.length === 0);

  return {
    enabled,
    ready,
    baseUrl,
    token,
    allowedRepos,
    allowedRepoSet: new Set(allowedRepos),
    defaultOwner,
    branchPrefix,
    requestTimeoutMs,
    planTtlMs,
    maxContextFiles,
    maxContextBytes,
    smokeRepo,
    smokeBaseBranch,
    smokeTargetBranch,
    smokeEnabled,
    issues
  };
}

export function createDisabledGitHubConfig(): GitHubConfig {
  return {
    enabled: false,
    ready: false,
    baseUrl: "https://api.github.com",
    token: null,
    allowedRepos: [],
    allowedRepoSet: new Set<string>(),
    defaultOwner: null,
    branchPrefix: "modelgate/github",
    requestTimeoutMs: 8000,
    planTtlMs: 12 * 60 * 1000,
    maxContextFiles: 6,
    maxContextBytes: 32_768,
    smokeRepo: null,
    smokeBaseBranch: null,
    smokeTargetBranch: null,
    smokeEnabled: false,
    issues: []
  };
}

export function isGitHubRepoAllowed(config: GitHubConfig, owner: string, repo: string) {
  return config.allowedRepoSet.has(`${owner.trim().toLowerCase()}/${repo.trim().toLowerCase()}`);
}

export function normalizeGitHubRepoFullName(owner: string, repo: string) {
  return normalizeRepoName(`${owner}/${repo}`);
}
