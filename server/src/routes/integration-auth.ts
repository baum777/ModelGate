import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppEnv } from "../lib/env.js";
import {
  formatMissingServerConfigDetails,
  resolveGitHubAppConfig,
  resolveGitHubOAuthConfig
} from "../lib/integration-auth-config.js";
import { createGitHubAppAuthClient, GitHubAppAuthError } from "../lib/github-app-auth.js";
import type { GitHubConfig } from "../lib/github-env.js";
import type { IntegrationAuthStore, IntegrationProvider } from "../lib/integration-auth-store.js";
import type { MatrixConfig } from "../lib/matrix-env.js";

const INTEGRATION_SESSION_COOKIE = "mosaicstacked_integration_session";
const INTEGRATION_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const INTEGRATION_OAUTH_STATE_COOKIE = "mosaicstacked_oauth_state";
const INTEGRATION_OAUTH_STATE_COOKIE_VERSION = "v1";
const DEFAULT_RETURN_TO = "/console?mode=settings";

const AuthStartQuerySchema = z.object({
  returnTo: z.string().trim().optional()
});

const GitHubCallbackQuerySchema = z.object({
  state: z.string().trim().min(1),
  code: z.string().trim().optional(),
  installation_id: z.string().trim().optional(),
  setup_action: z.string().trim().optional(),
  error: z.string().trim().optional(),
  error_description: z.string().trim().optional()
});

const MatrixCallbackQuerySchema = z.object({
  state: z.string().trim().min(1),
  loginToken: z.string().trim().optional(),
  login_token: z.string().trim().optional(),
  error: z.string().trim().optional()
});

type IntegrationAuthRouteDependencies = {
  env: AppEnv;
  githubConfig: GitHubConfig;
  matrixConfig: MatrixConfig;
  authStore: IntegrationAuthStore;
  fetchImpl?: typeof fetch;
};

type CallbackIntent = {
  provider: IntegrationProvider;
  state: string;
  sessionId: string;
  returnTo: string;
  expiresAtMs: number;
};

type IntegrationAuthErrorCode =
  | "invalid_request"
  | "invalid_return_to"
  | "state_mismatch"
  | "not_connected"
  | "missing_server_config"
  | "upstream_unreachable"
  | "scope_denied"
  | "callback_failed"
  | "token_exchange_failed"
  | "homeserver_missing"
  | "sso_not_supported"
  | "login_token_invalid"
  | "expected_user_mismatch"
  | "auth_expired";

class IntegrationAuthRouteError extends Error {
  readonly code: IntegrationAuthErrorCode;

  readonly details: string | null;

