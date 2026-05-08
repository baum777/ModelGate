import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";
import { createMockOpenRouterClient, createTestEnv } from "../test-support/helpers.js";

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
const TEST_ALLOWED_REPO = "acme/widget";
const TEST_GITHUB_APP_ENV = {
  GITHUB_APP_ID: TEST_GITHUB_APP_ID,
  GITHUB_APP_PRIVATE_KEY: TEST_GITHUB_APP_PRIVATE_KEY,
  GITHUB_APP_SLUG: TEST_GITHUB_APP_SLUG,
  GITHUB_ALLOWED_REPOS: [TEST_ALLOWED_REPO]
};

function createTempStorePath() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mosaicstacked-integration-auth-rotation-"));
  return path.join(directory, "integration-auth-store.json");
}

function makeJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function createGitHubAppIntegrationFetch(options: {
  installationId?: string;
  accountLogin?: string;
  repos?: string[];
  getInstallationToken?: () => string;
} = {}) {
  const installationId = options.installationId ?? TEST_GITHUB_INSTALLATION_ID;
  const accountLogin = options.accountLogin ?? "octocat";
  const repos = options.repos ?? [TEST_ALLOWED_REPO];

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";

    if (url.pathname === `/app/installations/${installationId}` && method === "GET") {
      return makeJsonResponse({
        id: Number.parseInt(installationId, 10),
        account: {
          login: accountLogin,
          type: "Organization",
          id: 1
        }
      });
    }

    if (url.pathname === `/app/installations/${installationId}/access_tokens` && method === "POST") {
      return makeJsonResponse({
        token: options.getInstallationToken?.() ?? "ghs_rotation_token",
        expires_at: "2030-01-01T00:00:00Z"
      });
    }

    if (url.pathname === "/installation/repositories" && method === "GET") {
      return makeJsonResponse({
        total_count: repos.length,
        repositories: repos.map((fullName, index) => ({
          id: index + 1,
          full_name: fullName
        }))
      });
    }

    return new Response(null, { status: 404 });
  };
}

function readSetCookie(response: { headers: Record<string, unknown> }) {
  const header = response.headers["set-cookie"];

  if (Array.isArray(header)) {
    return header[0] ?? null;
  }

  return typeof header === "string" ? header : null;
}

function readCookieValue(cookieHeader: string, key: string) {
  for (const segment of cookieHeader.split(";")) {
    const trimmed = segment.trim();

    if (!trimmed.startsWith(`${key}=`)) {
      continue;
    }

    return decodeURIComponent(trimmed.slice(key.length + 1));
  }

  return null;
}

function readGitHubStateFromAuthorizeLocation(location: string) {
  return new URL(location).searchParams.get("state");
}

