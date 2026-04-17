import path from "node:path";
import { TextDecoder } from "node:util";
import type { GitHubConfig } from "./github-env.js";
import { normalizeGitHubRepoFullName } from "./github-env.js";
import type {
  GitHubErrorCode,
  GitHubFileContent,
  GitHubFileTree,
  GitHubRepoSummary,
  GitHubTreeEntry
} from "./github-contract.js";

export class GitHubClientError extends Error {
  readonly code: GitHubErrorCode;

  readonly status: number;

  readonly operation: string;

  readonly path: string;

  readonly baseUrl: string;

  readonly retryAfterSeconds: number | null;

  constructor(options: {
    code: GitHubErrorCode;
    status: number;
    operation: string;
    path: string;
    baseUrl: string;
    message: string;
    retryAfterSeconds?: number | null;
  }) {
    super(options.message);
    this.name = "GitHubClientError";
    this.code = options.code;
    this.status = options.status;
    this.operation = options.operation;
    this.path = options.path;
    this.baseUrl = options.baseUrl;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type GitHubClient = {
  readRepositorySummary(owner: string, repo: string): Promise<GitHubRepoSummary>;
  readRepositoryCommit(owner: string, repo: string, ref: string): Promise<{
    sha: string;
    treeSha: string;
  }>;
  readRepositoryReference(owner: string, repo: string, ref: string): Promise<GitHubRepositoryReference>;
  readRepositoryTree(
    owner: string,
    repo: string,
    options?: {
      ref?: string;
      path?: string;
      depth?: number;
      maxEntries?: number;
    }
  ): Promise<GitHubFileTree>;
  readRepositoryFile(
    owner: string,
    repo: string,
    options: {
      ref?: string;
      path: string;
    }
  ): Promise<GitHubFileContent>;
  createRepositoryTree(
    owner: string,
    repo: string,
    options: {
      baseTreeSha: string;
      entries: Array<{
        path: string;
        mode: string;
        content: string;
      }>;
    }
  ): Promise<{
    sha: string;
  }>;
  createRepositoryCommit(
    owner: string,
    repo: string,
    options: {
      message: string;
      treeSha: string;
      parentShas: string[];
      author: {
        name: string;
        email: string;
        date: string;
      };
      committer: {
        name: string;
        email: string;
        date: string;
      };
    }
  ): Promise<{
    sha: string;
    treeSha: string;
  }>;
  createRepositoryReference(
    owner: string,
    repo: string,
    ref: string,
    sha: string
  ): Promise<GitHubRepositoryReference>;
  updateRepositoryReference(
    owner: string,
    repo: string,
    ref: string,
    sha: string
  ): Promise<GitHubRepositoryReference>;
  listPullRequests(
    owner: string,
    repo: string,
    options?: {
      state?: "open" | "closed" | "all";
      head?: string;
      base?: string;
      perPage?: number;
      page?: number;
    }
  ): Promise<GitHubPullRequestSummary[]>;
  createPullRequest(
    owner: string,
    repo: string,
    options: {
      title: string;
      head: string;
      base: string;
      body?: string;
      draft?: boolean;
      maintainerCanModify?: boolean;
    }
  ): Promise<GitHubPullRequestSummary>;
};

type GitHubClientOptions = {
  config: GitHubConfig;
  fetchImpl?: typeof fetch;
};

type GitHubRepositoryResponse = {
  full_name?: unknown;
  name?: unknown;
  default_branch?: unknown;
  description?: unknown;
  private?: unknown;
  archived?: unknown;
  disabled?: unknown;
  permissions?: unknown;
  owner?: unknown;
};

type GitHubCommitResponse = {
  sha?: unknown;
  commit?: unknown;
};

type GitHubTreeResponse = {
  sha?: unknown;
  tree?: unknown;
  truncated?: unknown;
};

type GitHubReferenceResponse = {
  ref?: unknown;
  node_id?: unknown;
  url?: unknown;
  object?: unknown;
};

type GitHubTreeCreateResponse = {
  sha?: unknown;
};

type GitHubCommitCreateResponse = {
  sha?: unknown;
  tree?: unknown;
};

type GitHubPullRequestResponse = {
  number?: unknown;
  html_url?: unknown;
  state?: unknown;
  head?: unknown;
  base?: unknown;
  mergeable?: unknown;
  draft?: unknown;
  title?: unknown;
  body?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  merge_commit_sha?: unknown;
  url?: unknown;
};

export type GitHubRepositoryReference = {
  ref: string;
  sha: string;
  url: string | null;
  objectType: string | null;
};

export type GitHubPullRequestSummary = {
  number: number;
  htmlUrl: string;
  state: "open" | "closed";
  headRef: string;
  headSha: string;
  baseRef: string;
  baseSha: string;
  mergeable: boolean | null;
  draft: boolean;
  title: string;
  body: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  mergeCommitSha: string | null;
  url: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function buildGitHubUrl(baseUrl: string, pathName: string) {
  const base = `${normalizeBaseUrl(baseUrl)}/`;
  return new URL(pathName.replace(/^\/+/, ""), base).toString();
}

function createGitHubClientError(options: {
  code: GitHubErrorCode;
  status: number;
  operation: string;
  path: string;
  baseUrl: string;
  message: string;
  retryAfterSeconds?: number | null;
}) {
  return new GitHubClientError(options);
}

function parseRetryAfterSeconds(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value.trim(), 10);

  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function isRateLimitedResponse(response: Response) {
  if (response.status === 429) {
    return true;
  }

  if (response.status !== 403) {
    return false;
  }

  const rateRemaining = response.headers.get("x-ratelimit-remaining");
  const retryAfter = response.headers.get("retry-after");

  return rateRemaining === "0" || retryAfter !== null;
}

function mapFailureCode(
  status: number,
  notFoundCode: GitHubErrorCode,
  forbiddenCode: GitHubErrorCode = "github_forbidden"
): GitHubErrorCode {
  if (status === 401) {
    return "github_unauthorized";
  }

  if (status === 403) {
    return forbiddenCode;
  }

  if (status === 404) {
    return notFoundCode;
  }

  if (status === 429) {
    return "github_rate_limited";
  }

  if (status === 408 || status === 504) {
    return "github_timeout";
  }

  if (status >= 500) {
    return "github_internal_error";
  }

  return "github_internal_error";
}

function normalizeStatusForCode(code: GitHubErrorCode) {
  switch (code) {
    case "github_not_configured":
      return 503;
    case "github_unauthorized":
      return 401;
    case "github_forbidden":
    case "github_repo_not_allowed":
      return 403;
    case "github_repo_not_found":
    case "github_file_not_found":
      return 404;
    case "github_branch_conflict":
    case "github_stale_plan":
    case "github_plan_already_executed":
      return 409;
    case "github_patch_invalid":
      return 422;
    case "github_pr_create_failed":
    case "github_verification_failed":
      return 502;
    case "github_rate_limited":
      return 429;
    case "github_timeout":
      return 504;
    case "github_malformed_response":
      return 502;
    case "github_internal_error":
      return 500;
    case "invalid_request":
      return 400;
    case "github_plan_not_found":
      return 404;
    case "github_plan_expired":
      return 410;
    default:
      return 500;
  }
}

async function requestJson<T>(
  config: GitHubConfig,
  operation: string,
  pathName: string,
  init: RequestInit | undefined,
  validate: (payload: unknown) => T,
  fetchImpl: typeof fetch,
  failureCodes: {
    notFoundCode?: GitHubErrorCode;
    forbiddenCode?: GitHubErrorCode;
    conflictCode?: GitHubErrorCode;
    unprocessableCode?: GitHubErrorCode;
  } = {}
): Promise<T> {
  if (!config.ready || !config.token) {
    throw createGitHubClientError({
      code: "github_not_configured",
      status: 503,
      operation,
      path: pathName,
      baseUrl: normalizeBaseUrl(config.baseUrl),
      message: "GitHub backend is not configured"
    });
  }

  const headers = new Headers(init?.headers ?? {});
  headers.set("Authorization", `Bearer ${config.token}`);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("X-GitHub-Api-Version", "2022-11-28");

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.requestTimeoutMs);

  let response: Response;

  try {
    response = await fetchImpl(buildGitHubUrl(config.baseUrl, pathName), {
      ...init,
      headers,
      signal: init?.signal ?? controller.signal
    });
  } catch (error) {
    if (timedOut || (error instanceof Error && error.name === "AbortError")) {
      throw createGitHubClientError({
        code: "github_timeout",
        status: 504,
        operation,
        path: pathName,
        baseUrl: normalizeBaseUrl(config.baseUrl),
        message: "GitHub backend request timed out"
      });
    }

    throw createGitHubClientError({
      code: "github_internal_error",
      status: 500,
      operation,
      path: pathName,
      baseUrl: normalizeBaseUrl(config.baseUrl),
      message: "GitHub backend is unavailable"
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get("retry-after"));
    const code = isRateLimitedResponse(response)
      ? "github_rate_limited"
      : response.status === 409 && failureCodes.conflictCode
        ? failureCodes.conflictCode
        : response.status === 422 && failureCodes.unprocessableCode
          ? failureCodes.unprocessableCode
          : mapFailureCode(
              response.status,
              failureCodes.notFoundCode ?? "github_repo_not_found",
              failureCodes.forbiddenCode ?? "github_forbidden"
            );

    throw createGitHubClientError({
      code,
      status: normalizeStatusForCode(code),
      operation,
      path: pathName,
      baseUrl: normalizeBaseUrl(config.baseUrl),
      message:
        code === "github_unauthorized"
          ? "GitHub credentials were rejected"
          : code === "github_forbidden"
            ? "GitHub backend denied access"
            : code === "github_repo_not_found"
              ? "GitHub repository was not found"
              : code === "github_file_not_found"
                ? "GitHub file was not found"
                : code === "github_rate_limited"
                  ? "GitHub rate limit was hit"
                  : code === "github_timeout"
                    ? "GitHub backend request timed out"
                    : "GitHub backend request failed",
      retryAfterSeconds
    });
  }

  try {
    const payload = await response.json() as unknown;
    return validate(payload);
  } catch {
    throw createGitHubClientError({
      code: "github_malformed_response",
      status: 502,
      operation,
      path: pathName,
      baseUrl: normalizeBaseUrl(config.baseUrl),
      message: "GitHub backend returned an invalid response"
    });
  }
}

function requireRecord(payload: unknown, operation: string, pathName: string, label: string) {
  if (!isRecord(payload)) {
    throw createGitHubClientError({
      code: "github_malformed_response",
      status: 502,
      operation,
      path: pathName,
      baseUrl: "unavailable",
      message: `GitHub ${label} must be a JSON object`
    });
  }

  return payload;
}

function requireStringField(
  payload: Record<string, unknown>,
  field: string,
  operation: string,
  pathName: string,
  label: string
) {
  const value = payload[field];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw createGitHubClientError({
      code: "github_malformed_response",
      status: 502,
      operation,
      path: pathName,
      baseUrl: "unavailable",
      message: `GitHub ${label} field ${field} must be a non-empty string`
    });
  }

  return value;
}

function requireOptionalStringField(
  payload: Record<string, unknown>,
  field: string,
  operation: string,
  pathName: string,
  label: string
) {
  const value = payload[field];

  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw createGitHubClientError({
      code: "github_malformed_response",
      status: 502,
      operation,
      path: pathName,
      baseUrl: "unavailable",
      message: `GitHub ${label} field ${field} must be a string`
    });
  }

  return value;
}

function requireBooleanField(
  payload: Record<string, unknown>,
  field: string,
  operation: string,
  pathName: string,
  label: string
) {
  const value = payload[field];

  if (typeof value !== "boolean") {
    throw createGitHubClientError({
      code: "github_malformed_response",
      status: 502,
      operation,
      path: pathName,
      baseUrl: "unavailable",
      message: `GitHub ${label} field ${field} must be a boolean`
    });
  }

  return value;
}

function requireNumberField(
  payload: Record<string, unknown>,
  field: string,
  operation: string,
  pathName: string,
  label: string
) {
  const value = payload[field];

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw createGitHubClientError({
      code: "github_malformed_response",
      status: 502,
      operation,
      path: pathName,
      baseUrl: "unavailable",
      message: `GitHub ${label} field ${field} must be a number`
    });
  }