  constructor(code: IntegrationAuthErrorCode, details?: string | null) {
    super(code);
    this.name = "IntegrationAuthRouteError";
    this.code = code;
    this.details = details ?? null;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const GITHUB_OAUTH_TOKEN_EXCHANGE_DETAIL_ALLOWLIST = new Set([
  "incorrect_client_credentials",
  "redirect_uri_mismatch",
  "bad_verification_code"
]);

function isProductionDeployment() {
  return process.env.NODE_ENV === "production";
}

function normalizeBaseUrl(input: string) {
  return input.trim().replace(/\/+$/, "");
}

function buildIntegrationSessionCookie(value: string, maxAgeSeconds: number) {
  const attributes = [
    `${INTEGRATION_SESSION_COOKIE}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    "SameSite=Lax"
  ];

  if (isProductionDeployment()) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

function buildClearIntegrationOAuthStateCookie() {
  const attributes = [
    `${INTEGRATION_OAUTH_STATE_COOKIE}=`,
    "HttpOnly",
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "SameSite=Lax"
  ];

  if (isProductionDeployment()) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

function appendSetCookie(reply: FastifyReply, cookie: string) {
  const existing = reply.getHeader("Set-Cookie");

  if (Array.isArray(existing)) {
    reply.header("Set-Cookie", [...existing, cookie]);
    return;
  }

  if (typeof existing === "string") {
    reply.header("Set-Cookie", [existing, cookie]);
    return;
  }

  if (existing !== undefined) {
    reply.header("Set-Cookie", [String(existing), cookie]);
    return;
  }

  reply.header("Set-Cookie", cookie);
}

function readIntegrationSessionCookie(request: FastifyRequest) {
  const cookieHeader = Array.isArray(request.headers.cookie)
    ? request.headers.cookie[0]
    : request.headers.cookie;

  if (!cookieHeader) {
    return null;
  }

  for (const segment of cookieHeader.split(";")) {
    const trimmed = segment.trim();

    if (!trimmed.startsWith(`${INTEGRATION_SESSION_COOKIE}=`)) {
      continue;
    }

    try {
      return decodeURIComponent(trimmed.slice(INTEGRATION_SESSION_COOKIE.length + 1));
    } catch {
      return null;
    }
  }

  return null;
}

function readCookieValue(request: FastifyRequest, cookieName: string) {
  const cookieHeader = Array.isArray(request.headers.cookie)
    ? request.headers.cookie[0]
    : request.headers.cookie;

  if (!cookieHeader) {
    return null;
  }

  for (const segment of cookieHeader.split(";")) {
    const trimmed = segment.trim();

    if (!trimmed.startsWith(`${cookieName}=`)) {
      continue;
    }

    try {
      return decodeURIComponent(trimmed.slice(cookieName.length + 1));
    } catch {
      return null;
    }
  }

  return null;
}

function signOAuthStatePayload(sessionSecret: string, payload: string) {
  return createHmac("sha256", sessionSecret).update(payload).digest("base64url");
}

function compareStringsSecurely(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function buildSignedOAuthStateCookieValue(env: AppEnv, intent: CallbackIntent) {
  const sessionSecret = env.MOSAIC_STACK_SESSION_SECRET.trim();

  if (sessionSecret.length === 0) {
    return null;
  }

  const payload = Buffer.from(JSON.stringify({
    provider: intent.provider,
    state: intent.state,
    sessionId: intent.sessionId,
    returnTo: intent.returnTo,
    expiresAtMs: intent.expiresAtMs
  }), "utf8").toString("base64url");
  const signature = signOAuthStatePayload(sessionSecret, payload);

  return `${INTEGRATION_OAUTH_STATE_COOKIE_VERSION}.${payload}.${signature}`;
}

function buildIntegrationOAuthStateCookie(env: AppEnv, intent: CallbackIntent) {
  const value = buildSignedOAuthStateCookieValue(env, intent);

  if (!value) {
    return null;
  }

  const maxAgeSeconds = Math.max(1, Math.ceil((intent.expiresAtMs - Date.now()) / 1000));
  const attributes = [
    `${INTEGRATION_OAUTH_STATE_COOKIE}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    "SameSite=Lax"
  ];

  if (isProductionDeployment()) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

function readSignedOAuthStateIntent(
  request: FastifyRequest,
  env: AppEnv,
  provider: IntegrationProvider,
  state: string
): CallbackIntent | null {
  const sessionSecret = env.MOSAIC_STACK_SESSION_SECRET.trim();

  if (sessionSecret.length === 0) {
    return null;
  }

  const rawCookie = readCookieValue(request, INTEGRATION_OAUTH_STATE_COOKIE);

  if (!rawCookie) {
    return null;
  }

  const [version, payload, signature] = rawCookie.split(".");

  if (version !== INTEGRATION_OAUTH_STATE_COOKIE_VERSION || !payload || !signature) {
    return null;
  }

  const expectedSignature = signOAuthStatePayload(sessionSecret, payload);

  if (!compareStringsSecurely(expectedSignature, signature)) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  const intent = z.object({
    provider: z.enum(["github", "matrix"]),
    state: z.string().trim().min(1),
    sessionId: z.string().trim().min(1),
    returnTo: z.string().trim().min(1),
    expiresAtMs: z.number().finite()
  }).safeParse(parsed);

  if (!intent.success) {
    return null;
  }

  if (intent.data.provider !== provider || intent.data.state !== state) {
    return null;
  }

  if (intent.data.expiresAtMs <= Date.now()) {
    return null;
  }

  const returnTo = normalizeAllowedReturnTo(intent.data.returnTo);

  if (!returnTo) {
    return null;
  }

  return {
    provider: intent.data.provider,
    state: intent.data.state,
    sessionId: intent.data.sessionId,
    returnTo,
    expiresAtMs: intent.data.expiresAtMs
  };
}

function resolveRequestOrigin(request: FastifyRequest) {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const forwardedHost = request.headers["x-forwarded-host"];
  const hostHeader = request.headers.host;

  const protoRaw = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const hostRaw = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
  const hostFallback = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const protocol = protoRaw?.split(",")[0]?.trim() || "http";
  const host = hostRaw?.split(",")[0]?.trim() || hostFallback || "localhost";

  return `${protocol}://${host}`;
}

function normalizeAllowedReturnTo(input: string | undefined) {
  if (!input || input.length === 0) {
    return DEFAULT_RETURN_TO;
  }

  let parsed: URL;

  try {
    parsed = new URL(input, "http://localhost");
  } catch {
    return null;
  }

  if (parsed.origin !== "http://localhost" || parsed.pathname !== "/console") {
    return null;
  }

  const allowedParams = new Set(["mode"]);

  for (const key of parsed.searchParams.keys()) {
    if (!allowedParams.has(key)) {
      return null;
    }
  }

  const mode = parsed.searchParams.get("mode");

  if (mode && mode !== "settings") {
    return null;
  }

  parsed.searchParams.set("mode", "settings");
  const query = parsed.searchParams.toString();

  return query.length > 0 ? `${parsed.pathname}?${query}` : parsed.pathname;
}

function sendIntegrationAuthError(
  reply: FastifyReply,
  code: IntegrationAuthErrorCode,
  status = 400,
  details?: string
) {
  reply.header("Cache-Control", "no-store");
  return reply.status(status).send({
    ok: false,
    error: {
      code,
      details: details ?? null
    }
  });
}

function readProviderIdentityFallback(provider: IntegrationProvider) {
  if (provider === "github") {
    return "GitHub user";
  }

  return "Matrix user";
}

async function requestJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  operation: string
) {
  let response: Response;

  try {
    response = await fetchImpl(url, init);
  } catch {
    throw new Error(`${operation}:upstream_unreachable`);
  }

  let rawText = "";

  try {
    rawText = await response.text();
  } catch {
    rawText = "";
  }

  let payload: unknown = null;

  if (rawText.trim().length > 0) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = null;
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    payload,
    rawText
  };
}

function mapGitHubAppAuthErrorToIntegrationCode(error: GitHubAppAuthError): IntegrationAuthErrorCode {
  if (error.code === "not_configured") {
    return "missing_server_config";
  }

  if (error.code === "invalid_installation_id") {
    return "invalid_request";
  }

  if (error.code === "github_unauthorized") {
    return "auth_expired";
  }

  if (error.code === "github_forbidden") {
    return "scope_denied";
  }

  if (error.code === "github_timeout") {
    return "upstream_unreachable";
  }

  if (error.code === "github_rate_limited") {
    return "upstream_unreachable";
  }

  if (error.code === "github_malformed_response") {
    return "callback_failed";
  }

  return "token_exchange_failed";
}

function parseGitHubOAuthTokenExchangeDetails(payload: unknown, rawText?: string) {
  const raw = (rawText ?? "").trim();

  if (raw.length > 0) {
    const params = new URLSearchParams(raw);
    const paramValues = [
      params.get("error") ?? "",
      params.get("error_description") ?? "",
      params.get("message") ?? ""
    ];

    for (const value of paramValues) {
      const normalized = value.trim().toLowerCase();

      if (!normalized) {
        continue;
      }

      if (GITHUB_OAUTH_TOKEN_EXCHANGE_DETAIL_ALLOWLIST.has(normalized)) {
        return normalized;
      }

      if (/incorrect[_-]client[_-]credentials/.test(normalized)) {
        return "incorrect_client_credentials";
      }

      if (/redirect[_-]uri[_-]mismatch/.test(normalized)) {
        return "redirect_uri_mismatch";
      }

      if (/bad[_-]verification[_-]code/.test(normalized)) {
        return "bad_verification_code";
      }
    }
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const rawValues = [
    typeof record.error === "string" ? record.error : "",
    typeof record.error_description === "string" ? record.error_description : "",
    typeof record.message === "string" ? record.message : "",
    typeof record.error_uri === "string" ? record.error_uri : ""
  ];

  for (const value of rawValues) {
    const normalized = value.trim().toLowerCase();

    if (!normalized) {
      continue;
    }

    if (GITHUB_OAUTH_TOKEN_EXCHANGE_DETAIL_ALLOWLIST.has(normalized)) {
      return normalized;
    }

    if (/incorrect[_-]client[_-]credentials/.test(normalized)) {
      return "incorrect_client_credentials";
    }

    if (/redirect[_-]uri[_-]mismatch/.test(normalized)) {
      return "redirect_uri_mismatch";
    }

    if (/bad[_-]verification[_-]code/.test(normalized)) {
      return "bad_verification_code";
    }
  }

  return null;
}

async function exchangeGitHubInstallation(
  deps: IntegrationAuthRouteDependencies,
  installationIdRaw: string
) {
  const appAuth = createGitHubAppAuthClient({
    config: deps.githubConfig,
    fetchImpl: deps.fetchImpl
  });

  try {
    const installation = await appAuth.readInstallation(installationIdRaw);
    const repositories = await appAuth.listInstallationRepositories(installation.installationId);

    if (repositories.length === 0) {
      throw new Error("scope_denied");
    }

    return {
      safeIdentityLabel: installation.accountLogin
        ? `${installation.accountLogin} (installation ${installation.installationId})`
        : `installation ${installation.installationId}`,
      credential: {
        kind: "github_app_installation",
        installationId: String(installation.installationId),
        accountLogin: installation.accountLogin,
        accountType: installation.accountType,
        repositoryCount: repositories.length,
        connectedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    if (error instanceof GitHubAppAuthError) {
      throw new Error(mapGitHubAppAuthErrorToIntegrationCode(error));
    }

    if (error instanceof Error && error.message === "scope_denied") {
      throw error;
    }

    throw new Error("callback_failed");
  }
}

async function exchangeGitHubOAuthCode(
  deps: IntegrationAuthRouteDependencies,
  code: string
) {
  const oauthConfig = resolveGitHubOAuthConfig(deps.env);

  if (!oauthConfig.enabled) {
    throw new Error("missing_server_config");
  }

  const tokenBody = new URLSearchParams({
    client_id: oauthConfig.clientId,
    client_secret: oauthConfig.clientSecret,
    code,
    redirect_uri: oauthConfig.callbackUrl
  });
  const tokenResponse = await requestJson(
    deps.fetchImpl ?? fetch,
    oauthConfig.tokenUrl,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: tokenBody.toString()
    },
    "github_oauth_token_exchange"
  );

  const tokenPayload = tokenResponse.payload && typeof tokenResponse.payload === "object"
    ? tokenResponse.payload as Record<string, unknown>
    : null;
  const accessToken = typeof tokenPayload?.access_token === "string" ? tokenPayload.access_token.trim() : "";

  if (!tokenResponse.ok || !tokenPayload || accessToken.length === 0) {
    throw new IntegrationAuthRouteError(
      "token_exchange_failed",
      parseGitHubOAuthTokenExchangeDetails(tokenPayload, tokenResponse.rawText)
    );
  }

  const userResponse = await requestJson(
    deps.fetchImpl ?? fetch,
    "https://api.github.com/user",
    {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "mosaicstacked"
      }
    },
    "github_oauth_user_lookup"
  );
  const userPayload = userResponse.payload && typeof userResponse.payload === "object"
    ? userResponse.payload as Record<string, unknown>
    : null;
  const login = typeof userPayload?.login === "string" ? userPayload.login.trim() : "";

  if (!userResponse.ok || !userPayload || login.length === 0) {
    throw new Error(userResponse.status === 401 || userResponse.status === 403 ? "auth_expired" : "token_exchange_failed");
  }

  const scope = typeof tokenPayload.scope === "string"
    ? tokenPayload.scope.split(",").map((entry) => entry.trim()).filter(Boolean)
    : [];

  return {
    safeIdentityLabel: login,
    credential: {
      kind: "github_oauth_user",
      accessToken,
      login,
      scopes: scope,
      connectedAt: new Date().toISOString()
    }
  };
}

function parseGitHubInstallationId(raw: string | number | null | undefined) {
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) {
    return raw;
  }

  if (typeof raw !== "string") {
    return null;
  }

  const parsed = Number.parseInt(raw.trim(), 10);

  return Number.isFinite(parsed) && !Number.isNaN(parsed) && parsed > 0 ? parsed : null;
}

async function exchangeGitHubOAuthCodeForAccessToken(
  deps: IntegrationAuthRouteDependencies,
  code: string
) {
  const oauthConfig = resolveGitHubOAuthConfig(deps.env);

  if (!oauthConfig.enabled) {
    throw new Error("missing_server_config");
  }

  const tokenBody = new URLSearchParams({
    client_id: oauthConfig.clientId,
    client_secret: oauthConfig.clientSecret,
    code,
    redirect_uri: oauthConfig.callbackUrl
  });
  const tokenResponse = await requestJson(
    deps.fetchImpl ?? fetch,
    oauthConfig.tokenUrl,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: tokenBody.toString()
    },
    "github_app_user_token_exchange"
  );
  const tokenPayload = tokenResponse.payload && typeof tokenResponse.payload === "object"
    ? tokenResponse.payload as Record<string, unknown>
    : null;
  const accessToken = typeof tokenPayload?.access_token === "string" ? tokenPayload.access_token.trim() : "";

