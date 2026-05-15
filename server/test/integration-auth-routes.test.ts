import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";
import { createMockOpenRouterClient, createTestEnv, createTestMatrixConfig } from "../test-support/helpers.js";

const TEST_ENCRYPTION_KEY = {
  INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY_ID: "integration-auth-test",
  INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY_VERSION: "1",
  INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY: "integration-auth-test-secret"
};

const TEST_GITHUB_APP_PRIVATE_KEY = [
  "-----BEGIN PRIVATE KEY-----",
  "MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC8TmaFfZfrb4Cg",
  "YCUAbybKUfoO4RTRlrhL3rUdTKyUbEaFH3DGOh0KaWUpLAbTusGAL9mrdUNy/bpt",
  "7bp+68Dui2Cl5Y453sQ6inRJSMHzqwl0Zoh2JFGtgjjKeRe1b2GyJU5r5SLNTUuF",
  "cXGHOhfc8KUZpW558dEX3ahVdt5nkmlOvqH8o8jhV6DHMdHFJMQ5Wteyjr+30o0e",
  "NoZM8AmG9KRW4u6gUxXILbbeH1/3G3V62lr5rx/OqpdHlUPQo2ShpEq/OljjFjRZ",
  "BlpXjhR7GMSIFwACogZMDl6KPUZiiL8yqynx/gc0SjXXpD2YtY/9T+dH7U5LZXew",
  "wmiPYDFpAgMBAAECggEABwGSQC979Gkrw5vMKKPaET9DUuQmPIWTchQ1UCOjDKsq",
  "JQgWT7PIEpP5DPL7xostaaXuHvpgEfJVikNE8/W00hNKu2Vq+SV8DtMJsFPWDok7",
  "svJhK6ceiFp+3y6p9ojQPVr0u+A0vyd78rk1sIK1clWcSPPeJEieX1lSiup/LCKG",
  "oUfwY9ebJzi3/XBAXmy4vZZWzpwD3N7iGAfrhjwOfm4Qt5m1yRIufhdPP3TYyrQV",
  "e96fAOZ0PwqoH3nyqs97kVb8hmMbRHSm/hFAvP6JS1SEz0a95Z5qYGwYokjqo0bv",
  "h4+xR02H2DpT+TJU/yQQ7/Vg6KjIMEkMUtgi+xmg4QKBgQDxwwtPZGG4ngXjhH/U",
  "LoU+VAOddLn9szZbY8kef7yUAUaDO+bFuaJUQ2IqTB1PQO/P17xXWWlsar3mLzdi",
  "FgjkEKC282tkyIk4MKEd2f5sBVdDabtkCqsCFbo3dI835tv7QqQE/PlWeCJPnENV",
  "mLxhWGXKiBhq4cU6YVWZbhywoQKBgQDHZWzU3k/KivX1Jm2cdL3tClPW8QL+r9HV",
  "bTUPfY8kXi91gu5CxwOIQjAa5/T+lTDqhvuJ+BKpRcbns4FW6GAq/mEmH4x63MK3",
  "0FZZMR0+ThBV7KddubNTcVJZTsMF3ew5guVXiRj9dDvuUD00A5a/buDO/Rko2uVt",
  "oQ6t9IOjyQKBgQDKHAhkgsK/GDxMDAThWVLC3HF5PJAQa7XRiQYlnRwFj1tncrhm",
  "K95tGzgBrEgEbYEN/IjTbUgY/tNqj6Z5NXqRTuVMjQsG4i707pKC5i8wFvbwwH+M",
  "Du8PeyKGIcdpMHJPB1MfaGz5wMzOSRBxipJRvxi5zDS9hajgOWbaMZeCgQKBgQCP",
  "YwhYK2YFqNgmanP4Rpstknen4bjdnWGvsNCvSwNci75lKrpbmvGXUsF1F8i+Klr6",
  "zAamuJXy1BKtHBCuhnxhbnw+BgHneEkuFcuCaCc3XruwjnXsmFW0c5FcV5824Ne2",
  "o8J4qEYoPSW7wkfA17PYBcv0DV3CW2cQ5vi/b04awQKBgCEEDtIgVTtEgjhTmo2U",
  "VJvx8whHRnhF2HUjIqovAAO+LuQ9GmRU9sdKos9CpeYs37HjAsA49v53yUW7jzpm",
  "zxuwOmy/oratSgU6JtmlEzjrWCO0Ro/uYeqOucQnIpZECWFOGZFbPenP/rx5BJSM",
  "o+DuibDhjcy65hxrVB2D5cTQ",
  "-----END PRIVATE KEY-----"
].join("\\n");

const TEST_GITHUB_APP_ID = "123456";
const TEST_GITHUB_APP_SLUG = "mosaicstacked-test-app";
const TEST_GITHUB_INSTALLATION_ID = "12345";

const TEST_GITHUB_APP_ENV = {
  GITHUB_APP_ID: TEST_GITHUB_APP_ID,
  GITHUB_APP_PRIVATE_KEY: TEST_GITHUB_APP_PRIVATE_KEY,
  GITHUB_APP_SLUG: TEST_GITHUB_APP_SLUG
};

const TEST_GITHUB_OAUTH_ENV = {
  GITHUB_OAUTH_CLIENT_ID: "github-oauth-client-id",
  GITHUB_OAUTH_CLIENT_SECRET: "github-oauth-client-secret",
  GITHUB_OAUTH_CALLBACK_URL: "https://app.example.test/api/auth/github/callback",
  GITHUB_OAUTH_SCOPES: ["read:user", "user:email"]
};

