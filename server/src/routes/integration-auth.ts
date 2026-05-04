import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppEnv } from "../lib/env.js";
import type { IntegrationAuthStore, IntegrationProvider } from "../lib/integration-auth-store.js";
import type { MatrixConfig } from "../lib/matrix-env.js";

const INTEGRATION_SESSION_COOKIE = "mosaicstack_integration_session";
const INTEGRATION_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_RETURN_TO = "/console?mode=settings";

const AuthStartQuerySchema = z.object({
  returnTo: z.string().trim().optional()
});

const GitHubCallbackQuerySchema = z.object({
  state: z.string().trim().min(1),
  code: z.string().trim().optional(),
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
  matrixConfig: MatrixConfig;
  authStore: IntegrationAuthStore;
  fetchImpl?: typeof fetch;
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

type GitHubOAuthConfig = {
  enabled: boolean;
  configured: boolean;
  clientId: string;
  clientSecret: string;
  callbackUrl: string | null;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
};

function parseScopeSet(scopeRaw: string | null): Set<string> {
  if (!scopeRaw) {
    return new Set();
  }

  const scopeEntries = scopeRaw
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return new Set(scopeEntries);
}

function isProductionDeployment() {
  return process.env.NODE_ENV === "production";
}

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

function readProviderStubIdentity(provider: IntegrationProvider) {
  if (provider === "github") {
    return "stub-github-operator";
  }

  return "@stub-user:matrix.local";
}

function createStubCallbackUrl(provider: IntegrationProvider, state: string) {
  if (provider === "github") {
    return `/api/auth/github/callback?state=${encodeURIComponent(state)}&code=stub_code`;
  }

  return `/api/auth/matrix/callback?state=${encodeURIComponent(state)}&loginToken=stub_login_token`;
}

function resolveGitHubOAuthConfig(env: AppEnv): GitHubOAuthConfig {
  const clientId = env.GITHUB_OAUTH_CLIENT_ID.trim();
  const clientSecret = env.GITHUB_OAUTH_CLIENT_SECRET.trim();
  const callbackUrlRaw = env.GITHUB_OAUTH_CALLBACK_URL.trim();
  const callbackUrlParsed = normalizeHttpUrl(callbackUrlRaw);
  const callbackPathValid = callbackUrlParsed?.pathname === "/api/auth/github/callback";
  const callbackUrl = callbackPathValid ? callbackUrlParsed.toString() : null;
  const sessionSecretReady = env.MOSAIC_STACK_SESSION_SECRET.trim().length > 0;
  const configured = clientId.length > 0 || clientSecret.length > 0;
  const enabled = clientId.length > 0 && clientSecret.length > 0 && callbackUrl !== null && sessionSecretReady;

  return {
    enabled,
    configured,
    clientId,
    clientSecret,
    callbackUrl,
    authorizeUrl: normalizeBaseUrl(env.GITHUB_OAUTH_AUTHORIZE_URL || "https://github.com/login/oauth/authorize"),
    tokenUrl: normalizeBaseUrl(env.GITHUB_OAUTH_TOKEN_URL || "https://github.com/login/oauth/access_token"),
    scopes: env.GITHUB_OAUTH_SCOPES.length > 0 ? env.GITHUB_OAUTH_SCOPES : ["read:user", "user:email"]
  };
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

  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    payload
  };
}

async function exchangeGitHubCode(
  deps: IntegrationAuthRouteDependencies,
  code: string,
  state: string,
  redirectUri: string
) {
  const oauthConfig = resolveGitHubOAuthConfig(deps.env);

  const tokenResponse = await requestJson(
    deps.fetchImpl ?? fetch,
    oauthConfig.tokenUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        client_id: oauthConfig.clientId,
        client_secret: oauthConfig.clientSecret,
        code,
        state,
        redirect_uri: redirectUri
      })
    },
    "github_token_exchange"
  );

  if (!tokenResponse.ok || !tokenResponse.payload || typeof tokenResponse.payload !== "object") {
    throw new Error("token_exchange_failed");
  }

  const payload = tokenResponse.payload as Record<string, unknown>;
  const accessToken = typeof payload.access_token === "string" ? payload.access_token.trim() : "";
  const tokenType = typeof payload.token_type === "string" ? payload.token_type.trim() : "bearer";
  const scope = typeof payload.scope === "string" ? payload.scope.trim() : null;
  const exchangeError = typeof payload.error === "string" ? payload.error.trim() : "";

  if (exchangeError.length > 0) {
    if (exchangeError === "access_denied" || exchangeError === "incorrect_client_credentials") {
      throw new Error("scope_denied");
    }

    throw new Error("token_exchange_failed");
  }

  if (accessToken.length === 0) {
    throw new Error("token_exchange_failed");
  }

  const grantedScopes = parseScopeSet(scope);
  const missingRequiredScope = oauthConfig.scopes
    .map((requiredScope) => requiredScope.trim())
    .filter((requiredScope) => requiredScope.length > 0)
    .find((requiredScope) => !grantedScopes.has(requiredScope));

  if (missingRequiredScope) {
    throw new Error("scope_denied");
  }

  const userResponse = await requestJson(
    deps.fetchImpl ?? fetch,
    "https://api.github.com/user",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    },
    "github_identity"
  );

  if (!userResponse.ok || !userResponse.payload || typeof userResponse.payload !== "object") {
    if (userResponse.status === 401) {
      throw new Error("auth_expired");
    }

    if (userResponse.status === 403) {
      throw new Error("scope_denied");
    }

    throw new Error("upstream_unreachable");
  }

  const userPayload = userResponse.payload as Record<string, unknown>;
  const login = typeof userPayload.login === "string" ? userPayload.login.trim() : "";

  if (login.length === 0) {
    throw new Error("callback_failed");
  }

  return {
    safeIdentityLabel: login,
    credential: {
      kind: "github_oauth",
      accessToken,
      tokenType,
      scope,
      connectedAt: new Date().toISOString()
    }
  };
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
  const accessToken = typeof credential.accessToken === "string" ? credential.accessToken.trim() : "";

  if (accessToken.length === 0) {
    throw new Error("auth_expired");
  }

  const userResponse = await requestJson(
    deps.fetchImpl ?? fetch,
    "https://api.github.com/user",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    },
    "github_reverify"
  );

  if (!userResponse.ok || !userResponse.payload || typeof userResponse.payload !== "object") {
    if (userResponse.status === 401) {
      throw new Error("auth_expired");
    }

    if (userResponse.status === 403) {
      throw new Error("scope_denied");
    }

    throw new Error("upstream_unreachable");
  }

  const payload = userResponse.payload as Record<string, unknown>;
  const login = typeof payload.login === "string" ? payload.login.trim() : "";

  if (login.length === 0) {
    throw new Error("callback_failed");
  }

  return login;
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
    reply.header("Set-Cookie", buildIntegrationSessionCookie(sessionId, INTEGRATION_SESSION_MAX_AGE_SECONDS));
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

    const cookieSessionId = readIntegrationSessionCookie(request);
    const session = deps.authStore.ensureSession(cookieSessionId);
    const intent = deps.authStore.createIntent({
      provider,
      sessionId: session.sessionId,
      returnTo
    });
    maybeSetSessionCookie(reply, cookieSessionId, session.sessionId, session.created);

    reply.header("Cache-Control", "no-store");

    if (provider === "github") {
      const oauthConfig = resolveGitHubOAuthConfig(deps.env);

      if (oauthConfig.enabled) {
        const url = new URL(oauthConfig.authorizeUrl);
        url.searchParams.set("client_id", oauthConfig.clientId);
        url.searchParams.set("redirect_uri", oauthConfig.callbackUrl ?? "");
        url.searchParams.set("state", intent.state);
        url.searchParams.set("scope", oauthConfig.scopes.join(" "));
        return reply.redirect(url.toString(), 302);
      }

      if (oauthConfig.configured) {
        deps.authStore.setErrorCode(session.sessionId, provider, "missing_server_config");
        return sendIntegrationAuthError(reply, "missing_server_config", statusForErrorCode("missing_server_config"));
      }
    }

    if (provider === "matrix" && deps.matrixConfig.enabled && !deps.matrixConfig.ready) {
      deps.authStore.setErrorCode(session.sessionId, provider, "missing_server_config");
      return sendIntegrationAuthError(reply, "missing_server_config", statusForErrorCode("missing_server_config"));
    }

    if (provider === "matrix" && deps.matrixConfig.baseUrl) {
      const origin = resolveRequestOrigin(request);
      try {
        const flowTypes = await fetchMatrixLoginFlows(deps);

        if (!flowTypes.includes("m.login.sso")) {
          deps.authStore.setErrorCode(session.sessionId, provider, "sso_not_supported");
          return sendIntegrationAuthError(reply, "sso_not_supported", statusForErrorCode("sso_not_supported"));
        }

        const callbackUrl = new URL(`${origin}/api/auth/matrix/callback`);
        callbackUrl.searchParams.set("state", intent.state);
        const ssoUrl = new URL(`${normalizeBaseUrl(deps.matrixConfig.baseUrl)}${deps.env.MATRIX_SSO_REDIRECT_PATH}`);
        ssoUrl.searchParams.set("redirectUrl", callbackUrl.toString());
        return reply.redirect(ssoUrl.toString(), 302);
      } catch (error) {
        const code = error instanceof Error && error.message === "upstream_unreachable"
          ? "upstream_unreachable"
          : "callback_failed";
        deps.authStore.setErrorCode(session.sessionId, provider, code);
        return sendIntegrationAuthError(reply, code as IntegrationAuthErrorCode, statusForErrorCode(code as IntegrationAuthErrorCode));
      }
    }

    return reply.redirect(createStubCallbackUrl(provider, intent.state), 302);
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

    const intent = deps.authStore.consumeIntent(provider, parsedQuery.data.state);

    if (!intent) {
      const cookieSessionId = readIntegrationSessionCookie(request);

      if (cookieSessionId) {
        deps.authStore.setErrorCode(cookieSessionId, provider, "state_mismatch");
      }

      return sendIntegrationAuthError(reply, "state_mismatch", statusForErrorCode("state_mismatch"));
    }

    const cookieSessionId = readIntegrationSessionCookie(request);
    maybeSetSessionCookie(reply, cookieSessionId, intent.sessionId, false);
    try {
      if (provider === "github") {
        const query = parsedQuery.data as z.infer<typeof GitHubCallbackQuerySchema>;
        const oauthConfig = resolveGitHubOAuthConfig(deps.env);

        if (oauthConfig.configured && !oauthConfig.enabled) {
          deps.authStore.setErrorCode(intent.sessionId, provider, "missing_server_config");
          return sendIntegrationAuthError(reply, "missing_server_config", statusForErrorCode("missing_server_config"));
        }

        if (oauthConfig.enabled) {
          if (query.error) {
            deps.authStore.setErrorCode(intent.sessionId, provider, "scope_denied");
            return sendIntegrationAuthError(reply, "scope_denied", statusForErrorCode("scope_denied"), query.error_description);
          }

          if (!query.code) {
            deps.authStore.setErrorCode(intent.sessionId, provider, "invalid_request");
            return sendIntegrationAuthError(reply, "invalid_request", statusForErrorCode("invalid_request"));
          }

          const exchange = await exchangeGitHubCode(
            deps,
            query.code,
            query.state,
            oauthConfig.callbackUrl ?? ""
          );

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
      }

      if (provider === "matrix") {
        const query = parsedQuery.data as z.infer<typeof MatrixCallbackQuerySchema>;
        const loginToken = query.loginToken ?? query.login_token;

        if (deps.matrixConfig.baseUrl) {
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
      }

      deps.authStore.markConnected({
        provider,
        sessionId: intent.sessionId,
        safeIdentityLabel: readProviderStubIdentity(provider),
        source: "user_connected_stub"
      });
      reply.header("Cache-Control", "no-store");
      return reply.redirect(intent.returnTo, 302);
    } catch (error) {
      const message = error instanceof Error ? error.message : "callback_failed";
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
      return sendIntegrationAuthError(reply, code, statusForErrorCode(code));
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
      let safeIdentityLabel = connection.safeIdentityLabel ?? readProviderStubIdentity(provider);

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
    const oauthConfig = resolveGitHubOAuthConfig(deps.env);
    const connected = connection?.connected === true;
    const status = connected
      ? "connected"
      : oauthConfig.configured && !oauthConfig.enabled
        ? "missing_server_config"
        : "not_connected";

    reply.header("Cache-Control", "no-store");
    return reply.status(200).send({
      ok: true,
      provider: "github",
      status,
      connected,
      oauthReady: oauthConfig.enabled,
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