  if (!tokenResponse.ok || !tokenPayload || accessToken.length === 0) {
    throw new IntegrationAuthRouteError(
      "token_exchange_failed",
      parseGitHubOAuthTokenExchangeDetails(tokenPayload, tokenResponse.rawText)
    );
  }

  return accessToken;
}

function parseGitHubUserInstallation(entry: unknown) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }

  const record = entry as Record<string, unknown>;
  const installationId = parseGitHubInstallationId(record.id as string | number | null | undefined);
  const account = record.account && typeof record.account === "object" && !Array.isArray(record.account)
    ? record.account as Record<string, unknown>
    : null;

  if (!installationId) {
    return null;
  }

  return {
    installationId,
    accountLogin: typeof account?.login === "string" ? account.login : null,
    accountType: typeof account?.type === "string" ? account.type : null,
    accountId: typeof account?.id === "number" && Number.isFinite(account.id) ? account.id : null
  };
}

async function listGitHubAppUserInstallations(
  deps: IntegrationAuthRouteDependencies,
  accessToken: string
) {
  const installations: Array<{
    installationId: number;
    accountLogin: string | null;
    accountType: string | null;
    accountId: number | null;
  }> = [];
  let page = 1;

  while (page <= 10) {
    const response = await requestJson(
      deps.fetchImpl ?? fetch,
      `${normalizeBaseUrl(deps.githubConfig.baseUrl)}/user/installations?per_page=100&page=${page}`,
      {
        method: "GET",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${accessToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "mosaicstacked"
        }
      },
      "github_app_user_installations"
    );

    if (!response.ok || !response.payload || typeof response.payload !== "object") {
      throw new Error(response.status === 401 || response.status === 403 ? "auth_expired" : "upstream_unreachable");
    }

    const rawInstallations = (response.payload as { installations?: unknown }).installations;

    if (!Array.isArray(rawInstallations)) {
      throw new Error("callback_failed");
    }

    for (const entry of rawInstallations) {
      const parsed = parseGitHubUserInstallation(entry);

      if (parsed) {
        installations.push(parsed);
      }
    }

    if (rawInstallations.length < 100) {
      return installations;
    }

    page += 1;
  }

  return installations;
}