  return value;
}

function optionalStringField(payload: Record<string, unknown>, field: string) {
  const value = payload[field];

  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return value;
}

function normalizeRepoInput(owner: string, repo: string) {
  const normalized = normalizeGitHubRepoFullName(owner, repo);

  if (!normalized) {
    throw createGitHubClientError({
      code: "github_malformed_response",
      status: 502,
      operation: "GitHub request",
      path: `/repos/${owner}/${repo}`,
      baseUrl: "unavailable",
      message: "GitHub repository coordinates were invalid"
    });
  }

  const [normalizedOwner, normalizedRepo] = normalized.split("/");

  return {
    owner: normalizedOwner ?? owner.trim().toLowerCase(),
    repo: normalizedRepo ?? repo.trim().toLowerCase(),
    fullName: normalized
  };
}

function normalizeRelativePath(input: string) {
  const trimmed = input.trim().replace(/\\/g, "/");

  if (!trimmed || trimmed.startsWith("/") || /^[A-Za-z]:/.test(trimmed)) {
    return null;
  }

  const normalized = path.posix.normalize(trimmed);

  if (!normalized || normalized === "." || normalized === "..") {
    return null;
  }

  if (normalized.startsWith("../") || normalized.includes("/../")) {
    return null;
  }

  return normalized.replace(/^\.\/+/, "");
}