test("next gate: integration auth key rotation supports restart reverify and key migration on reconnect", async (t) => {
  const storePath = createTempStorePath();
  const baseEnv = {
    ...TEST_GITHUB_APP_ENV,
    INTEGRATION_AUTH_STORE_MODE: "file" as const,
    INTEGRATION_AUTH_STORE_FILE_PATH: storePath,
    MOSAIC_STACK_SESSION_SECRET: "rotation-test-session-secret"
  };

  let activeInstallationToken = "ghs_rotation_v1";
  const fetchImpl = createGitHubAppIntegrationFetch({
    getInstallationToken: () => activeInstallationToken
  });

  const appV1 = createApp({
    env: createTestEnv({
      ...baseEnv,
      INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY_ID: "integration-auth-v1",
      INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY_VERSION: "1",
      INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY: "integration-auth-secret-v1",
      INTEGRATION_AUTH_ENCRYPTION_PREVIOUS_KEYS: ""
    }),
    openRouter: createMockOpenRouterClient(),
    integrationFetch: fetchImpl,
    logger: false
  });

  const startV1 = await appV1.inject({
    method: "GET",
    url: "/api/auth/github/start"
  });
  const sessionCookie = readSetCookie(startV1);
  const stateV1 = readGitHubStateFromAuthorizeLocation(String(startV1.headers.location ?? ""));

  assert.equal(startV1.statusCode, 302);
  assert.ok(sessionCookie);
  assert.ok(stateV1);

  const callbackV1 = await appV1.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(stateV1 ?? "")}&installation_id=${TEST_GITHUB_INSTALLATION_ID}`,
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  assert.equal(callbackV1.statusCode, 302);
  await appV1.close();

  activeInstallationToken = "ghs_rotation_v2";

  const appV2 = createApp({
    env: createTestEnv({
      ...baseEnv,
      INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY_ID: "integration-auth-v2",
      INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY_VERSION: "2",
      INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY: "integration-auth-secret-v2",
      INTEGRATION_AUTH_ENCRYPTION_PREVIOUS_KEYS: "integration-auth-v1@1:integration-auth-secret-v1"
    }),
    openRouter: createMockOpenRouterClient(),
    integrationFetch: fetchImpl,
    logger: false
  });

  t.after(async () => {
    await appV2.close();
  });

  const statusAfterRestart = await appV2.inject({
    method: "GET",
    url: "/api/integrations/status",
    headers: {
      cookie: sessionCookie ?? ""
    }
  });
  const statusPayload = JSON.parse(statusAfterRestart.body) as {
    github: {
      status: string;
      authState: string;
      credentialSource: string;
    };
  };

  assert.equal(statusPayload.github.status, "connected");
  assert.equal(statusPayload.github.authState, "user_connected");
  assert.equal(statusPayload.github.credentialSource, "user_connected");

  const reverify = await appV2.inject({
    method: "POST",
    url: "/api/auth/github/reverify",
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  assert.equal(reverify.statusCode, 200);

  const startV2 = await appV2.inject({
    method: "GET",
    url: "/api/auth/github/start",
    headers: {
      cookie: sessionCookie ?? ""
    }
  });
  const stateV2 = readGitHubStateFromAuthorizeLocation(String(startV2.headers.location ?? ""));
  assert.ok(stateV2);

  const callbackV2 = await appV2.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(stateV2 ?? "")}&installation_id=${TEST_GITHUB_INSTALLATION_ID}&setup_action=update`,
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  assert.equal(callbackV2.statusCode, 302);

  const sessionId = readCookieValue(sessionCookie ?? "", "mosaicstacked_integration_session");
  assert.ok(sessionId);

  const snapshot = JSON.parse(fs.readFileSync(storePath, "utf8")) as {
    credentials: Array<{
      sessionId: string;
      providers: {
        github?: {
          keyId: string;
          keyVersion: number;
        };
      };
    }>;
  };
  const githubEnvelope = snapshot.credentials
    .find((entry) => entry.sessionId === sessionId)
    ?.providers.github;

  assert.equal(githubEnvelope?.keyId, "integration-auth-v2");
  assert.equal(githubEnvelope?.keyVersion, 2);
});

test("next gate: missing previous key config fails closed after rotation", async (t) => {
  const storePath = createTempStorePath();
  const baseEnv = {
    ...TEST_GITHUB_APP_ENV,
    INTEGRATION_AUTH_STORE_MODE: "file" as const,
    INTEGRATION_AUTH_STORE_FILE_PATH: storePath,
    MOSAIC_STACK_SESSION_SECRET: "rotation-test-session-secret"
  };

  const fetchImpl = createGitHubAppIntegrationFetch();

  const appV1 = createApp({
    env: createTestEnv({
      ...baseEnv,
      INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY_ID: "integration-auth-v1",
      INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY_VERSION: "1",
      INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY: "integration-auth-secret-v1",
      INTEGRATION_AUTH_ENCRYPTION_PREVIOUS_KEYS: ""
    }),
    openRouter: createMockOpenRouterClient(),
    integrationFetch: fetchImpl,
    logger: false
  });

  const startV1 = await appV1.inject({
    method: "GET",
    url: "/api/auth/github/start"
  });
  const sessionCookie = readSetCookie(startV1);
  const stateV1 = readGitHubStateFromAuthorizeLocation(String(startV1.headers.location ?? ""));

  assert.ok(sessionCookie);
  assert.ok(stateV1);

  await appV1.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(stateV1 ?? "")}&installation_id=${TEST_GITHUB_INSTALLATION_ID}`,
    headers: {
      cookie: sessionCookie ?? ""
    }
  });
  await appV1.close();

  const appV2MissingPrevious = createApp({
    env: createTestEnv({
      ...baseEnv,
      INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY_ID: "integration-auth-v2",
      INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY_VERSION: "2",
      INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY: "integration-auth-secret-v2",
      INTEGRATION_AUTH_ENCRYPTION_PREVIOUS_KEYS: ""
    }),
    openRouter: createMockOpenRouterClient(),
    integrationFetch: fetchImpl,
    logger: false
  });

  t.after(async () => {
    await appV2MissingPrevious.close();
  });

  const reverify = await appV2MissingPrevious.inject({
    method: "POST",
    url: "/api/auth/github/reverify",
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  assert.equal(reverify.statusCode, 401);
  const payload = JSON.parse(reverify.body) as {
    error: {
      code: string;
    };
  };

  assert.equal(payload.error.code, "auth_expired");
});