async function exchangeGitHubAppUserInstallationCode(
  deps: IntegrationAuthRouteDependencies,
  code: string,
  installationIdRaw: string | undefined
) {
  const accessToken = await exchangeGitHubOAuthCodeForAccessToken(deps, code);
  const userInstallations = await listGitHubAppUserInstallations(deps, accessToken);
  const requestedInstallationId = parseGitHubInstallationId(installationIdRaw);
  const selectedInstallation = requestedInstallationId
    ? userInstallations.find((installation) => installation.installationId === requestedInstallationId) ?? null
    : userInstallations.length === 1
      ? userInstallations[0] ?? null
      : null;

  if (!selectedInstallation) {
    throw new Error("scope_denied");
  }

  const appAuth = createGitHubAppAuthClient({
    config: deps.githubConfig,
    fetchImpl: deps.fetchImpl
  });

  try {
    const installation = await appAuth.readInstallation(selectedInstallation.installationId);
    const repositories = await appAuth.listInstallationRepositories(installation.installationId);

    if (repositories.length === 0) {
      throw new Error("scope_denied");
    }

    const accountLogin = installation.accountLogin ?? selectedInstallation.accountLogin;
    const accountType = installation.accountType ?? selectedInstallation.accountType;
    const accountId = installation.accountId ?? selectedInstallation.accountId;

    return {
      safeIdentityLabel: accountLogin
        ? `${accountLogin} (installation ${installation.installationId})`
        : `installation ${installation.installationId}`,
      credential: {
        kind: "github_app_installation",
        installationId: String(installation.installationId),
        accountLogin,
        accountType,
        accountId,
        repositoryCount: repositories.length,
        authorizedAt: new Date().toISOString(),
        connectedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    if (error instanceof GitHubAppAuthError) {
      throw new Error(mapGitHubAppAuthErrorToIntegrationCode(error));
    }

    if (error instanceof Error && error.message === "scope_denied") {
      throw error;
    }

    throw new Error("callback_failed");
  }
}

async function fetchMatrixLoginFlows(
  deps: IntegrationAuthRouteDependencies
) {
  if (!deps.matrixConfig.baseUrl) {
    throw new Error("homeserver_missing");
  }

  const response = await requestJson(
    deps.fetchImpl ?? fetch,
    `${normalizeBaseUrl(deps.matrixConfig.baseUrl)}/_matrix/client/v3/login`,
    {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    },
    "matrix_login_flows"
  );

  if (!response.ok || !response.payload || typeof response.payload !== "object") {
    throw new Error("upstream_unreachable");
  }

  const payload = response.payload as Record<string, unknown>;
  const rawFlows = payload.flows;

  if (!Array.isArray(rawFlows)) {
    throw new Error("callback_failed");
  }

  const flowTypes = rawFlows
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null && !Array.isArray(entry))
    .map((entry) => (typeof entry.type === "string" ? entry.type : ""))
    .filter((value) => value.length > 0);

  return flowTypes;
}

async function exchangeMatrixLoginToken(
  deps: IntegrationAuthRouteDependencies,
  loginToken: string
) {
  if (!deps.matrixConfig.baseUrl) {
    throw new Error("homeserver_missing");
  }

  const loginResponse = await requestJson(
    deps.fetchImpl ?? fetch,
    `${normalizeBaseUrl(deps.matrixConfig.baseUrl)}/_matrix/client/v3/login`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        type: deps.env.MATRIX_LOGIN_TOKEN_TYPE,
        token: loginToken
      })
    },
    "matrix_login_token_exchange"
  );

  const loginPayload = loginResponse.payload && typeof loginResponse.payload === "object"
    ? loginResponse.payload as Record<string, unknown>
    : null;

  if (!loginResponse.ok || !loginPayload) {
    const upstreamError = typeof loginPayload?.error === "string" ? loginPayload.error.trim() : "";
    const upstreamErrorCode = typeof loginPayload?.errcode === "string" ? loginPayload.errcode.trim() : "";
    const expiredToken = /expired/i.test(upstreamError) || /EXPIRED/i.test(upstreamErrorCode);

    if (expiredToken) {
      throw new Error("auth_expired");
    }

    if (loginResponse.status === 401 || loginResponse.status === 403 || loginResponse.status === 400) {
      throw new Error("login_token_invalid");
    }

    throw new Error("token_exchange_failed");
  }

  const payload = loginPayload;
  const accessToken = typeof payload.access_token === "string" ? payload.access_token.trim() : "";
  const userId = typeof payload.user_id === "string" ? payload.user_id.trim() : "";
  const deviceId = typeof payload.device_id === "string" ? payload.device_id.trim() : null;

  if (accessToken.length === 0 || userId.length === 0) {
    throw new Error("token_exchange_failed");
  }

  if (deps.matrixConfig.expectedUserId && deps.matrixConfig.expectedUserId !== userId) {
    throw new Error("expected_user_mismatch");
  }

  return {
    safeIdentityLabel: userId,
    credential: {
      kind: "matrix_login_token",
      accessToken,
      userId,
      deviceId,
      homeserver: deps.matrixConfig.baseUrl,
      connectedAt: new Date().toISOString()
    }
  };
}