function inferLanguage(filePath: string) {
  const extension = filePath.split(".").pop()?.toLowerCase() ?? "";

  switch (extension) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "json":
      return "json";
    case "md":
      return "markdown";
    case "yml":
    case "yaml":
      return "yaml";
    case "css":
      return "css";
    case "html":
      return "html";
    case "py":
      return "python";
    case "sh":
      return "shell";
    case "sql":
      return "sql";
    default:
      return null;
  }
}

function isLikelyTextBuffer(buffer: Uint8Array) {
  if (buffer.length === 0) {
    return true;
  }

  let controlCount = 0;

  for (const byte of buffer) {
    if (byte === 0) {
      return false;
    }

    if (byte < 7 || (byte > 13 && byte < 32)) {
      controlCount += 1;
    }
  }

  return controlCount / buffer.length < 0.2;
}

function decodeGitHubContent(encoded: string) {
  const compact = encoded.replace(/\s+/g, "");

  if (!compact) {
    return new Uint8Array();
  }

  return Buffer.from(compact, "base64");
}

function mapTreeEntryType(value: unknown, mode: unknown): GitHubTreeEntry["type"] {
  if (typeof mode === "string" && mode === "160000") {
    return "submodule";
  }

  if (typeof mode === "string" && mode === "120000") {
    return "symlink";
  }

  if (value === "tree") {
    return "directory";
  }

  if (value === "blob") {
    return "file";
  }

  return "file";
}