function createGitHubAppIntegrationFetch(options: {
  installationId?: string;
  accountLogin?: string;
  repos?: string[];
  readInstallationStatus?: number;
  accessTokenStatus?: number;
  repositoriesStatus?: number;
  userAccessToken?: string;
  userInstallationsStatus?: number;
  accessTokenPayload?: Record<string, unknown> | null;
  installationPayload?: Record<string, unknown> | null;
  repositoriesPayload?: Record<string, unknown> | null;
  userTokenPayload?: Record<string, unknown> | null;
  userInstallationsPayload?: Record<string, unknown> | null;
} = {}) {
  const installationId = options.installationId ?? TEST_GITHUB_INSTALLATION_ID;
  const accountLogin = options.accountLogin ?? "octocat";
  const repos = options.repos ?? ["octo/demo", "acme/widget"];
  const userAccessToken = options.userAccessToken ?? "ghu_test_user_access_token";

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";

    if (url.pathname === "/login/oauth/access_token" && method === "POST") {
      return new Response(JSON.stringify(options.userTokenPayload ?? {
        access_token: userAccessToken,
        token_type: "bearer",
        scope: "read:user,user:email"
      }), {
        status: options.accessTokenStatus ?? 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url.pathname === "/user/installations" && method === "GET") {
      const authorization = new Headers(init?.headers).get("authorization");

      if (authorization !== `Bearer ${userAccessToken}`) {
        return new Response(JSON.stringify({ message: "Bad credentials" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify(options.userInstallationsPayload ?? {
        total_count: 1,
        installations: [{
          id: Number.parseInt(installationId, 10),
          account: {
            login: accountLogin,
            type: "Organization",
            id: 1
          }
        }]
      }), {
        status: options.userInstallationsStatus ?? 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url.pathname === `/app/installations/${installationId}` && method === "GET") {
      return new Response(JSON.stringify(options.installationPayload ?? {
        id: Number.parseInt(installationId, 10),
        account: {
          login: accountLogin,
          type: "Organization",
          id: 1
        }
      }), {
        status: options.readInstallationStatus ?? 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url.pathname === `/app/installations/${installationId}/access_tokens` && method === "POST") {
      return new Response(JSON.stringify(options.accessTokenPayload ?? {
        token: "ghs_test_installation_token",
        expires_at: "2030-01-01T00:00:00Z"
      }), {
        status: options.accessTokenStatus ?? 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url.pathname === "/installation/repositories" && method === "GET") {
      return new Response(JSON.stringify(options.repositoriesPayload ?? {
        total_count: repos.length,
        repositories: repos.map((fullName, index) => ({
          id: index + 1,
          full_name: fullName
        }))
      }), {
        status: options.repositoriesStatus ?? 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(null, { status: 404 });
  };
}

function createGitHubOAuthIntegrationFetch(options: {
  accessToken?: string;
  login?: string;
  tokenStatus?: number;
  userStatus?: number;
  tokenPayload?: Record<string, unknown> | null;
  userPayload?: Record<string, unknown> | null;
} = {}) {
  const accessToken = options.accessToken ?? "gho_user_access_token";
  const login = options.login ?? "octocat";

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";

    if (url.pathname === "/login/oauth/access_token" && method === "POST") {
      return new Response(JSON.stringify(options.tokenPayload ?? {
        access_token: accessToken,
        token_type: "bearer",
        scope: "read:user,user:email"
      }), {
        status: options.tokenStatus ?? 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url.pathname === "/user" && method === "GET") {
      const authorization = new Headers(init?.headers).get("authorization");

      if (authorization !== `Bearer ${accessToken}`) {
        return new Response(JSON.stringify({ message: "Bad credentials" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify(options.userPayload ?? {
        id: 1,
        login
      }), {
        status: options.userStatus ?? 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ message: "Unexpected GitHub OAuth request" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  };
}

function createTempStorePath() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mosaicstacked-integration-auth-routes-"));
  return path.join(directory, "integration-auth-store.json");
}

function readSetCookie(response: { headers: Record<string, unknown> }) {
  const header = response.headers["set-cookie"];

  if (Array.isArray(header)) {
    return header[0] ?? null;
  }

  return typeof header === "string" ? header : null;
}

function readSetCookies(response: { headers: Record<string, unknown> }) {
  const header = response.headers["set-cookie"];

  if (Array.isArray(header)) {
    return header;
  }

  return typeof header === "string" ? [header] : [];
}

function joinCookiesForRequest(cookies: string[]) {
  return cookies
    .map((cookie) => cookie.split(";", 1)[0]?.trim())
    .filter((cookie): cookie is string => Boolean(cookie))
    .join("; ");
}

function readGitHubStateFromAuthorizeLocation(location: string) {
  return new URL(location).searchParams.get("state");
}

function readMatrixStateFromStartLocation(location: string) {
  const startUrl = new URL(location);
  const redirectUrl = new URL(String(startUrl.searchParams.get("redirectUrl")));
  return redirectUrl.searchParams.get("state");
}

test("integration auth start fails closed for non-allowlisted returnTo", async (t) => {
  const app = createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/auth/github/start?returnTo=https%3A%2F%2Fevil.example%2Fcallback"
  });

  assert.equal(response.statusCode, 400);
  const payload = JSON.parse(response.body) as {
    error: {
      code: string;
    };
  };
  assert.equal(payload.error.code, "invalid_return_to");
});

test("integration callback rejects state mismatch and does not establish a connection", async (t) => {
  const app = createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const callback = await app.inject({
    method: "GET",
    url: "/api/auth/github/callback?state=invalid-state&installation_id=1"
  });

  assert.equal(callback.statusCode, 400);
  const callbackPayload = JSON.parse(callback.body) as {
    error: {
      code: string;
    };
  };
  assert.equal(callbackPayload.error.code, "state_mismatch");

  const status = await app.inject({
    method: "GET",
    url: "/api/integrations/status"
  });
  const payload = JSON.parse(status.body) as {
    github: {
      status: string;
      credentialSource: string;
    };
  };

  assert.equal(payload.github.status, "missing_server_config");
  assert.equal(payload.github.credentialSource, "not_connected");
});

test("github start fails closed when app config is not configured instead of using a stub callback", async (t) => {
  const app = createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/github/start"
  });

  assert.equal(start.statusCode, 503);
  assert.equal(start.headers.location, undefined);
  assert.equal(readSetCookie(start), null);
  const startPayload = JSON.parse(start.body) as {
    error: {
      code: string;
      details: string | null;
    };
  };
  assert.equal(startPayload.error.code, "missing_server_config");
  assert.equal(
    startPayload.error.details,
    "Missing GitHub App server config: GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_SLUG"
  );

  const status = await app.inject({
    method: "GET",
    url: "/api/integrations/status"
  });

  assert.equal(status.statusCode, 200);
  const payload = JSON.parse(status.body) as {
    github: {
      status: string;
      authState: string;
      credentialSource: string;
      requirements: string[];
      lastVerifiedAt: string | null;
    };
  };

  assert.equal(payload.github.status, "missing_server_config");
  assert.equal(payload.github.authState, "not_configured");
  assert.equal(payload.github.credentialSource, "not_connected");
  assert.deepEqual(payload.github.requirements, [
    "GITHUB_APP_ID",
    "GITHUB_APP_PRIVATE_KEY",
    "GITHUB_APP_SLUG"
  ]);
  assert.equal(payload.github.lastVerifiedAt, null);
});

test("integrations status allows GitHub App connection before repository selection", async (t) => {
  const app = createApp({
    env: createTestEnv({
      ...TEST_GITHUB_APP_ENV
    }),
    openRouter: createMockOpenRouterClient(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const status = await app.inject({
    method: "GET",
    url: "/api/integrations/status"
  });
  const payload = JSON.parse(status.body) as {
    github: {
      status: string;
      requirements: string[];
    };
  };

  assert.equal(payload.github.status, "connect_available");
  assert.deepEqual(payload.github.requirements, []);
});

test("github auth status endpoint only exposes safe metadata", async (t) => {
  const app = createApp({
    env: createTestEnv({
      GITHUB_APP_ID: "github-client-id",
      GITHUB_APP_PRIVATE_KEY: TEST_GITHUB_APP_PRIVATE_KEY,
      GITHUB_APP_SLUG: TEST_GITHUB_APP_SLUG,
      GITHUB_ALLOWED_REPOS: ["acme/widget"],
      MOSAIC_STACK_SESSION_SECRET: "status-session-secret",
      ...TEST_ENCRYPTION_KEY
    }),
    openRouter: createMockOpenRouterClient(),
    integrationFetch: createGitHubAppIntegrationFetch(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/github/start"
  });
  const sessionCookie = readSetCookie(start);
  const state = readGitHubStateFromAuthorizeLocation(String(start.headers.location ?? ""));

  assert.ok(sessionCookie);
  assert.ok(state);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(state ?? "")}&installation_id=${TEST_GITHUB_INSTALLATION_ID}`,
    headers: {
      cookie: sessionCookie ?? ""
    }
  });
  assert.equal(callback.statusCode, 302);

  const status = await app.inject({
    method: "GET",
    url: "/api/auth/github/status",
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  assert.equal(status.statusCode, 200);
  const payload = JSON.parse(status.body) as {
    ok: true;
    provider: string;
    status: string;
    connected: boolean;
    oauthReady: boolean;
    identity: string | null;
    credentialSource: string;
    lastVerifiedAt: string | null;
    lastErrorCode: string | null;
  };

  assert.equal(payload.ok, true);
  assert.equal(payload.provider, "github");
  assert.equal(payload.status, "connected");
  assert.equal(payload.connected, true);
  assert.equal(payload.oauthReady, true);
  assert.equal(payload.identity, `octocat (installation ${TEST_GITHUB_INSTALLATION_ID})`);
  assert.equal(payload.credentialSource, "user_connected");
  assert.ok(payload.lastVerifiedAt);
  assert.equal(payload.lastErrorCode, null);
  assert.doesNotMatch(status.body, /gho_status_redaction_token/);
  assert.doesNotMatch(status.body, /github-client-secret/);
});

test("disconnect removes user app connection but keeps instance-level status when instance config exists", async (t) => {
  const app = createApp({
    env: createTestEnv({
      GITHUB_APP_INSTALLATION_ID: TEST_GITHUB_INSTALLATION_ID,
      GITHUB_ALLOWED_REPOS: ["octo/demo"],
      GITHUB_AGENT_API_KEY: "instance-admin-key",
      GITHUB_APP_ID: "github-client-id",
      GITHUB_APP_PRIVATE_KEY: TEST_GITHUB_APP_PRIVATE_KEY,
      GITHUB_APP_SLUG: TEST_GITHUB_APP_SLUG,
      MOSAIC_STACK_SESSION_SECRET: "disconnect-session-secret",
      ...TEST_ENCRYPTION_KEY
    }),
    openRouter: createMockOpenRouterClient(),
    integrationFetch: createGitHubAppIntegrationFetch(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/github/start"
  });
  const sessionCookie = readSetCookie(start);

  assert.ok(sessionCookie);

  const state = readGitHubStateFromAuthorizeLocation(String(start.headers.location ?? ""));
  assert.ok(state);

  await app.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(state ?? "")}&installation_id=${TEST_GITHUB_INSTALLATION_ID}`,
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  const beforeDisconnect = await app.inject({
    method: "GET",
    url: "/api/integrations/status",
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  const beforePayload = JSON.parse(beforeDisconnect.body) as {
    github: {
      credentialSource: string;
    };
  };
  assert.equal(beforePayload.github.credentialSource, "user_connected");

  const disconnect = await app.inject({
    method: "POST",
    url: "/api/auth/github/disconnect",
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  assert.equal(disconnect.statusCode, 200);

  const afterDisconnect = await app.inject({
    method: "GET",
    url: "/api/integrations/status",
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  const afterPayload = JSON.parse(afterDisconnect.body) as {
    github: {
      status: string;
      credentialSource: string;
    };
  };

  assert.equal(afterPayload.github.status, "connect_available");
  assert.equal(afterPayload.github.credentialSource, "instance_configured");
});

test("github logout alias clears connection the same as disconnect", async (t) => {
  const app = createApp({
    env: createTestEnv({
      GITHUB_APP_ID: "github-client-id",
      GITHUB_APP_PRIVATE_KEY: TEST_GITHUB_APP_PRIVATE_KEY,
      GITHUB_APP_SLUG: TEST_GITHUB_APP_SLUG,
      MOSAIC_STACK_SESSION_SECRET: "logout-session-secret",
      ...TEST_ENCRYPTION_KEY
    }),
    openRouter: createMockOpenRouterClient(),
    integrationFetch: createGitHubAppIntegrationFetch(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/github/start"
  });
  const sessionCookie = readSetCookie(start);

  assert.ok(sessionCookie);
  const state = readGitHubStateFromAuthorizeLocation(String(start.headers.location ?? ""));
  assert.ok(state);

  await app.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(state ?? "")}&installation_id=${TEST_GITHUB_INSTALLATION_ID}`,
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  const logout = await app.inject({
    method: "POST",
    url: "/api/auth/github/logout",
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  assert.equal(logout.statusCode, 200);
  const payload = JSON.parse(logout.body) as {
    ok: boolean;
    provider: string;
    disconnected: boolean;
  };
  assert.equal(payload.ok, true);
  assert.equal(payload.provider, "github");
  assert.equal(payload.disconnected, true);
});

test("matrix start fails closed when Matrix login is not configured instead of using a stub session", async (t) => {
  const app = createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/matrix/start"
  });

  assert.equal(start.statusCode, 503);
  assert.equal(start.headers.location, undefined);
  assert.equal(readSetCookie(start), null);
  const startPayload = JSON.parse(start.body) as {
    error: {
      code: string;
    };
  };
  assert.equal(startPayload.error.code, "missing_server_config");

  const status = await app.inject({
    method: "GET",
    url: "/api/integrations/status"
  });
  const payload = JSON.parse(status.body) as {
    matrix: {
      status: string;
      authState: string;
      credentialSource: string;
      lastVerifiedAt: string | null;
    };
  };

  assert.equal(payload.matrix.status, "connect_available");
  assert.equal(payload.matrix.authState, "not_configured");
  assert.equal(payload.matrix.credentialSource, "not_connected");
  assert.equal(payload.matrix.lastVerifiedAt, null);
});

test("integrations status never exposes backend secrets", async (t) => {
  const app = createApp({
    env: createTestEnv({
      GITHUB_TOKEN: "secret-github-token",
      GITHUB_ALLOWED_REPOS: ["octo/demo"],
      MOSAIC_STACK_ADMIN_PASSWORD: "secret-admin-password",
      MOSAIC_STACK_SESSION_SECRET: "secret-session-secret"
    }),
    openRouter: createMockOpenRouterClient(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/integrations/status"
  });

  assert.equal(response.statusCode, 200);
  const serialized = response.body;
  assert.doesNotMatch(serialized, /secret-github-token/);
  assert.doesNotMatch(serialized, /secret-admin-password/);
  assert.doesNotMatch(serialized, /secret-session-secret/);
});

test("real GitHub App callback stores a user-connected credential source", async (t) => {
  const env = createTestEnv({
    ...TEST_GITHUB_APP_ENV,
    GITHUB_ALLOWED_REPOS: ["acme/widget"],
    MOSAIC_STACK_SESSION_SECRET: "real-oauth-session-secret",
    ...TEST_ENCRYPTION_KEY
  });

  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient(),
    integrationFetch: createGitHubAppIntegrationFetch(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/github/start"
  });

  assert.equal(start.statusCode, 302);
  const location = String(start.headers.location ?? "");
  const sessionCookie = readSetCookie(start);
  assert.ok(location.startsWith(`https://github.com/apps/${TEST_GITHUB_APP_SLUG}/installations/new`));
  assert.ok(sessionCookie);
  const locationUrl = new URL(location);
  const state = locationUrl.searchParams.get("state");
  assert.ok(state);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(state ?? "")}&installation_id=${TEST_GITHUB_INSTALLATION_ID}`,
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  assert.equal(callback.statusCode, 302);
  assert.equal(callback.headers.location, "/console?mode=settings");

  const status = await app.inject({
    method: "GET",
    url: "/api/integrations/status",
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  const payload = JSON.parse(status.body) as {
    github: {
      credentialSource: string;
      labels: {
        identity: string | null;
      };
    };
  };

  assert.equal(payload.github.credentialSource, "user_connected");
  assert.equal(payload.github.labels.identity, `octocat (installation ${TEST_GITHUB_INSTALLATION_ID})`);
});

test("GitHub App install and authorize callback resolves user installation from OAuth code", async (t) => {
  const env = createTestEnv({
    ...TEST_GITHUB_APP_ENV,
    ...TEST_GITHUB_OAUTH_ENV,
    MOSAIC_STACK_SESSION_SECRET: "github-app-install-authorize-session-secret",
    ...TEST_ENCRYPTION_KEY
  });

  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient(),
    integrationFetch: createGitHubAppIntegrationFetch({
      repos: ["baum777/mosaicStack"]
    }),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/github/start"
  });

  assert.equal(start.statusCode, 302);
  const startLocation = new URL(String(start.headers.location ?? ""));
  const browserCookie = joinCookiesForRequest(readSetCookies(start));
  const state = startLocation.searchParams.get("state");

  assert.equal(startLocation.origin + startLocation.pathname, `https://github.com/apps/${TEST_GITHUB_APP_SLUG}/installations/new`);
  assert.ok(state);
  assert.ok(browserCookie);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(state ?? "")}&code=github-app-user-code`,
    headers: {
      cookie: browserCookie
    }
  });

  assert.equal(callback.statusCode, 302);
  assert.equal(callback.headers.location, "/console?mode=settings");

  const status = await app.inject({
    method: "GET",
    url: "/api/integrations/status",
    headers: {
      cookie: browserCookie
    }
  });

  const payload = JSON.parse(status.body) as {
    github: {
      credentialSource: string;
      labels: {
        identity: string | null;
        scope: string | null;
      };
    };
  };

  assert.equal(payload.github.credentialSource, "user_connected");
  assert.equal(payload.github.labels.identity, `octocat (installation ${TEST_GITHUB_INSTALLATION_ID})`);
  assert.equal(payload.github.labels.scope, "GitHub App installation controls repository access.");
});

test("GitHub App install and authorize callback fails closed for ambiguous user installations", async (t) => {
  const env = createTestEnv({
    ...TEST_GITHUB_APP_ENV,
    ...TEST_GITHUB_OAUTH_ENV,
    MOSAIC_STACK_SESSION_SECRET: "github-app-ambiguous-install-session-secret",
    ...TEST_ENCRYPTION_KEY
  });

  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient(),
    integrationFetch: createGitHubAppIntegrationFetch({
      userInstallationsPayload: {
        total_count: 2,
        installations: [
          {
            id: Number.parseInt(TEST_GITHUB_INSTALLATION_ID, 10),
            account: {
              login: "octocat",
              type: "User",
              id: 1
            }
          },
          {
            id: 67890,
            account: {
              login: "acme",
              type: "Organization",
              id: 2
            }
          }
        ]
      }
    }),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/github/start"
  });
  const state = readGitHubStateFromAuthorizeLocation(String(start.headers.location ?? ""));
  const browserCookie = joinCookiesForRequest(readSetCookies(start));

  assert.ok(state);
  assert.ok(browserCookie);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(state ?? "")}&code=github-app-user-code`,
    headers: {
      cookie: browserCookie
    }
  });

  assert.equal(callback.statusCode, 403);
  const callbackPayload = JSON.parse(callback.body) as {
    error: {
      code: string;
    };
  };
  assert.equal(callbackPayload.error.code, "scope_denied");
});

test("GitHub OAuth app start uses configured OAuth authorize flow when GitHub App config is absent", async (t) => {
  const env = createTestEnv({
    ...TEST_GITHUB_OAUTH_ENV,
    MOSAIC_STACK_SESSION_SECRET: "github-oauth-session-secret",
    ...TEST_ENCRYPTION_KEY
  });

  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient(),
    integrationFetch: createGitHubOAuthIntegrationFetch(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/github/start"
  });

  assert.equal(start.statusCode, 302);
  const location = new URL(String(start.headers.location ?? ""));
  assert.equal(location.origin + location.pathname, "https://github.com/login/oauth/authorize");
  assert.equal(location.searchParams.get("client_id"), TEST_GITHUB_OAUTH_ENV.GITHUB_OAUTH_CLIENT_ID);
  assert.equal(location.searchParams.get("redirect_uri"), TEST_GITHUB_OAUTH_ENV.GITHUB_OAUTH_CALLBACK_URL);
  assert.equal(location.searchParams.get("scope"), TEST_GITHUB_OAUTH_ENV.GITHUB_OAUTH_SCOPES.join(","));
  assert.ok(location.searchParams.get("state"));
});

test("GitHub OAuth app callback exchanges code and stores a user-connected credential", async (t) => {
  const env = createTestEnv({
    ...TEST_GITHUB_OAUTH_ENV,
    MOSAIC_STACK_SESSION_SECRET: "github-oauth-callback-secret",
    ...TEST_ENCRYPTION_KEY
  });
  const fetchImpl = createGitHubOAuthIntegrationFetch({ login: "mona" });

  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient(),
    integrationFetch: fetchImpl,
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/github/start"
  });

  assert.equal(start.statusCode, 302);
  const state = readGitHubStateFromAuthorizeLocation(String(start.headers.location ?? ""));
  const browserCookie = joinCookiesForRequest(readSetCookies(start));
  assert.ok(state);
  assert.ok(browserCookie);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(state ?? "")}&code=oauth-code`,
    headers: {
      cookie: browserCookie
    }
  });

  assert.equal(callback.statusCode, 302);
  assert.equal(callback.headers.location, "/console?mode=settings");

  const status = await app.inject({
    method: "GET",
    url: "/api/integrations/status",
    headers: {
      cookie: browserCookie
    }
  });

  const payload = JSON.parse(status.body) as {
    github: {
      credentialSource: string;
      labels: {
        identity: string | null;
      };
    };
  };

  assert.equal(payload.github.credentialSource, "user_connected");
  assert.equal(payload.github.labels.identity, "mona");
});

test("real GitHub App callback survives a fresh serverless auth store", async (t) => {
  const env = createTestEnv({
    ...TEST_GITHUB_APP_ENV,
    GITHUB_ALLOWED_REPOS: ["acme/widget"],
    MOSAIC_STACK_SESSION_SECRET: "serverless-oauth-session-secret",
    ...TEST_ENCRYPTION_KEY
  });
  const fetchImpl = createGitHubAppIntegrationFetch();

  const startApp = createApp({
    env,
    openRouter: createMockOpenRouterClient(),
    integrationFetch: fetchImpl,
    logger: false
  });
  const callbackApp = createApp({
    env,
    openRouter: createMockOpenRouterClient(),
    integrationFetch: fetchImpl,
    logger: false
  });

  t.after(async () => {
    await startApp.close();
    await callbackApp.close();
  });

  const start = await startApp.inject({
    method: "GET",
    url: "/api/auth/github/start"
  });

  assert.equal(start.statusCode, 302);
  const state = readGitHubStateFromAuthorizeLocation(String(start.headers.location ?? ""));
  const browserCookie = joinCookiesForRequest(readSetCookies(start));
  assert.ok(state);
  assert.ok(browserCookie);

  const callback = await callbackApp.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(state ?? "")}&installation_id=${TEST_GITHUB_INSTALLATION_ID}`,
    headers: {
      cookie: browserCookie
    }
  });

  assert.equal(callback.statusCode, 302);
  assert.equal(callback.headers.location, "/console?mode=settings");

  const status = await callbackApp.inject({
    method: "GET",
    url: "/api/integrations/status",
    headers: {
      cookie: browserCookie
    }
  });
  const payload = JSON.parse(status.body) as {
    github: {
      credentialSource: string;
      labels: {
        identity: string | null;
      };
    };
  };

  assert.equal(payload.github.credentialSource, "user_connected");
  assert.equal(payload.github.labels.identity, `octocat (installation ${TEST_GITHUB_INSTALLATION_ID})`);
});

test("real Matrix login-token callback stores a user-connected credential source", async (t) => {
  const env = createTestEnv({
    MATRIX_LOGIN_TOKEN_TYPE: "m.login.token",
    MOSAIC_STACK_SESSION_SECRET: "real-matrix-session-secret",
    ...TEST_ENCRYPTION_KEY
  });

  const app = createApp({
    env,
    matrixConfig: createTestMatrixConfig({
      enabled: true,
      ready: true,
      baseUrl: "https://matrix.example",
      homeserverUrl: "https://matrix.example",
      expectedUserId: "@user:matrix.example"
    }),
    openRouter: createMockOpenRouterClient(),
    integrationFetch: async (input, init) => {
      const url = String(input);

      if (url === "https://matrix.example/_matrix/client/v3/login" && (!init || init.method === "GET")) {
        return new Response(JSON.stringify({
          flows: [{ type: "m.login.sso" }]
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url === "https://matrix.example/_matrix/client/v3/login" && init?.method === "POST") {
        return new Response(JSON.stringify({
          access_token: "matrix_access_token",
          user_id: "@user:matrix.example",
          device_id: "DEVICE"
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url === "https://matrix.example/_matrix/client/v3/account/whoami") {
        return new Response(JSON.stringify({
          user_id: "@user:matrix.example"
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(null, { status: 404 });
    },
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/matrix/start"
  });

  assert.equal(start.statusCode, 302);
  const location = String(start.headers.location ?? "");
  const sessionCookie = readSetCookie(start);
  assert.ok(location.startsWith("https://matrix.example/_matrix/client/v3/login/sso/redirect"));
  assert.ok(sessionCookie);

  const startUrl = new URL(location);
  const redirectUrl = new URL(String(startUrl.searchParams.get("redirectUrl")));
  const state = redirectUrl.searchParams.get("state");
  assert.ok(state);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/matrix/callback?state=${encodeURIComponent(state ?? "")}&loginToken=real_login_token`,
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  assert.equal(callback.statusCode, 302);
  assert.equal(callback.headers.location, "/console?mode=settings");

  const status = await app.inject({
    method: "GET",
    url: "/api/integrations/status",
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  const payload = JSON.parse(status.body) as {
    matrix: {
      credentialSource: string;
      labels: {
        identity: string | null;
      };
    };
  };

  assert.equal(payload.matrix.credentialSource, "user_connected");
  assert.equal(payload.matrix.labels.identity, "@user:matrix.example");
});

test("matrix callback fails closed when homeserver is configured but login token is missing", async (t) => {
  const env = createTestEnv({
    MATRIX_LOGIN_TOKEN_TYPE: "m.login.token",
    MOSAIC_STACK_SESSION_SECRET: "matrix-fail-closed-session-secret"
  });

  const app = createApp({
    env,
    matrixConfig: createTestMatrixConfig({
      enabled: true,
      ready: true,
      baseUrl: "https://matrix.example",
      homeserverUrl: "https://matrix.example"
    }),
    openRouter: createMockOpenRouterClient(),
    integrationFetch: async (input, init) => {
      const url = String(input);

      if (url === "https://matrix.example/_matrix/client/v3/login" && (!init || init.method === "GET")) {
        return new Response(JSON.stringify({
          flows: [{ type: "m.login.sso" }]
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(null, { status: 404 });
    },
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/matrix/start"
  });
  const sessionCookie = readSetCookie(start);
  const location = String(start.headers.location ?? "");
  const startUrl = new URL(location);
  const redirectUrl = new URL(String(startUrl.searchParams.get("redirectUrl")));
  const state = redirectUrl.searchParams.get("state");

  assert.equal(start.statusCode, 302);
  assert.ok(sessionCookie);
  assert.ok(state);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/matrix/callback?state=${encodeURIComponent(state ?? "")}`,
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  assert.equal(callback.statusCode, 401);
  const callbackPayload = JSON.parse(callback.body) as {
    error: {
      code: string;
    };
  };
  assert.equal(callbackPayload.error.code, "login_token_invalid");

  const status = await app.inject({
    method: "GET",
    url: "/api/integrations/status",
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  const payload = JSON.parse(status.body) as {
    matrix: {
      status: string;
      credentialSource: string;
      lastErrorCode: string | null;
    };
  };

  assert.equal(payload.matrix.status, "error");
  assert.equal(payload.matrix.credentialSource, "instance_configured");
  assert.equal(payload.matrix.lastErrorCode, "login_token_invalid");
});

test("real github reverify maps upstream 401 to auth_expired status", async (t) => {
  const env = createTestEnv({
    GITHUB_APP_ID: "github-client-id",
    GITHUB_APP_PRIVATE_KEY: TEST_GITHUB_APP_PRIVATE_KEY,
    GITHUB_APP_SLUG: TEST_GITHUB_APP_SLUG,
    GITHUB_ALLOWED_REPOS: ["acme/widget"],
    MOSAIC_STACK_SESSION_SECRET: "github-reverify-session-secret",
    ...TEST_ENCRYPTION_KEY
  });

  let installationReads = 0;
  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient(),
    integrationFetch: async (input, init) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";

      if (url.pathname === `/app/installations/${TEST_GITHUB_INSTALLATION_ID}` && method === "GET") {
        installationReads += 1;

        if (installationReads === 1) {
          return new Response(JSON.stringify({
            id: Number.parseInt(TEST_GITHUB_INSTALLATION_ID, 10),
            account: {
              login: "octocat",
              type: "Organization",
              id: 1
            }
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify({
          message: "Requires authentication"
        }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url.pathname === `/app/installations/${TEST_GITHUB_INSTALLATION_ID}/access_tokens` && method === "POST") {
        return new Response(JSON.stringify({
          token: "ghs_test_installation_token",
          expires_at: "2030-01-01T00:00:00Z"
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url.pathname === "/installation/repositories" && method === "GET") {
        return new Response(JSON.stringify({
          total_count: 1,
          repositories: [{ id: 1, full_name: "acme/widget" }]
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(null, { status: 404 });
    },
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/github/start"
  });
  const sessionCookie = readSetCookie(start);
  const location = String(start.headers.location ?? "");
  const state = new URL(location).searchParams.get("state");

  assert.equal(start.statusCode, 302);
  assert.ok(sessionCookie);
  assert.ok(state);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(state ?? "")}&installation_id=${TEST_GITHUB_INSTALLATION_ID}`,
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  assert.equal(callback.statusCode, 302);

  const reverify = await app.inject({
    method: "POST",
    url: "/api/auth/github/reverify",
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  assert.equal(reverify.statusCode, 401);
  const reverifyPayload = JSON.parse(reverify.body) as {
    error: {
      code: string;
    };
  };
  assert.equal(reverifyPayload.error.code, "auth_expired");

  const status = await app.inject({
    method: "GET",
    url: "/api/integrations/status",
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  const payload = JSON.parse(status.body) as {
    github: {
      status: string;
      authState: string;
      credentialSource: string;
      lastErrorCode: string | null;
    };
  };

  assert.equal(payload.github.status, "auth_expired");
  assert.equal(payload.github.authState, "auth_expired");
  assert.equal(payload.github.credentialSource, "user_connected");
  assert.equal(payload.github.lastErrorCode, "auth_expired");
});

test("github callback fails closed when app install is denied by the provider", async (t) => {
  const app = createApp({
    env: createTestEnv({
      GITHUB_APP_ID: "github-client-id",
      GITHUB_APP_PRIVATE_KEY: TEST_GITHUB_APP_PRIVATE_KEY,
      GITHUB_APP_SLUG: TEST_GITHUB_APP_SLUG
    }),
    openRouter: createMockOpenRouterClient(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/github/start"
  });
  const sessionCookie = readSetCookie(start);
  const state = readGitHubStateFromAuthorizeLocation(String(start.headers.location ?? ""));

  assert.equal(start.statusCode, 302);
  assert.ok(state);
  assert.ok(sessionCookie);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(state ?? "")}&error=access_denied&error_description=user%20cancelled`,
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  assert.equal(callback.statusCode, 403);
  const payload = JSON.parse(callback.body) as {
    error: {
      code: string;
    };
  };
  assert.equal(payload.error.code, "scope_denied");

  const status = await app.inject({
    method: "GET",
    url: "/api/integrations/status",
    headers: {
      cookie: sessionCookie ?? ""
    }
  });
  const statusPayload = JSON.parse(status.body) as {
    github: {
      credentialSource: string;
      lastErrorCode: string | null;
    };
  };

  assert.equal(statusPayload.github.lastErrorCode, "scope_denied");
  assert.equal(statusPayload.github.credentialSource, "not_connected");
});

test("github start fails closed when app config is partial instead of falling back to stub", async (t) => {
  const app = createApp({
    env: createTestEnv({
      GITHUB_APP_ID: "github-client-id",
      GITHUB_APP_PRIVATE_KEY: ""
    }),
    openRouter: createMockOpenRouterClient(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/github/start"
  });

  assert.equal(start.statusCode, 503);
  const payload = JSON.parse(start.body) as {
    error: {
      code: string;
    };
  };
  assert.equal(payload.error.code, "missing_server_config");
});

test("github start fails closed when app slug is missing", async (t) => {
  const app = createApp({
    env: createTestEnv({
      GITHUB_APP_ID: "github-client-id",
      GITHUB_APP_PRIVATE_KEY: TEST_GITHUB_APP_PRIVATE_KEY,
      GITHUB_APP_SLUG: ""
    }),
    openRouter: createMockOpenRouterClient(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/github/start"
  });

  assert.equal(start.statusCode, 503);
  const payload = JSON.parse(start.body) as {
    error: {
      code: string;
    };
  };
  assert.equal(payload.error.code, "missing_server_config");
});

test("github start fails closed when session secret is missing in app mode", async (t) => {
  const app = createApp({
    env: createTestEnv({
      GITHUB_APP_ID: "github-client-id",
      GITHUB_APP_PRIVATE_KEY: TEST_GITHUB_APP_PRIVATE_KEY,
      GITHUB_APP_SLUG: TEST_GITHUB_APP_SLUG,
      MOSAIC_STACK_SESSION_SECRET: ""
    }),
    openRouter: createMockOpenRouterClient(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/github/start"
  });

  assert.equal(start.statusCode, 503);
  const payload = JSON.parse(start.body) as {
    error: {
      code: string;
    };
  };
  assert.equal(payload.error.code, "missing_server_config");
});

test("github callback fails closed when installation id is missing in real credential mode", async (t) => {
  const app = createApp({
    env: createTestEnv({
      GITHUB_APP_ID: "github-client-id",
      GITHUB_APP_PRIVATE_KEY: TEST_GITHUB_APP_PRIVATE_KEY,
      GITHUB_APP_SLUG: TEST_GITHUB_APP_SLUG,
      ...TEST_ENCRYPTION_KEY
    }),
    openRouter: createMockOpenRouterClient(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/github/start"
  });
  const sessionCookie = readSetCookie(start);
  const state = readGitHubStateFromAuthorizeLocation(String(start.headers.location ?? ""));

  assert.ok(sessionCookie);
  assert.ok(state);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(state ?? "")}`,
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  assert.equal(callback.statusCode, 400);
  const payload = JSON.parse(callback.body) as {
    error: {
      code: string;
    };
  };
  assert.equal(payload.error.code, "invalid_request");
});

test("github callback fails closed when app installation token exchange is invalid", async (t) => {
  const app = createApp({
    env: createTestEnv({
      ...TEST_GITHUB_APP_ENV
    }),
    openRouter: createMockOpenRouterClient(),
    integrationFetch: createGitHubAppIntegrationFetch({
      accessTokenStatus: 500,
      accessTokenPayload: {
        message: "token exchange failed"
      }
    }),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/github/start"
  });
  const sessionCookie = readSetCookie(start);
  const state = readGitHubStateFromAuthorizeLocation(String(start.headers.location ?? ""));

  assert.ok(sessionCookie);
  assert.ok(state);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(state ?? "")}&installation_id=${TEST_GITHUB_INSTALLATION_ID}`,
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  assert.equal(callback.statusCode, 502);
  const payload = JSON.parse(callback.body) as {
    error: {
      code: string;
    };
  };
  assert.equal(payload.error.code, "token_exchange_failed");
});

test("github callback exposes sanitized oauth token exchange detail when available", async (t) => {
  const env = createTestEnv({
    ...TEST_GITHUB_APP_ENV,
    ...TEST_GITHUB_OAUTH_ENV,
    MOSAIC_STACK_SESSION_SECRET: "github-app-install-authorize-token-detail-secret",
    ...TEST_ENCRYPTION_KEY
  });

  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient(),
    integrationFetch: createGitHubAppIntegrationFetch({
      accessTokenStatus: 400,
      userTokenPayload: {
        error: "redirect_uri_mismatch",
        error_description: "Bad Request"
      }
    }),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/github/start"
  });
  const browserCookie = joinCookiesForRequest(readSetCookies(start));
  const state = readGitHubStateFromAuthorizeLocation(String(start.headers.location ?? ""));

  assert.ok(browserCookie);
  assert.ok(state);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(state ?? "")}&code=github-app-user-code`,
    headers: {
      cookie: browserCookie
    }
  });

  assert.equal(callback.statusCode, 502);
  const payload = JSON.parse(callback.body) as {
    error: {
      code: string;
      details: string | null;
    };
  };
  assert.equal(payload.error.code, "token_exchange_failed");
  assert.equal(payload.error.details, "redirect_uri_mismatch");
});

test("github callback exposes sanitized oauth token exchange detail from urlencoded upstream body", async (t) => {
  const env = createTestEnv({
    ...TEST_GITHUB_APP_ENV,
    ...TEST_GITHUB_OAUTH_ENV,
    MOSAIC_STACK_SESSION_SECRET: "github-app-install-authorize-urlencoded-detail-secret",
    ...TEST_ENCRYPTION_KEY
  });

  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient(),
    integrationFetch: async (input, init) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";

      if (url.pathname === "/login/oauth/access_token" && method === "POST") {
        return new Response("error=bad_verification_code&error_description=The+code+passed+is+incorrect+or+expired.", {
          status: 400,
          headers: { "Content-Type": "application/x-www-form-urlencoded" }
        });
      }

      return new Response(null, { status: 404 });
    },
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/github/start"
  });
  const browserCookie = joinCookiesForRequest(readSetCookies(start));
  const state = readGitHubStateFromAuthorizeLocation(String(start.headers.location ?? ""));

  assert.ok(browserCookie);
  assert.ok(state);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(state ?? "")}&code=github-app-user-code`,
    headers: {
      cookie: browserCookie
    }
  });

  assert.equal(callback.statusCode, 502);
  const payload = JSON.parse(callback.body) as {
    error: {
      code: string;
      details: string | null;
    };
  };
  assert.equal(payload.error.code, "token_exchange_failed");
  assert.equal(payload.error.details, "bad_verification_code");
});

test("github callback fails closed when installation has no repositories", async (t) => {
  const app = createApp({
    env: createTestEnv({
      ...TEST_GITHUB_APP_ENV
    }),
    openRouter: createMockOpenRouterClient(),
    integrationFetch: createGitHubAppIntegrationFetch({
      repos: []
    }),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/github/start"
  });
  const sessionCookie = readSetCookie(start);
  const state = readGitHubStateFromAuthorizeLocation(String(start.headers.location ?? ""));

  assert.ok(sessionCookie);
  assert.ok(state);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(state ?? "")}&installation_id=${TEST_GITHUB_INSTALLATION_ID}`,
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  assert.equal(callback.statusCode, 403);
  const payload = JSON.parse(callback.body) as {
    error: {
      code: string;
    };
  };
  assert.equal(payload.error.code, "scope_denied");
});

test("matrix start fails closed when SSO login flow is not supported", async (t) => {
  const app = createApp({
    env: createTestEnv(),
    matrixConfig: createTestMatrixConfig({
      enabled: true,
      ready: true,
      baseUrl: "https://matrix.example",
      homeserverUrl: "https://matrix.example"
    }),
    openRouter: createMockOpenRouterClient(),
    integrationFetch: async (input, init) => {
      const url = String(input);

      if (url === "https://matrix.example/_matrix/client/v3/login" && (!init || init.method === "GET")) {
        return new Response(JSON.stringify({
          flows: [{ type: "m.login.password" }]
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(null, { status: 404 });
    },
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/matrix/start"
  });

  assert.equal(start.statusCode, 502);
  const payload = JSON.parse(start.body) as {
    error: {
      code: string;
    };
  };
  assert.equal(payload.error.code, "sso_not_supported");
});

test("matrix start fails closed when Matrix auth config is enabled but incomplete", async (t) => {
  const app = createApp({
    env: createTestEnv(),
    matrixConfig: createTestMatrixConfig({
      enabled: true,
      ready: false,
      baseUrl: null,
      homeserverUrl: null,
      accessToken: null,
      issues: ["MATRIX_BASE_URL is required when MATRIX_ENABLED=true"]
    }),
    openRouter: createMockOpenRouterClient(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/matrix/start"
  });

  assert.equal(start.statusCode, 503);
  const payload = JSON.parse(start.body) as {
    error: {
      code: string;
    };
  };
  assert.equal(payload.error.code, "missing_server_config");
});

test("matrix start fails closed when homeserver login flow response is malformed", async (t) => {
  const app = createApp({
    env: createTestEnv(),
    matrixConfig: createTestMatrixConfig({
      enabled: true,
      ready: true,
      baseUrl: "https://matrix.example",
      homeserverUrl: "https://matrix.example"
    }),
    openRouter: createMockOpenRouterClient(),
    integrationFetch: async (input, init) => {
      const url = String(input);

      if (url === "https://matrix.example/_matrix/client/v3/login" && (!init || init.method === "GET")) {
        return new Response(JSON.stringify({
          invalid: true
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(null, { status: 404 });
    },
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/matrix/start"
  });

  assert.equal(start.statusCode, 502);
  const payload = JSON.parse(start.body) as {
    error: {
      code: string;
    };
  };
  assert.equal(payload.error.code, "callback_failed");
});

test("matrix callback fails closed when login is denied by the provider", async (t) => {
  const app = createApp({
    env: createTestEnv(),
    matrixConfig: createTestMatrixConfig({
      enabled: true,
      ready: true,
      baseUrl: "https://matrix.example",
      homeserverUrl: "https://matrix.example"
    }),
    openRouter: createMockOpenRouterClient(),
    integrationFetch: async (input, init) => {
      const url = String(input);

      if (url === "https://matrix.example/_matrix/client/v3/login" && (!init || init.method === "GET")) {
        return new Response(JSON.stringify({
          flows: [{ type: "m.login.sso" }]
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(null, { status: 404 });
    },
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/matrix/start"
  });
  const sessionCookie = readSetCookie(start);
  const state = readMatrixStateFromStartLocation(String(start.headers.location ?? ""));

  assert.ok(sessionCookie);
  assert.ok(state);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/matrix/callback?state=${encodeURIComponent(state ?? "")}&error=access_denied`,
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  assert.equal(callback.statusCode, 502);
  const payload = JSON.parse(callback.body) as {
    error: {
      code: string;
    };
  };
  assert.equal(payload.error.code, "callback_failed");
});

test("matrix callback fails closed when login-token exchange is partial", async (t) => {
  const app = createApp({
    env: createTestEnv(),
    matrixConfig: createTestMatrixConfig({
      enabled: true,
      ready: true,
      baseUrl: "https://matrix.example",
      homeserverUrl: "https://matrix.example"
    }),
    openRouter: createMockOpenRouterClient(),
    integrationFetch: async (input, init) => {
      const url = String(input);

      if (url === "https://matrix.example/_matrix/client/v3/login" && (!init || init.method === "GET")) {
        return new Response(JSON.stringify({
          flows: [{ type: "m.login.sso" }]
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url === "https://matrix.example/_matrix/client/v3/login" && init?.method === "POST") {
        return new Response(JSON.stringify({
          access_token: "matrix_access_token"
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(null, { status: 404 });
    },
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/matrix/start"
  });
  const sessionCookie = readSetCookie(start);
  const state = readMatrixStateFromStartLocation(String(start.headers.location ?? ""));

  assert.equal(start.statusCode, 302);
  assert.ok(sessionCookie);
  assert.ok(state);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/matrix/callback?state=${encodeURIComponent(state ?? "")}&loginToken=partial_token`,
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  assert.equal(callback.statusCode, 502);
  const payload = JSON.parse(callback.body) as {
    error: {
      code: string;
    };
  };
  assert.equal(payload.error.code, "token_exchange_failed");
});

test("matrix callback maps invalid login token responses to login_token_invalid", async (t) => {
  const app = createApp({
    env: createTestEnv(),
    matrixConfig: createTestMatrixConfig({
      enabled: true,
      ready: true,
      baseUrl: "https://matrix.example",
      homeserverUrl: "https://matrix.example"
    }),
    openRouter: createMockOpenRouterClient(),
    integrationFetch: async (input, init) => {
      const url = String(input);

      if (url === "https://matrix.example/_matrix/client/v3/login" && (!init || init.method === "GET")) {
        return new Response(JSON.stringify({
          flows: [{ type: "m.login.sso" }]
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url === "https://matrix.example/_matrix/client/v3/login" && init?.method === "POST") {
        return new Response(JSON.stringify({
          errcode: "M_UNKNOWN_TOKEN",
          error: "Invalid login token"
        }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(null, { status: 404 });
    },
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/matrix/start"
  });
  const sessionCookie = readSetCookie(start);
  const state = readMatrixStateFromStartLocation(String(start.headers.location ?? ""));

  assert.ok(sessionCookie);
  assert.ok(state);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/matrix/callback?state=${encodeURIComponent(state ?? "")}&loginToken=invalid_token`,
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  assert.equal(callback.statusCode, 401);
  const payload = JSON.parse(callback.body) as {
    error: {
      code: string;
    };
  };
  assert.equal(payload.error.code, "login_token_invalid");
});

test("matrix callback maps expired login token responses to auth_expired", async (t) => {
  const app = createApp({
    env: createTestEnv(),
    matrixConfig: createTestMatrixConfig({
      enabled: true,
      ready: true,
      baseUrl: "https://matrix.example",
      homeserverUrl: "https://matrix.example"
    }),
    openRouter: createMockOpenRouterClient(),
    integrationFetch: async (input, init) => {
      const url = String(input);

      if (url === "https://matrix.example/_matrix/client/v3/login" && (!init || init.method === "GET")) {
        return new Response(JSON.stringify({
          flows: [{ type: "m.login.sso" }]
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url === "https://matrix.example/_matrix/client/v3/login" && init?.method === "POST") {
        return new Response(JSON.stringify({
          errcode: "M_LOGIN_TOKEN_EXPIRED",
          error: "Login token expired"
        }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(null, { status: 404 });
    },
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/matrix/start"
  });
  const sessionCookie = readSetCookie(start);
  const state = readMatrixStateFromStartLocation(String(start.headers.location ?? ""));

  assert.ok(sessionCookie);
  assert.ok(state);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/matrix/callback?state=${encodeURIComponent(state ?? "")}&loginToken=expired_token`,
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  assert.equal(callback.statusCode, 401);
  const payload = JSON.parse(callback.body) as {
    error: {
      code: string;
    };
  };
  assert.equal(payload.error.code, "auth_expired");
});

test("configured providers fail closed when credential encryption is unavailable", async (t) => {
  const app = createApp({
    env: createTestEnv({
      ...TEST_GITHUB_APP_ENV,
      GITHUB_ALLOWED_REPOS: ["acme/widget"],
      MOSAIC_STACK_SESSION_SECRET: "oauth-encryption-test-session-secret",
      INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY: "",
      INTEGRATION_AUTH_ENCRYPTION_PREVIOUS_KEYS: ""
    }),
    openRouter: createMockOpenRouterClient(),
    integrationFetch: createGitHubAppIntegrationFetch(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/github/start"
  });
  const sessionCookie = readSetCookie(start);
  const state = readGitHubStateFromAuthorizeLocation(String(start.headers.location ?? ""));

  assert.ok(sessionCookie);
  assert.ok(state);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(state ?? "")}&installation_id=${TEST_GITHUB_INSTALLATION_ID}`,
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  assert.equal(callback.statusCode, 503);
  const callbackPayload = JSON.parse(callback.body) as {
    error: {
      code: string;
    };
  };
  assert.equal(callbackPayload.error.code, "missing_server_config");

  const status = await app.inject({
    method: "GET",
    url: "/api/integrations/status",
    headers: {
      cookie: sessionCookie ?? ""
    }
  });
  const statusPayload = JSON.parse(status.body) as {
    github: {
      credentialSource: string;
      lastErrorCode: string | null;
    };
  };

  assert.equal(statusPayload.github.credentialSource, "not_connected");
  assert.equal(statusPayload.github.lastErrorCode, "missing_server_config");
});

test("matrix real credential callback fails closed when credential encryption is unavailable", async (t) => {
  const app = createApp({
    env: createTestEnv({
      MATRIX_LOGIN_TOKEN_TYPE: "m.login.token",
      MOSAIC_STACK_SESSION_SECRET: "matrix-encryption-test-session-secret",
      INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY: "",
      INTEGRATION_AUTH_ENCRYPTION_PREVIOUS_KEYS: ""
    }),
    matrixConfig: createTestMatrixConfig({
      enabled: true,
      ready: true,
      baseUrl: "https://matrix.example",
      homeserverUrl: "https://matrix.example"
    }),
    openRouter: createMockOpenRouterClient(),
    integrationFetch: async (input, init) => {
      const url = String(input);

      if (url === "https://matrix.example/_matrix/client/v3/login" && (!init || init.method === "GET")) {
        return new Response(JSON.stringify({
          flows: [{ type: "m.login.sso" }]
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url === "https://matrix.example/_matrix/client/v3/login" && init?.method === "POST") {
        return new Response(JSON.stringify({
          access_token: "matrix_access_token",
          user_id: "@user:matrix.example",
          device_id: "DEVICE"
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(null, { status: 404 });
    },
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/matrix/start"
  });
  const sessionCookie = readSetCookie(start);
  const state = readMatrixStateFromStartLocation(String(start.headers.location ?? ""));

  assert.ok(sessionCookie);
  assert.ok(state);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/matrix/callback?state=${encodeURIComponent(state ?? "")}&loginToken=real_login_token`,
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  assert.equal(callback.statusCode, 503);
  const payload = JSON.parse(callback.body) as {
    error: {
      code: string;
    };
  };
  assert.equal(payload.error.code, "missing_server_config");
});

test("github disconnect clears durable user credential without exposing tokens", async (t) => {
  const storePath = createTempStorePath();
  const app = createApp({
    env: createTestEnv({
      ...TEST_GITHUB_APP_ENV,
      GITHUB_ALLOWED_REPOS: ["acme/widget"],
      INTEGRATION_AUTH_STORE_MODE: "file",
      INTEGRATION_AUTH_STORE_FILE_PATH: storePath,
      ...TEST_ENCRYPTION_KEY
    }),
    openRouter: createMockOpenRouterClient(),
    integrationFetch: createGitHubAppIntegrationFetch(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/github/start"
  });
  const sessionCookie = readSetCookie(start);
  const state = readGitHubStateFromAuthorizeLocation(String(start.headers.location ?? ""));

  assert.ok(sessionCookie);
  assert.ok(state);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(state ?? "")}&installation_id=${TEST_GITHUB_INSTALLATION_ID}`,
    headers: {
      cookie: sessionCookie ?? ""
    }
  });
  assert.equal(callback.statusCode, 302);
  assert.doesNotMatch(fs.readFileSync(storePath, "utf8"), /gho_durable_disconnect_token/);

  const disconnect = await app.inject({
    method: "POST",
    url: "/api/auth/github/disconnect",
    headers: {
      cookie: sessionCookie ?? ""
    }
  });
  assert.equal(disconnect.statusCode, 200);

  const snapshot = JSON.parse(fs.readFileSync(storePath, "utf8")) as {
    credentials: Array<{
      providers: Record<string, unknown>;
    }>;
  };
  assert.equal(snapshot.credentials.some((entry) => "github" in entry.providers), false);
});

test("matrix disconnect clears durable user credential without exposing tokens", async (t) => {
  const storePath = createTempStorePath();
  const app = createApp({
    env: createTestEnv({
      MATRIX_LOGIN_TOKEN_TYPE: "m.login.token",
      INTEGRATION_AUTH_STORE_MODE: "file",
      INTEGRATION_AUTH_STORE_FILE_PATH: storePath,
      ...TEST_ENCRYPTION_KEY
    }),
    matrixConfig: createTestMatrixConfig({
      enabled: true,
      ready: true,
      baseUrl: "https://matrix.example",
      homeserverUrl: "https://matrix.example"
    }),
    openRouter: createMockOpenRouterClient(),
    integrationFetch: async (input, init) => {
      const url = String(input);

      if (url === "https://matrix.example/_matrix/client/v3/login" && (!init || init.method === "GET")) {
        return new Response(JSON.stringify({
          flows: [{ type: "m.login.sso" }]
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url === "https://matrix.example/_matrix/client/v3/login" && init?.method === "POST") {
        return new Response(JSON.stringify({
          access_token: "matrix_durable_disconnect_token",
          user_id: "@user:matrix.example",
          device_id: "DEVICE"
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(null, { status: 404 });
    },
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const start = await app.inject({
    method: "GET",
    url: "/api/auth/matrix/start"
  });
  const sessionCookie = readSetCookie(start);
  const state = readMatrixStateFromStartLocation(String(start.headers.location ?? ""));

  assert.ok(sessionCookie);
  assert.ok(state);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/matrix/callback?state=${encodeURIComponent(state ?? "")}&loginToken=real_login_token`,
    headers: {
      cookie: sessionCookie ?? ""
    }
  });
  assert.equal(callback.statusCode, 302);
  assert.doesNotMatch(fs.readFileSync(storePath, "utf8"), /matrix_durable_disconnect_token/);

  const disconnect = await app.inject({
    method: "POST",
    url: "/api/auth/matrix/disconnect",
    headers: {
      cookie: sessionCookie ?? ""
    }
  });
  assert.equal(disconnect.statusCode, 200);

  const snapshot = JSON.parse(fs.readFileSync(storePath, "utf8")) as {
    credentials: Array<{
      providers: Record<string, unknown>;
    }>;
  };
  assert.equal(snapshot.credentials.some((entry) => "matrix" in entry.providers), false);
});