async function reverifyGitHubCredential(
  deps: IntegrationAuthRouteDependencies,
  credential: Record<string, unknown>
) {
  if (credential.kind === "github_oauth_user") {
    const accessToken = typeof credential.accessToken === "string" ? credential.accessToken.trim() : "";

    if (accessToken.length === 0) {
      throw new Error("auth_expired");
    }

    const response = await requestJson(
      deps.fetchImpl ?? fetch,
      "https://api.github.com/user",
      {
        method: "GET",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${accessToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "mosaicstacked"
        }
      },
      "github_oauth_user_reverify"
    );
    const payload = response.payload && typeof response.payload === "object"
      ? response.payload as Record<string, unknown>
      : null;
    const login = typeof payload?.login === "string" ? payload.login.trim() : "";

    if (!response.ok || !payload || login.length === 0) {
      throw new Error(response.status === 401 || response.status === 403 ? "auth_expired" : "upstream_unreachable");
    }

    return login;
  }

  const installationIdRaw = typeof credential.installationId === "string"
    ? credential.installationId.trim()
    : typeof credential.installationId === "number"
      ? String(credential.installationId)
      : "";

  if (installationIdRaw.length === 0) {
    throw new Error("auth_expired");
  }

  const appAuth = createGitHubAppAuthClient({
    config: deps.githubConfig,
    fetchImpl: deps.fetchImpl
  });

  try {
    const installation = await appAuth.readInstallation(installationIdRaw);
    const repositories = await appAuth.listInstallationRepositories(installation.installationId);

    if (repositories.length === 0) {
      throw new Error("scope_denied");
    }

    return installation.accountLogin
      ? `${installation.accountLogin} (installation ${installation.installationId})`
      : `installation ${installation.installationId}`;
  } catch (error) {
    if (error instanceof GitHubAppAuthError) {
      throw new Error(mapGitHubAppAuthErrorToIntegrationCode(error));
    }

    if (error instanceof Error && error.message === "scope_denied") {
      throw error;
    }

    throw new Error("callback_failed");
  }
}

async function reverifyMatrixCredential(
  deps: IntegrationAuthRouteDependencies,
  credential: Record<string, unknown>
) {
  const accessToken = typeof credential.accessToken === "string" ? credential.accessToken.trim() : "";
  const homeserver = typeof credential.homeserver === "string" && credential.homeserver.trim().length > 0
    ? credential.homeserver.trim()
    : deps.matrixConfig.baseUrl;

  if (!homeserver) {
    throw new Error("homeserver_missing");
  }

  if (accessToken.length === 0) {
    throw new Error("auth_expired");
  }

  const response = await requestJson(
    deps.fetchImpl ?? fetch,
    `${normalizeBaseUrl(homeserver)}/_matrix/client/v3/account/whoami`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    },
    "matrix_reverify"
  );

  if (!response.ok || !response.payload || typeof response.payload !== "object") {
    if (response.status === 401) {
      throw new Error("auth_expired");
    }

    throw new Error("upstream_unreachable");
  }

  const payload = response.payload as Record<string, unknown>;
  const userId = typeof payload.user_id === "string" ? payload.user_id.trim() : "";

  if (userId.length === 0) {
    throw new Error("callback_failed");
  }

  if (deps.matrixConfig.expectedUserId && deps.matrixConfig.expectedUserId !== userId) {
    throw new Error("expected_user_mismatch");
  }

  return userId;
}