function normalizeRepoStatusFromError(error: GitHubClientError) {
  if (error.code === "github_rate_limited" || error.code === "github_timeout" || error.code === "github_malformed_response" || error.code === "github_internal_error") {
    return "unreachable" as const;
  }

  return "blocked" as const;
}

async function readRepositoryMetadata(
  config: GitHubConfig,
  owner: string,
  repo: string,
  fetchImpl: typeof fetch
) {
  const pathName = `/repos/${owner}/${repo}`;

  return requestJson(
    config,
    "GitHub repository metadata",
    pathName,
    undefined,
    (payload) => {
      const record = requireRecord(payload, "GitHub repository metadata", pathName, "repository metadata");
      const fullName = requireStringField(record, "full_name", "GitHub repository metadata", pathName, "repository metadata");
      const defaultBranch = requireStringField(record, "default_branch", "GitHub repository metadata", pathName, "repository metadata");
      const description = optionalStringField(record, "description");
      const privateField = requireBooleanField(record, "private", "GitHub repository metadata", pathName, "repository metadata");
      const archived = typeof record.archived === "boolean" ? record.archived : false;
      const disabled = typeof record.disabled === "boolean" ? record.disabled : false;

      const permissions = isRecord(record.permissions)
        ? {
            push: typeof record.permissions.push === "boolean"
              ? record.permissions.push
              : false
          }
        : {
            push: false
          };

      const ownerRecord = isRecord(record.owner) ? record.owner : null;
      const ownerLogin = ownerRecord ? optionalStringField(ownerRecord, "login") : null;
      const repoName = optionalStringField(record, "name");
      const fullNameFromParts = ownerLogin && repoName
        ? `${ownerLogin}/${repoName}`
        : fullName;

      return {
        fullName: fullNameFromParts,
        defaultBranch,
        description,
        isPrivate: privateField,
        archived,
        disabled,
        permissions
      };
    },
    fetchImpl,
    {
      notFoundCode: "github_repo_not_found"
    }
  );
}

async function readRepositoryCommit(
  config: GitHubConfig,
  owner: string,
  repo: string,
  ref: string,
  fetchImpl: typeof fetch
) {
  const pathName = `/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`;

  return requestJson(
    config,
    "GitHub repository commit",
    pathName,
    undefined,
    (payload) => {
      const record = requireRecord(payload, "GitHub repository commit", pathName, "commit response");
      const sha = requireStringField(record, "sha", "GitHub repository commit", pathName, "commit response");

      if (!isRecord(record.commit) || !isRecord(record.commit.tree)) {
        throw createGitHubClientError({
          code: "github_malformed_response",
          status: 502,
          operation: "GitHub repository commit",
          path: pathName,
          baseUrl: "unavailable",
          message: "GitHub commit response must include a tree"
        });
      }

      const treeSha = requireStringField(record.commit.tree, "sha", "GitHub repository commit", pathName, "commit response");

      return {
        sha,
        treeSha
      };
    },
    fetchImpl,
    {
      notFoundCode: "github_repo_not_found"
    }
  );
}

async function resolveRepositoryRef(
  config: GitHubConfig,
  owner: string,
  repo: string,
  ref: string | undefined,
  fetchImpl: typeof fetch
) {
  if (ref) {
    return ref;
  }

  const repository = await readRepositoryMetadata(config, owner, repo, fetchImpl);
  return repository.defaultBranch;
}

function buildRepoSummaryFromFallback(owner: string, repo: string, status: "blocked" | "unreachable", checkedAt: string): GitHubRepoSummary {
  const fullName = `${owner}/${repo}`;

  return {
    owner,
    repo,
    fullName,
    defaultBranch: "unknown",
    defaultBranchSha: null,
    description: null,
    isPrivate: false,
    status,
    permissions: {
      canWrite: false
    },
    checkedAt
  };
}

function buildRepoSummary(
  owner: string,
  repo: string,
  metadata: Awaited<ReturnType<typeof readRepositoryMetadata>>,
  commitSha: string | null,
  checkedAt: string
): GitHubRepoSummary {
  const [canonicalOwner, canonicalRepo] = metadata.fullName.split("/");

  return {
    owner: canonicalOwner ?? owner,
    repo: canonicalRepo ?? repo,
    fullName: metadata.fullName,
    defaultBranch: metadata.defaultBranch,
    defaultBranchSha: commitSha,
    description: metadata.description,
    isPrivate: metadata.isPrivate,
    status: metadata.archived || metadata.disabled ? "blocked" : "ready",
    permissions: {
      canWrite: metadata.permissions.push
    },
    checkedAt
  };
}

