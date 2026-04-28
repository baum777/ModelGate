import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";
import { createMockOpenRouterClient, createTestEnv } from "../test-support/helpers.js";

function createTempStorePath() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "modelgate-integration-auth-rotation-"));
  return path.join(directory, "integration-auth-store.json");
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
    GITHUB_OAUTH_CLIENT_ID: "github-client-id",
    GITHUB_OAUTH_CLIENT_SECRET: "github-client-secret",
    INTEGRATION_AUTH_STORE_MODE: "file" as const,
    INTEGRATION_AUTH_STORE_FILE_PATH: storePath,
    MODEL_GATE_SESSION_SECRET: ""
  };

  let activeAccessToken = "gho_rotation_v1";
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);

    if (url.startsWith("https://github.com/login/oauth/access_token")) {
      return new Response(JSON.stringify({
        access_token: activeAccessToken,
        token_type: "bearer",
        scope: "repo,read:user"
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url === "https://api.github.com/user") {
      return new Response(JSON.stringify({
        login: "octocat"
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(null, { status: 404 });
  };

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
    url: `/api/auth/github/callback?state=${encodeURIComponent(stateV1 ?? "")}&code=rotation_code_v1`,
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  assert.equal(callbackV1.statusCode, 302);
  await appV1.close();

  activeAccessToken = "gho_rotation_v2";

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
    url: `/api/auth/github/callback?state=${encodeURIComponent(stateV2 ?? "")}&code=rotation_code_v2`,
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  assert.equal(callbackV2.statusCode, 302);

  const sessionId = readCookieValue(sessionCookie ?? "", "modelgate_integration_session");
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
    GITHUB_OAUTH_CLIENT_ID: "github-client-id",
    GITHUB_OAUTH_CLIENT_SECRET: "github-client-secret",
    INTEGRATION_AUTH_STORE_MODE: "file" as const,
    INTEGRATION_AUTH_STORE_FILE_PATH: storePath,
    MODEL_GATE_SESSION_SECRET: ""
  };

  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);

    if (url.startsWith("https://github.com/login/oauth/access_token")) {
      return new Response(JSON.stringify({
        access_token: "gho_rotation_v1",
        token_type: "bearer",
        scope: "repo,read:user"
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url === "https://api.github.com/user") {
      return new Response(JSON.stringify({
        login: "octocat"
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(null, { status: 404 });
  };

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
    url: `/api/auth/github/callback?state=${encodeURIComponent(stateV1 ?? "")}&code=rotation_code_v1`,
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