function maybeSetSessionCookie(
  reply: FastifyReply,
  cookieSessionId: string | null,
  sessionId: string,
  created: boolean
) {
  if (created || cookieSessionId !== sessionId) {
    appendSetCookie(reply, buildIntegrationSessionCookie(sessionId, INTEGRATION_SESSION_MAX_AGE_SECONDS));
  }
}

function maybeSetOAuthStateCookie(reply: FastifyReply, env: AppEnv, intent: CallbackIntent) {
  const cookie = buildIntegrationOAuthStateCookie(env, intent);

  if (cookie) {
    appendSetCookie(reply, cookie);
  }
}

function statusForErrorCode(code: IntegrationAuthErrorCode) {
  if (code === "not_connected") {
    return 409;
  }

  if (code === "state_mismatch") {
    return 400;
  }

  if (code === "scope_denied" || code === "expected_user_mismatch") {
    return 403;
  }

  if (code === "auth_expired") {
    return 401;
  }

  if (code === "homeserver_missing" || code === "missing_server_config") {
    return 503;
  }

  if (code === "upstream_unreachable") {
    return 503;
  }

  if (code === "login_token_invalid") {
    return 401;
  }

  if (code === "token_exchange_failed" || code === "callback_failed" || code === "sso_not_supported") {
    return 502;
  }

  return 400;
}

function registerProviderStartRoute(
  app: FastifyInstance,
  deps: IntegrationAuthRouteDependencies,
  provider: IntegrationProvider
) {
  const path = provider === "github" ? "/api/auth/github/start" : "/api/auth/matrix/start";

  app.get(path, async (request, reply) => {
    const parsedQuery = AuthStartQuerySchema.safeParse(request.query);

    if (!parsedQuery.success) {
      return sendIntegrationAuthError(reply, "invalid_request");
    }

    const returnTo = normalizeAllowedReturnTo(parsedQuery.data.returnTo);

    if (!returnTo) {
      return sendIntegrationAuthError(reply, "invalid_return_to");
    }

    reply.header("Cache-Control", "no-store");

    if (provider === "github") {
      const appConfig = resolveGitHubAppConfig(deps.env);
      const oauthConfig = resolveGitHubOAuthConfig(deps.env);

      if (!appConfig.enabled && !oauthConfig.enabled) {
        const requirements = oauthConfig.configured ? oauthConfig.requirements : appConfig.requirements;
        const providerLabel = oauthConfig.configured ? "GitHub OAuth" : "GitHub App";
        return sendIntegrationAuthError(
          reply,
          "missing_server_config",
          statusForErrorCode("missing_server_config"),
          formatMissingServerConfigDetails(providerLabel, requirements) ?? undefined
        );
      }

      const cookieSessionId = readIntegrationSessionCookie(request);
      const session = deps.authStore.ensureSession(cookieSessionId);
      const intent = deps.authStore.createIntent({
        provider,
        sessionId: session.sessionId,
        returnTo
      });
      maybeSetSessionCookie(reply, cookieSessionId, session.sessionId, session.created);
      maybeSetOAuthStateCookie(reply, deps.env, {
        provider,
        state: intent.state,
        sessionId: session.sessionId,
        returnTo,
        expiresAtMs: new Date(intent.expiresAt).getTime()
      });

      if (!appConfig.enabled && oauthConfig.enabled) {
        const url = new URL(oauthConfig.authorizeUrl);
        url.searchParams.set("client_id", oauthConfig.clientId);
        url.searchParams.set("redirect_uri", oauthConfig.callbackUrl);
        url.searchParams.set("state", intent.state);
        url.searchParams.set("scope", oauthConfig.scopes.join(","));
        return reply.redirect(url.toString(), 302);
      }

      const url = new URL(appConfig.installUrl);
      url.searchParams.set("state", intent.state);
      return reply.redirect(url.toString(), 302);
    }

    if (provider === "matrix" && deps.matrixConfig.enabled && !deps.matrixConfig.ready) {
      return sendIntegrationAuthError(reply, "missing_server_config", statusForErrorCode("missing_server_config"));
    }

    if (!deps.matrixConfig.baseUrl) {
      return sendIntegrationAuthError(reply, "missing_server_config", statusForErrorCode("missing_server_config"));
    }

    const origin = resolveRequestOrigin(request);
    try {
      const flowTypes = await fetchMatrixLoginFlows(deps);

      if (!flowTypes.includes("m.login.sso")) {
        return sendIntegrationAuthError(reply, "sso_not_supported", statusForErrorCode("sso_not_supported"));
      }

      const cookieSessionId = readIntegrationSessionCookie(request);
      const session = deps.authStore.ensureSession(cookieSessionId);
      const intent = deps.authStore.createIntent({
        provider,
        sessionId: session.sessionId,
        returnTo
      });
      maybeSetSessionCookie(reply, cookieSessionId, session.sessionId, session.created);
      maybeSetOAuthStateCookie(reply, deps.env, {
        provider,
        state: intent.state,
        sessionId: session.sessionId,
        returnTo,
        expiresAtMs: new Date(intent.expiresAt).getTime()
      });

      const callbackUrl = new URL(`${origin}/api/auth/matrix/callback`);
      callbackUrl.searchParams.set("state", intent.state);
      const ssoUrl = new URL(`${normalizeBaseUrl(deps.matrixConfig.baseUrl)}${deps.env.MATRIX_SSO_REDIRECT_PATH}`);
      ssoUrl.searchParams.set("redirectUrl", callbackUrl.toString());
      return reply.redirect(ssoUrl.toString(), 302);
    } catch (error) {
      const code = error instanceof Error && error.message === "upstream_unreachable"
        ? "upstream_unreachable"
        : "callback_failed";
      return sendIntegrationAuthError(reply, code as IntegrationAuthErrorCode, statusForErrorCode(code as IntegrationAuthErrorCode));
    }
  });
}