function mapTreeEntries(payload: unknown, operation: string, pathName: string) {
  if (!Array.isArray(payload)) {
    throw createGitHubClientError({
      code: "github_malformed_response",
      status: 502,
      operation,
      path: pathName,
      baseUrl: "unavailable",
      message: "GitHub tree response must be an array"
    });
  }

  return payload.map((entry) => {
    const record = requireRecord(entry, operation, pathName, "tree entry");
    const entryPath = requireStringField(record, "path", operation, pathName, "tree entry");
    const entrySha = typeof record.sha === "string" && record.sha.trim().length > 0 ? record.sha : null;
    const entrySize = typeof record.size === "number" && Number.isFinite(record.size) ? record.size : null;
    const entryMode = typeof record.mode === "string" && record.mode.trim().length > 0 ? record.mode : null;
    const entryType = mapTreeEntryType(record.type, entryMode);

    return {
      path: entryPath,
      type: entryType,
      sha: entrySha,
      size: entrySize,
      mode: entryMode
    } satisfies GitHubTreeEntry;
  });
}

function filterTreeEntries(entries: GitHubTreeEntry[], rootPath: string, depth: number) {
  if (!rootPath) {
    return entries.filter((entry) => {
      const relativeDepth = entry.path.split("/").length - 1;
      return relativeDepth <= depth;
    });
  }

  const prefix = `${rootPath}/`;

  return entries.filter((entry) => {
    if (entry.path === rootPath) {
      return true;
    }

    if (!entry.path.startsWith(prefix)) {
      return false;
    }

    const relativePath = entry.path.slice(prefix.length);
    const relativeDepth = relativePath.split("/").length - 1;
    return relativeDepth <= depth;
  });
}

function mapFileContentResponse(
  payload: unknown,
  operation: string,
  pathName: string,
  owner: string,
  repo: string,
  requestedPath: string,
  ref: string,
  checkedAt: string
): GitHubFileContent {
  if (Array.isArray(payload)) {
    throw createGitHubClientError({
      code: "github_file_not_found",
      status: 404,
      operation,
      path: pathName,
      baseUrl: "unavailable",
      message: "GitHub file was not found"
    });
  }

  const record = requireRecord(payload, operation, pathName, "file response");
  const type = requireStringField(record, "type", operation, pathName, "file response");
  const content = requireOptionalStringField(record, "content", operation, pathName, "file response");
  const encoding = requireOptionalStringField(record, "encoding", operation, pathName, "file response") ?? "base64";
  const sha = requireStringField(record, "sha", operation, pathName, "file response");
  const size = requireNumberField(record, "size", operation, pathName, "file response");

  if (type !== "file") {
    throw createGitHubClientError({
      code: "github_file_not_found",
      status: 404,
      operation,
      path: pathName,
      baseUrl: "unavailable",
      message: "GitHub file was not found"
    });
  }

  if (content === null) {
    throw createGitHubClientError({
      code: "github_malformed_response",
      status: 502,
      operation,
      path: pathName,
      baseUrl: "unavailable",
      message: "GitHub file response did not include content"
    });
  }

  const decoded = encoding === "base64"
    ? decodeGitHubContent(content)
    : new TextEncoder().encode(content);
  const binary = !isLikelyTextBuffer(decoded);
  const language = inferLanguage(requestedPath);
  const lineCount = binary
    ? null
    : new TextDecoder("utf-8", { fatal: false }).decode(decoded).split(/\r\n|\r|\n/).length;

  if (binary) {
    const maxBinaryBytes = 32_768;
    const truncated = decoded.byteLength > maxBinaryBytes;

    return {
      owner,
      repo,
      path: requestedPath,
      ref,
      sha,
      encoding: "base64",
      content: Buffer.from(decoded.slice(0, maxBinaryBytes)).toString("base64"),
      language,
      size,
      lineCount: null,
      truncated,
      binary: true,
      generatedAt: checkedAt
    };
  }

  const text = new TextDecoder("utf-8", { fatal: true }).decode(decoded);
  const maxTextChars = 64_000;
  const truncated = text.length > maxTextChars;

  return {
    owner,
    repo,
    path: requestedPath,
    ref,
    sha,
    encoding: "utf-8",
    content: truncated ? text.slice(0, maxTextChars) : text,
    language,
    size,
    lineCount,
    truncated,
    binary: false,
    generatedAt: checkedAt
  };
}

