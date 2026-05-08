import { createSign } from "node:crypto";
import type { GitHubConfig } from "./github-env.js";

export class GitHubAppAuthError extends Error {
  readonly code: "not_configured" | "invalid_installation_id" | "github_unauthorized" | "github_forbidden" | "github_internal_error" | "github_timeout" | "github_rate_limited" | "github_malformed_response";

  readonly status: number;

  constructor(options: {
    code: "not_configured" | "invalid_installation_id" | "github_unauthorized" | "github_forbidden" | "github_internal_error" | "github_timeout" | "github_rate_limited" | "github_malformed_response";
    status: number;
    message: string;
  }) {
    super(options.message);
    this.name = "GitHubAppAuthError";
    this.code = options.code;
    this.status = options.status;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type GitHubAppInstallationContext = {
  installationId: number;
  accountLogin: string | null;
  accountType: string | null;
  accountId: number | null;
};

function base64UrlEncode(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function normalizePrivateKey(raw: string) {
  const trimmed = raw.trim();

  if (!trimmed) {
    return "";
  }

  return trimmed.includes("\\n") ? trimmed.replace(/\\n/g, "\n") : trimmed;
}

function createAppJwt(config: GitHubConfig) {
  if (!config.appId || !config.appPrivateKey) {
    throw new GitHubAppAuthError({
      code: "not_configured",
      status: 503,
      message: "GitHub app auth is not configured"
    });
  }

  const privateKey = normalizePrivateKey(config.appPrivateKey);

  if (!privateKey) {
    throw new GitHubAppAuthError({
      code: "not_configured",
      status: 503,
      message: "GitHub app private key is missing"
    });
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(JSON.stringify({
    iat: nowSeconds - 60,
    exp: nowSeconds + 9 * 60,
    iss: config.appId
  }));
  const data = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(data);
  signer.end();
  const signature = signer.sign(privateKey).toString("base64url");

  return `${data}.${signature}`;
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

  const remaining = response.headers.get("x-ratelimit-remaining");
  const retryAfter = response.headers.get("retry-after");

  return remaining === "0" || retryAfter !== null;
}

function mapAppAuthError(status: number) {
  if (status === 401) {
    return {
      code: "github_unauthorized" as const,
      message: "GitHub app credentials were rejected",
      normalizedStatus: 401
    };
  }

  if (status === 403) {
    return {
      code: "github_forbidden" as const,
      message: "GitHub app backend denied access",
      normalizedStatus: 403
    };
  }

  if (status === 404) {
    return {
      code: "invalid_installation_id" as const,
      message: "GitHub app installation was not found",
      normalizedStatus: 404
    };
  }

  if (status === 429) {
    return {
      code: "github_rate_limited" as const,
      message: "GitHub app rate limit was hit",
      normalizedStatus: 429
    };
  }

  if (status === 408 || status === 504) {
    return {
      code: "github_timeout" as const,
      message: "GitHub app backend request timed out",
      normalizedStatus: 504
    };
  }

  return {
    code: "github_internal_error" as const,
    message: "GitHub app backend request failed",
    normalizedStatus: status >= 500 ? 500 : 502
  };
}

async function requestGitHubAppJson<T>(
  config: GitHubConfig,
  fetchImpl: typeof fetch,
  options: {
    method: "GET" | "POST";
    path: string;
    jwt: string;
    body?: unknown;
    validate: (payload: unknown) => T;
  }
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.requestTimeoutMs);

  const headers = new Headers({
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${options.jwt}`,
    "X-GitHub-Api-Version": "2022-11-28"
  });

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;

  try {
    response = await fetchImpl(`${config.baseUrl}${options.path}`, {
      method: options.method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal
    });
  } catch (error) {
    if (timedOut || (error instanceof Error && error.name === "AbortError")) {
      throw new GitHubAppAuthError({
        code: "github_timeout",
        status: 504,
        message: "GitHub app backend request timed out"
      });
    }

    throw new GitHubAppAuthError({
      code: "github_internal_error",
      status: 500,
      message: "GitHub app backend is unavailable"
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get("retry-after"));
    const mapped = isRateLimitedResponse(response)
      ? {
        code: "github_rate_limited" as const,
        message: "GitHub app rate limit was hit",
        normalizedStatus: 429
      }
      : mapAppAuthError(response.status);

    throw new GitHubAppAuthError({
      code: mapped.code,
      status: mapped.normalizedStatus,
      message: retryAfterSeconds !== null
        ? `${mapped.message} (retry after ${retryAfterSeconds}s)`
        : mapped.message
    });
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new GitHubAppAuthError({
      code: "github_malformed_response",
      status: 502,
      message: "GitHub app backend returned an invalid response"
    });
  }

  try {
    return options.validate(payload);
  } catch {
    throw new GitHubAppAuthError({
      code: "github_malformed_response",
      status: 502,
      message: "GitHub app backend returned an invalid response"
    });
  }
}

type InstallationTokenCacheEntry = {
  token: string;
  expiresAtMs: number;
};

export function createGitHubAppAuthClient(options: {
  config: GitHubConfig;
  fetchImpl?: typeof fetch;
  tokenCacheTtlMs?: number;
}) {
  const { config } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const defaultCacheTtlMs = options.tokenCacheTtlMs ?? 45_000;
  const tokenCache = new Map<number, InstallationTokenCacheEntry>();

  function assertAppReady() {
    if (!config.appAuthReady) {
      throw new GitHubAppAuthError({
        code: "not_configured",
        status: 503,
        message: "GitHub app auth is not configured"
      });
    }
  }

  function parseInstallationId(raw: number | string | null | undefined) {
    if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) {
      return raw;
    }

    if (typeof raw !== "string") {
      return null;
    }

    const parsed = Number.parseInt(raw.trim(), 10);

    if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 1) {
      return null;
    }

    return parsed;
  }

  async function getInstallationToken(installationIdRaw: number | string) {
    assertAppReady();
    const installationId = parseInstallationId(installationIdRaw);

    if (!installationId) {
      throw new GitHubAppAuthError({
        code: "invalid_installation_id",
        status: 400,
        message: "GitHub app installation id is invalid"
      });
    }

    const now = Date.now();
    const cached = tokenCache.get(installationId);

    if (cached && cached.expiresAtMs > now + 5_000) {
      return cached.token;
    }

    const jwt = createAppJwt(config);
    const tokenPayload = await requestGitHubAppJson(
      config,
      fetchImpl,
      {
        method: "POST",
        path: `/app/installations/${installationId}/access_tokens`,
        jwt,
        validate(payload) {
          if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
            throw new Error("invalid");
          }

          const token = typeof (payload as { token?: unknown }).token === "string"
            ? (payload as { token: string }).token.trim()
            : "";
          const expiresAtRaw = typeof (payload as { expires_at?: unknown }).expires_at === "string"
            ? (payload as { expires_at: string }).expires_at.trim()
            : "";

          if (!token || !expiresAtRaw) {
            throw new Error("invalid");
          }

          const expiresAtMs = Date.parse(expiresAtRaw);

          if (!Number.isFinite(expiresAtMs) || Number.isNaN(expiresAtMs)) {
            throw new Error("invalid");
          }

          return {
            token,
            expiresAtMs
          };
        }
      }
    );

    const ttl = Math.max(5_000, Math.min(defaultCacheTtlMs, tokenPayload.expiresAtMs - now - 5_000));
    tokenCache.set(installationId, {
      token: tokenPayload.token,
      expiresAtMs: now + ttl
    });

    return tokenPayload.token;
  }

  async function readInstallation(installationIdRaw: number | string): Promise<GitHubAppInstallationContext> {
    assertAppReady();
    const installationId = parseInstallationId(installationIdRaw);

    if (!installationId) {
      throw new GitHubAppAuthError({
        code: "invalid_installation_id",
        status: 400,
        message: "GitHub app installation id is invalid"
      });
    }

    const jwt = createAppJwt(config);

    return requestGitHubAppJson(config, fetchImpl, {
      method: "GET",
      path: `/app/installations/${installationId}`,
      jwt,
      validate(payload) {
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
          throw new Error("invalid");
        }

        const account = (payload as { account?: unknown }).account;
        const accountRecord = account && typeof account === "object" && !Array.isArray(account)
          ? account as Record<string, unknown>
          : null;

        const accountLogin = typeof accountRecord?.login === "string" ? accountRecord.login : null;
        const accountType = typeof accountRecord?.type === "string" ? accountRecord.type : null;
        const accountId = typeof accountRecord?.id === "number" && Number.isFinite(accountRecord.id)
          ? accountRecord.id
          : null;

        return {
          installationId,
          accountLogin,
          accountType,
          accountId
        };
      }
    });
  }

  async function installationHasAnyAllowedRepo(installationIdRaw: number | string, allowedRepos: string[]) {
    const installationToken = await getInstallationToken(installationIdRaw);
    const allowedRepoSet = new Set(allowedRepos.map((repo) => repo.toLowerCase()));

    if (allowedRepoSet.size === 0) {
      return false;
    }

    const headers = new Headers({
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${installationToken}`,
      "X-GitHub-Api-Version": "2022-11-28"
    });

    let page = 1;

    while (page <= 10) {
      const controller = new AbortController();
      let timedOut = false;
      const timeoutId = globalThis.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, config.requestTimeoutMs);

      let response: Response;

      try {
        response = await fetchImpl(`${config.baseUrl}/installation/repositories?per_page=100&page=${page}`, {
          method: "GET",
          headers,
          signal: controller.signal
        });
      } catch (error) {
        if (timedOut || (error instanceof Error && error.name === "AbortError")) {
          throw new GitHubAppAuthError({
            code: "github_timeout",
            status: 504,
            message: "GitHub app backend request timed out"
          });
        }

        throw new GitHubAppAuthError({
          code: "github_internal_error",
          status: 500,
          message: "GitHub app backend is unavailable"
        });
      } finally {
        globalThis.clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const mapped = isRateLimitedResponse(response)
          ? {
            code: "github_rate_limited" as const,
            message: "GitHub app rate limit was hit",
            normalizedStatus: 429
          }
          : mapAppAuthError(response.status);

        throw new GitHubAppAuthError({
          code: mapped.code,
          status: mapped.normalizedStatus,
          message: mapped.message
        });
      }

      let payload: unknown;

      try {
        payload = await response.json();
      } catch {
        throw new GitHubAppAuthError({
          code: "github_malformed_response",
          status: 502,
          message: "GitHub app backend returned an invalid response"
        });
      }

      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new GitHubAppAuthError({
          code: "github_malformed_response",
          status: 502,
          message: "GitHub app backend returned an invalid response"
        });
      }

      const repositories = (payload as { repositories?: unknown }).repositories;

      if (!Array.isArray(repositories)) {
        throw new GitHubAppAuthError({
          code: "github_malformed_response",
          status: 502,
          message: "GitHub app backend returned an invalid response"
        });
      }

      for (const repository of repositories) {
        if (!repository || typeof repository !== "object" || Array.isArray(repository)) {
          continue;
        }

        const fullName = typeof (repository as { full_name?: unknown }).full_name === "string"
          ? (repository as { full_name: string }).full_name.toLowerCase()
          : "";

        if (fullName && allowedRepoSet.has(fullName)) {
          return true;
        }
      }

      if (repositories.length < 100) {
        return false;
      }

      page += 1;
    }

    return false;
  }

  return {
    getInstallationToken,
    readInstallation,
    installationHasAnyAllowedRepo
  };
}