function registerProviderCallbackRoute(
  app: FastifyInstance,
  deps: IntegrationAuthRouteDependencies,
  provider: IntegrationProvider
) {
  const path = provider === "github" ? "/api/auth/github/callback" : "/api/auth/matrix/callback";

  app.get(path, async (request, reply) => {
    const schema = provider === "github" ? GitHubCallbackQuerySchema : MatrixCallbackQuerySchema;
    const parsedQuery = schema.safeParse(request.query);

    if (!parsedQuery.success) {
      return sendIntegrationAuthError(reply, "invalid_request");
    }

    const intent = deps.authStore.consumeIntent(provider, parsedQuery.data.state)
      ?? readSignedOAuthStateIntent(request, deps.env, provider, parsedQuery.data.state);

    if (!intent) {
      const cookieSessionId = readIntegrationSessionCookie(request);

      if (cookieSessionId) {
        deps.authStore.setErrorCode(cookieSessionId, provider, "state_mismatch");
      }

      appendSetCookie(reply, buildClearIntegrationOAuthStateCookie());
      return sendIntegrationAuthError(reply, "state_mismatch", statusForErrorCode("state_mismatch"));
    }

    const cookieSessionId = readIntegrationSessionCookie(request);
    maybeSetSessionCookie(reply, cookieSessionId, intent.sessionId, false);
    appendSetCookie(reply, buildClearIntegrationOAuthStateCookie());
    try {
      if (provider === "github") {
        const query = parsedQuery.data as z.infer<typeof GitHubCallbackQuerySchema>;
        const appConfig = resolveGitHubAppConfig(deps.env);
        const oauthConfig = resolveGitHubOAuthConfig(deps.env);

        if (!appConfig.enabled && !oauthConfig.enabled) {
          deps.authStore.setErrorCode(intent.sessionId, provider, "missing_server_config");
          const requirements = oauthConfig.configured ? oauthConfig.requirements : appConfig.requirements;
          const providerLabel = oauthConfig.configured ? "GitHub OAuth" : "GitHub App";
          return sendIntegrationAuthError(
            reply,
            "missing_server_config",
            statusForErrorCode("missing_server_config"),
            formatMissingServerConfigDetails(providerLabel, requirements) ?? undefined
          );
        }

        if (query.error) {
          deps.authStore.setErrorCode(intent.sessionId, provider, "scope_denied");
          return sendIntegrationAuthError(reply, "scope_denied", statusForErrorCode("scope_denied"), query.error_description);
        }

        if ((!query.installation_id || query.installation_id.trim().length === 0) && (!query.code || query.code.trim().length === 0)) {
          deps.authStore.setErrorCode(intent.sessionId, provider, "invalid_request");
          return sendIntegrationAuthError(reply, "invalid_request", statusForErrorCode("invalid_request"));
        }

        const exchange = appConfig.enabled && query.code && query.code.trim().length > 0
          ? await exchangeGitHubAppUserInstallationCode(deps, query.code, query.installation_id)
          : query.installation_id && query.installation_id.trim().length > 0
            ? await exchangeGitHubInstallation(deps, query.installation_id)
            : await exchangeGitHubOAuthCode(deps, query.code ?? "");

        const stored = deps.authStore.storeCredential(intent.sessionId, provider, exchange.credential);

        if (!stored) {
          deps.authStore.setErrorCode(intent.sessionId, provider, "missing_server_config");
          return sendIntegrationAuthError(reply, "missing_server_config", statusForErrorCode("missing_server_config"));
        }

        deps.authStore.markConnected({
          provider,
          sessionId: intent.sessionId,
          safeIdentityLabel: exchange.safeIdentityLabel,
          source: "user_connected"
        });
        reply.header("Cache-Control", "no-store");
        return reply.redirect(intent.returnTo, 302);
      }

      if (provider === "matrix") {
        const query = parsedQuery.data as z.infer<typeof MatrixCallbackQuerySchema>;
        const loginToken = query.loginToken ?? query.login_token;

        if (!deps.matrixConfig.baseUrl) {
          deps.authStore.setErrorCode(intent.sessionId, provider, "missing_server_config");
          return sendIntegrationAuthError(reply, "missing_server_config", statusForErrorCode("missing_server_config"));
        }

        if (query.error) {
          deps.authStore.setErrorCode(intent.sessionId, provider, "callback_failed");
          return sendIntegrationAuthError(
            reply,
            "callback_failed",
            statusForErrorCode("callback_failed"),
            query.error
          );
        }

        if (!loginToken || loginToken.trim().length === 0 || loginToken === "stub_login_token") {
          deps.authStore.setErrorCode(intent.sessionId, provider, "login_token_invalid");
          return sendIntegrationAuthError(
            reply,
            "login_token_invalid",
            statusForErrorCode("login_token_invalid")
          );
        }

        const exchange = await exchangeMatrixLoginToken(deps, loginToken);
        const stored = deps.authStore.storeCredential(intent.sessionId, provider, exchange.credential);

        if (!stored) {
          deps.authStore.setErrorCode(intent.sessionId, provider, "missing_server_config");
          return sendIntegrationAuthError(reply, "missing_server_config", statusForErrorCode("missing_server_config"));
        }

        deps.authStore.markConnected({
          provider,
          sessionId: intent.sessionId,
          safeIdentityLabel: exchange.safeIdentityLabel,
          source: "user_connected"
        });
        reply.header("Cache-Control", "no-store");
        return reply.redirect(intent.returnTo, 302);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "callback_failed";
      const details = error instanceof IntegrationAuthRouteError ? error.details : null;
      const code = (
        [
          "scope_denied",
          "callback_failed",
          "token_exchange_failed",
          "upstream_unreachable",
          "login_token_invalid",
          "expected_user_mismatch",
          "homeserver_missing",
          "missing_server_config",
          "auth_expired"
        ].includes(message)
          ? message
          : "callback_failed"
      ) as IntegrationAuthErrorCode;
      deps.authStore.setErrorCode(intent.sessionId, provider, code);
      return sendIntegrationAuthError(reply, code, statusForErrorCode(code), details ?? undefined);
    }
  });
}

function registerProviderDisconnectRoute(
  app: FastifyInstance,
  deps: IntegrationAuthRouteDependencies,
  provider: IntegrationProvider
) {
  const paths = provider === "github"
    ? ["/api/auth/github/disconnect", "/api/auth/github/logout"]
    : ["/api/auth/matrix/disconnect"];

  const handler = async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = readIntegrationSessionCookie(request);
    reply.header("Cache-Control", "no-store");

    if (!sessionId) {
      return reply.status(200).send({
        ok: true,
        provider,
        disconnected: false
      });
    }

    deps.authStore.clearCredential(sessionId, provider);
    deps.authStore.disconnect(sessionId, provider);

    return reply.status(200).send({
      ok: true,
      provider,
      disconnected: true
    });
  };

  for (const path of paths) {
    app.post(path, handler);
  }
}