function mapRepositoryReferenceResponse(
  payload: unknown,
  operation: string,
  pathName: string,
  refLabel: string
): GitHubRepositoryReference {
  const record = requireRecord(payload, operation, pathName, "reference response");
  const ref = requireStringField(record, "ref", operation, pathName, "reference response");

  if (!isRecord(record.object)) {
    throw createGitHubClientError({
      code: "github_malformed_response",
      status: 502,
      operation,
      path: pathName,
      baseUrl: "unavailable",
      message: `GitHub ${refLabel} response must include an object`
    });
  }

  const sha = requireStringField(record.object, "sha", operation, pathName, "reference response");
  const objectType = optionalStringField(record.object, "type");
  const url = optionalStringField(record, "url");

  return {
    ref,
    sha,
    url,
    objectType
  };
}

function mapPullRequestResponse(
  payload: unknown,
  operation: string,
  pathName: string
): GitHubPullRequestSummary {
  const record = requireRecord(payload, operation, pathName, "pull request response");
  const number = requireNumberField(record, "number", operation, pathName, "pull request response");
  const htmlUrl = requireStringField(record, "html_url", operation, pathName, "pull request response");
  const state = requireStringField(record, "state", operation, pathName, "pull request response");
  const title = requireStringField(record, "title", operation, pathName, "pull request response");
  const body = optionalStringField(record, "body");
  const mergeCommitSha = optionalStringField(record, "merge_commit_sha");
  const url = optionalStringField(record, "url");
  const createdAt = optionalStringField(record, "created_at");
  const updatedAt = optionalStringField(record, "updated_at");
  const draft = typeof record.draft === "boolean" ? record.draft : false;
  let mergeable: boolean | null = null;

  if (record.mergeable === null) {
    mergeable = null;
  } else if (typeof record.mergeable === "boolean") {
    mergeable = record.mergeable;
  }

  if (!isRecord(record.head) || !isRecord(record.base)) {
    throw createGitHubClientError({
      code: "github_malformed_response",
      status: 502,
      operation,
      path: pathName,
      baseUrl: "unavailable",
      message: "GitHub pull request response must include head and base"
    });
  }

  const headRef = requireStringField(record.head, "ref", operation, pathName, "pull request response");
  const headSha = requireStringField(record.head, "sha", operation, pathName, "pull request response");
  const baseRef = requireStringField(record.base, "ref", operation, pathName, "pull request response");
  const baseSha = requireStringField(record.base, "sha", operation, pathName, "pull request response");

  if (state !== "open" && state !== "closed") {
    throw createGitHubClientError({
      code: "github_malformed_response",
      status: 502,
      operation,
      path: pathName,
      baseUrl: "unavailable",
      message: "GitHub pull request state was invalid"
    });
  }

  return {
    number,
    htmlUrl,
    state,
    headRef,
    headSha,
    baseRef,
    baseSha,
    mergeable,
    draft,
    title,
    body,
    createdAt,
    updatedAt,
    mergeCommitSha,
    url
  };
}