function registerProviderReverifyRoute(
  app: FastifyInstance,
  deps: IntegrationAuthRouteDependencies,
  provider: IntegrationProvider
) {
  const path = provider === "github" ? "/api/auth/github/reverify" : "/api/auth/matrix/reverify";

  app.post(path, async (request, reply) => {
    const sessionId = readIntegrationSessionCookie(request);

    if (!sessionId) {
      return sendIntegrationAuthError(reply, "not_connected", statusForErrorCode("not_connected"));
    }

    const connection = deps.authStore.readConnection(sessionId, provider);

    if (!connection || !connection.connected) {
      return sendIntegrationAuthError(reply, "not_connected", statusForErrorCode("not_connected"));
    }

    try {
      let safeIdentityLabel = connection.safeIdentityLabel ?? readProviderIdentityFallback(provider);

      if (connection.source === "user_connected") {
        const credential = deps.authStore.readCredential(sessionId, provider);

        if (!credential) {
          deps.authStore.setErrorCode(sessionId, provider, "auth_expired");
          return sendIntegrationAuthError(reply, "auth_expired", statusForErrorCode("auth_expired"));
        }

        if (provider === "github") {
          safeIdentityLabel = await reverifyGitHubCredential(deps, credential);
        } else {
          safeIdentityLabel = await reverifyMatrixCredential(deps, credential);
        }
      }

      const next = deps.authStore.markConnected({
        provider,
        sessionId,
        safeIdentityLabel,
        source: connection.source
      });

      reply.header("Cache-Control", "no-store");
      return reply.status(200).send({
        ok: true,
        provider,
        lastVerifiedAt: next.lastVerifiedAt
      });
    } catch (error) {
      const code = (
        error instanceof Error
          && ["auth_expired", "scope_denied", "upstream_unreachable", "expected_user_mismatch"].includes(error.message)
      )
        ? error.message as IntegrationAuthErrorCode
        : "callback_failed";
      deps.authStore.setErrorCode(sessionId, provider, code);
      return sendIntegrationAuthError(reply, code, statusForErrorCode(code));
    }
  });
}

function registerGitHubStatusRoute(
  app: FastifyInstance,
  deps: IntegrationAuthRouteDependencies
) {
  app.get("/api/auth/github/status", async (request, reply) => {
    const sessionId = readIntegrationSessionCookie(request);
    const connection = deps.authStore.readConnection(sessionId, "github");
    const appConfig = resolveGitHubAppConfig(deps.env);
    const oauthConfig = resolveGitHubOAuthConfig(deps.env);
    const githubAuthReady = appConfig.enabled || oauthConfig.enabled;
    const requirements = oauthConfig.configured ? oauthConfig.requirements : appConfig.requirements;
    const connected = connection?.connected === true;
    const status = connected
      ? "connected"
      : (appConfig.configured || oauthConfig.configured) && !githubAuthReady
        ? "missing_server_config"
        : "not_connected";

    reply.header("Cache-Control", "no-store");
    return reply.status(200).send({
      ok: true,
      provider: "github",
      status,
      connected,
      appReady: appConfig.enabled,
      oauthReady: githubAuthReady,
      requirements: connected || githubAuthReady ? [] : requirements,
      identity: connected ? (connection?.safeIdentityLabel ?? null) : null,
      credentialSource: connected ? connection?.source ?? "not_connected" : "not_connected",
      lastVerifiedAt: connected ? connection?.lastVerifiedAt ?? null : null,
      lastErrorCode: connection?.lastErrorCode ?? null
    });
  });
}

export function integrationAuthRoutes(app: FastifyInstance, deps: IntegrationAuthRouteDependencies) {
  registerProviderStartRoute(app, deps, "github");
  registerProviderStartRoute(app, deps, "matrix");
  registerProviderCallbackRoute(app, deps, "github");
  registerProviderCallbackRoute(app, deps, "matrix");
  registerProviderDisconnectRoute(app, deps, "github");
  registerProviderDisconnectRoute(app, deps, "matrix");
  registerProviderReverifyRoute(app, deps, "github");
  registerProviderReverifyRoute(app, deps, "matrix");
  registerGitHubStatusRoute(app, deps);
}