export function createGitHubClient(options: GitHubClientOptions): GitHubClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const config = options.config;

  return {
    async readRepositorySummary(owner, repo) {
      const normalized = normalizeRepoInput(owner, repo);
      const checkedAt = new Date().toISOString();

      try {
        const metadata = await readRepositoryMetadata(config, normalized.owner, normalized.repo, fetchImpl);

        try {
          const commit = await readRepositoryCommit(
            config,
            normalized.owner,
            normalized.repo,
            metadata.defaultBranch,
            fetchImpl
          );

          return buildRepoSummary(normalized.owner, normalized.repo, metadata, commit.sha, checkedAt);
        } catch (error) {
          if (error instanceof GitHubClientError) {
            return {
              ...buildRepoSummaryFromFallback(normalized.owner, normalized.repo, normalizeRepoStatusFromError(error), checkedAt),
              defaultBranch: metadata.defaultBranch,
              defaultBranchSha: null,
              description: metadata.description,
              isPrivate: metadata.isPrivate,
              permissions: {
                canWrite: metadata.permissions.push
              }
            };
          }

          throw error;
        }
      } catch (error) {
        if (error instanceof GitHubClientError) {
          return buildRepoSummaryFromFallback(
            normalized.owner,
            normalized.repo,
            normalizeRepoStatusFromError(error),
            checkedAt
          );
        }

        throw error;
      }
    },

    async readRepositoryCommit(owner, repo, ref) {
      const normalized = normalizeRepoInput(owner, repo);
      return readRepositoryCommit(config, normalized.owner, normalized.repo, ref, fetchImpl);
    },

    async readRepositoryTree(owner, repo, options = {}) {
      const normalized = normalizeRepoInput(owner, repo);
      const checkedAt = new Date().toISOString();
      const resolvedRef = options.ref
        ? options.ref
        : (await readRepositoryMetadata(config, normalized.owner, normalized.repo, fetchImpl)).defaultBranch;
      const commit = await readRepositoryCommit(config, normalized.owner, normalized.repo, resolvedRef, fetchImpl);
      const pathName = `/repos/${normalized.owner}/${normalized.repo}/git/trees/${encodeURIComponent(commit.treeSha)}`;
      const treeResponse = await requestJson(
        config,
        "GitHub repository tree",
        `${pathName}?recursive=1`,
        undefined,
        (payload) => {
          const record = requireRecord(payload, "GitHub repository tree", pathName, "tree response");
          const tree = mapTreeEntries(record.tree, "GitHub repository tree", pathName);
          const truncated = typeof record.truncated === "boolean" ? record.truncated : false;

          return {
            tree,
            truncated
          };
        },
        fetchImpl,
        {
          notFoundCode: "github_repo_not_found"
        }
      );
      const normalizedRootPath = options.path ? normalizeRelativePath(options.path) : "";

      if (options.path && !normalizedRootPath) {
        throw createGitHubClientError({
          code: "invalid_request",
          status: 400,
          operation: "GitHub repository tree",
          path: `/repos/${normalized.owner}/${normalized.repo}/tree`,
          baseUrl: normalizeBaseUrl(config.baseUrl),
          message: "GitHub tree path was invalid"
        });
      }

      const filteredEntries = filterTreeEntries(
        treeResponse.tree,
        normalizedRootPath ?? "",
        options.depth ?? 10
      ).sort((left, right) => left.path.localeCompare(right.path));

      if (normalizedRootPath && filteredEntries.length === 0) {
        throw createGitHubClientError({
          code: "github_file_not_found",
          status: 404,
          operation: "GitHub repository tree",
          path: `/repos/${normalized.owner}/${normalized.repo}/tree`,
          baseUrl: normalizeBaseUrl(config.baseUrl),
          message: "GitHub file was not found"
        });
      }

      return {
        owner: normalized.owner,
        repo: normalized.repo,
        ref: resolvedRef,
        sha: commit.treeSha,
        rootPath: normalizedRootPath ?? "",
        entries: filteredEntries.slice(0, options.maxEntries ?? 200),
        truncated: treeResponse.truncated || filteredEntries.length > (options.maxEntries ?? 200),
        generatedAt: checkedAt
      };
    },

    async readRepositoryFile(owner, repo, options) {
      const normalized = normalizeRepoInput(owner, repo);
      const checkedAt = new Date().toISOString();
      const ref = options.ref
        ? options.ref
        : (await readRepositoryMetadata(config, normalized.owner, normalized.repo, fetchImpl)).defaultBranch;
      const normalizedPath = normalizeRelativePath(options.path);

      if (!normalizedPath) {
        throw createGitHubClientError({
          code: "invalid_request",
          status: 400,
          operation: "GitHub repository file",
          path: `/repos/${normalized.owner}/${normalized.repo}/file`,
          baseUrl: normalizeBaseUrl(config.baseUrl),
          message: "GitHub file path was invalid"
        });
      }

      const pathName = `/repos/${normalized.owner}/${normalized.repo}/contents/${normalizedPath}?ref=${encodeURIComponent(ref)}`;
      const payload = await requestJson(
        config,
        "GitHub repository file",
        pathName,
        undefined,
        (value) => value,
        fetchImpl,
        {
          notFoundCode: "github_file_not_found"
        }
      );

      return mapFileContentResponse(
        payload,
        "GitHub repository file",
        pathName,
        normalized.owner,
        normalized.repo,
        normalizedPath,
        ref,
        checkedAt
      );
    },

    async readRepositoryReference(owner, repo, ref) {
      const normalized = normalizeRepoInput(owner, repo);
      const pathName = `/repos/${normalized.owner}/${normalized.repo}/git/ref/${encodeURIComponent(ref)}`;

      return requestJson(
        config,
        "GitHub repository reference",
        pathName,
        undefined,
        (payload) => mapRepositoryReferenceResponse(payload, "GitHub repository reference", pathName, "reference"),
        fetchImpl,
        {
          notFoundCode: "github_repo_not_found"
        }
      );
    },

    async createRepositoryTree(owner, repo, options) {
      const normalized = normalizeRepoInput(owner, repo);
      const pathName = `/repos/${normalized.owner}/${normalized.repo}/git/trees`;

      return requestJson(
        config,
        "GitHub repository tree creation",
        pathName,
        {
          method: "POST",
          body: JSON.stringify({
            base_tree: options.baseTreeSha,
            tree: options.entries.map((entry) => ({
              path: entry.path,
              mode: entry.mode,
              type: "blob",
              content: entry.content
            }))
          })
        },
        (payload) => {
          const record = requireRecord(payload, "GitHub repository tree creation", pathName, "tree creation response");
          const sha = requireStringField(record, "sha", "GitHub repository tree creation", pathName, "tree creation response");

          return {
            sha
          };
        },
        fetchImpl,
        {
          conflictCode: "github_branch_conflict",
          unprocessableCode: "github_patch_invalid"
        }
      );
    },

    async createRepositoryCommit(owner, repo, options) {
      const normalized = normalizeRepoInput(owner, repo);
      const pathName = `/repos/${normalized.owner}/${normalized.repo}/git/commits`;

      return requestJson(
        config,
        "GitHub repository commit creation",
        pathName,
        {
          method: "POST",
          body: JSON.stringify({
            message: options.message,
            tree: options.treeSha,
            parents: options.parentShas,
            author: options.author,
            committer: options.committer
          })
        },
        (payload) => {
          const record = requireRecord(payload, "GitHub repository commit creation", pathName, "commit creation response");
          const sha = requireStringField(record, "sha", "GitHub repository commit creation", pathName, "commit creation response");

          if (!isRecord(record.tree)) {
            throw createGitHubClientError({
              code: "github_malformed_response",
              status: 502,
              operation: "GitHub repository commit creation",
              path: pathName,
              baseUrl: "unavailable",
              message: "GitHub commit creation response must include a tree"
            });
          }

          const treeSha = requireStringField(record.tree, "sha", "GitHub repository commit creation", pathName, "commit creation response");

          return {
            sha,
            treeSha
          };
        },
        fetchImpl,
        {
          conflictCode: "github_branch_conflict",
          unprocessableCode: "github_patch_invalid"
        }
      );
    },

    async createRepositoryReference(owner, repo, ref, sha) {
      const normalized = normalizeRepoInput(owner, repo);
      const refName = ref.trim().replace(/^\/+/, "");
      const pathName = `/repos/${normalized.owner}/${normalized.repo}/git/refs`;

      return requestJson(
        config,
        "GitHub repository reference creation",
        pathName,
        {
          method: "POST",
          body: JSON.stringify({
            ref: refName.startsWith("refs/") ? refName : `refs/${refName}`,
            sha
          })
        },
        (payload) => mapRepositoryReferenceResponse(payload, "GitHub repository reference creation", pathName, "reference creation"),
        fetchImpl,
        {
          conflictCode: "github_branch_conflict",
          unprocessableCode: "github_branch_conflict"
        }
      );
    },

    async updateRepositoryReference(owner, repo, ref, sha) {
      const normalized = normalizeRepoInput(owner, repo);
      const refName = ref.trim().replace(/^\/+/, "");
      const pathName = `/repos/${normalized.owner}/${normalized.repo}/git/refs/${encodeURIComponent(refName)}`;

      return requestJson(
        config,
        "GitHub repository reference update",
        pathName,
        {
          method: "PATCH",
          body: JSON.stringify({
            sha,
            force: false
          })
        },
        (payload) => mapRepositoryReferenceResponse(payload, "GitHub repository reference update", pathName, "reference update"),
        fetchImpl,
        {
          conflictCode: "github_branch_conflict",
          unprocessableCode: "github_branch_conflict"
        }
      );
    },

    async listPullRequests(owner, repo, options = {}) {
      const normalized = normalizeRepoInput(owner, repo);
      const params = new URLSearchParams();
      params.set("state", options.state ?? "open");

      if (options.head) {
        params.set("head", options.head);
      }

      if (options.base) {
        params.set("base", options.base);
      }

      if (options.perPage) {
        params.set("per_page", String(options.perPage));
      }

      if (options.page) {
        params.set("page", String(options.page));
      }

      const pathName = `/repos/${normalized.owner}/${normalized.repo}/pulls${params.toString().length > 0 ? `?${params.toString()}` : ""}`;

      return requestJson(
        config,
        "GitHub pull request list",
        pathName,
        undefined,
        (payload) => {
          if (!Array.isArray(payload)) {
            throw createGitHubClientError({
              code: "github_malformed_response",
              status: 502,
              operation: "GitHub pull request list",
              path: pathName,
              baseUrl: "unavailable",
              message: "GitHub pull request list must be an array"
            });
          }

          return payload.map((entry) => mapPullRequestResponse(entry, "GitHub pull request list", pathName));
        },
        fetchImpl,
        {
          notFoundCode: "github_repo_not_found"
        }
      );
    },

    async createPullRequest(owner, repo, options) {
      const normalized = normalizeRepoInput(owner, repo);
      const pathName = `/repos/${normalized.owner}/${normalized.repo}/pulls`;

      return requestJson(
        config,
        "GitHub pull request creation",
        pathName,
        {
          method: "POST",
          body: JSON.stringify({
            title: options.title,
            head: options.head,
            base: options.base,
            body: options.body,
            draft: options.draft ?? false,
            maintainer_can_modify: options.maintainerCanModify ?? true
          })
        },
        (payload) => mapPullRequestResponse(payload, "GitHub pull request creation", pathName),
        fetchImpl,
        {
          conflictCode: "github_pr_create_failed",
          unprocessableCode: "github_pr_create_failed"
        }
      );
    }
  };
}
