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

function createTempStorePath() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mosaicstack-integration-auth-routes-"));
  return path.join(directory, "integration-auth-store.json");
}

function readSetCookie(response: { headers: Record<string, unknown> }) {
  const header = response.headers["set-cookie"];

  if (Array.isArray(header)) {
    return header[0] ?? null;
  }

  return typeof header === "string" ? header : null;
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
    url: "/api/auth/github/callback?state=invalid-state&code=stub_code"
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

test("github start fails closed when OAuth is not configured instead of using a stub callback", async (t) => {
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
    "Missing GitHub OAuth server config: GITHUB_OAUTH_CLIENT_ID, GITHUB_OAUTH_CLIENT_SECRET"
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
    "GITHUB_OAUTH_CLIENT_ID",
    "GITHUB_OAUTH_CLIENT_SECRET"
  ]);
  assert.equal(payload.github.lastVerifiedAt, null);
});

test("integrations status reports workspace requirements when GitHub OAuth is ready but workspace config is missing", async (t) => {
  const app = createApp({
    env: createTestEnv({
      GITHUB_OAUTH_CLIENT_ID: "github-client-id",
      GITHUB_OAUTH_CLIENT_SECRET: "github-client-secret"
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

  assert.equal(payload.github.status, "missing_server_config");
  assert.deepEqual(payload.github.requirements, ["GITHUB_TOKEN", "GITHUB_ALLOWED_REPOS"]);
});

test("github auth status endpoint only exposes safe metadata", async (t) => {
  const app = createApp({
    env: createTestEnv({
      GITHUB_OAUTH_CLIENT_ID: "github-client-id",
      GITHUB_OAUTH_CLIENT_SECRET: "github-client-secret",
      GITHUB_OAUTH_CALLBACK_URL: "http://127.0.0.1:8787/api/auth/github/callback",
      MOSAIC_STACK_SESSION_SECRET: "status-session-secret",
      ...TEST_ENCRYPTION_KEY
    }),
    openRouter: createMockOpenRouterClient(),
    integrationFetch: async (input) => {
      const url = String(input);

      if (url.startsWith("https://github.com/login/oauth/access_token")) {
        return new Response(JSON.stringify({
          access_token: "gho_status_redaction_token",
          token_type: "bearer",
          scope: "read:user,user:email"
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
  const state = readGitHubStateFromAuthorizeLocation(String(start.headers.location ?? ""));

  assert.ok(sessionCookie);
  assert.ok(state);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(state ?? "")}&code=status_code`,
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
  assert.equal(payload.identity, "octocat");
  assert.equal(payload.credentialSource, "user_connected");
  assert.ok(payload.lastVerifiedAt);
  assert.equal(payload.lastErrorCode, null);
  assert.doesNotMatch(status.body, /gho_status_redaction_token/);
  assert.doesNotMatch(status.body, /github-client-secret/);
});

test("disconnect removes user OAuth connection but keeps instance-level status when instance config exists", async (t) => {
  const app = createApp({
    env: createTestEnv({
      GITHUB_TOKEN: "instance-github-token",
      GITHUB_ALLOWED_REPOS: ["octo/demo"],
      GITHUB_AGENT_API_KEY: "instance-admin-key",
      GITHUB_OAUTH_CLIENT_ID: "github-client-id",
      GITHUB_OAUTH_CLIENT_SECRET: "github-client-secret",
      MOSAIC_STACK_SESSION_SECRET: "disconnect-session-secret",
      ...TEST_ENCRYPTION_KEY
    }),
    openRouter: createMockOpenRouterClient(),
    integrationFetch: async (input) => {
      const url = String(input);

      if (url.startsWith("https://github.com/login/oauth/access_token")) {
        return new Response(JSON.stringify({
          access_token: "gho_disconnect_test_token",
          token_type: "bearer",
          scope: "read:user,user:email"
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

  assert.ok(sessionCookie);

  const state = readGitHubStateFromAuthorizeLocation(String(start.headers.location ?? ""));
  assert.ok(state);

  await app.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(state ?? "")}&code=disconnect_code`,
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
      GITHUB_OAUTH_CLIENT_ID: "github-client-id",
      GITHUB_OAUTH_CLIENT_SECRET: "github-client-secret",
      MOSAIC_STACK_SESSION_SECRET: "logout-session-secret",
      ...TEST_ENCRYPTION_KEY
    }),
    openRouter: createMockOpenRouterClient(),
    integrationFetch: async (input) => {
      const url = String(input);

      if (url.startsWith("https://github.com/login/oauth/access_token")) {
        return new Response(JSON.stringify({
          access_token: "gho_logout_test_token",
          token_type: "bearer",
          scope: "read:user,user:email"
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

  assert.ok(sessionCookie);
  const state = readGitHubStateFromAuthorizeLocation(String(start.headers.location ?? ""));
  assert.ok(state);

  await app.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(state ?? "")}&code=logout_code`,
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

test("real GitHub OAuth callback stores a user-connected credential source", async (t) => {
  const env = createTestEnv({
    GITHUB_OAUTH_CLIENT_ID: "github-client-id",
    GITHUB_OAUTH_CLIENT_SECRET: "github-client-secret",
    MOSAIC_STACK_SESSION_SECRET: "real-oauth-session-secret",
    ...TEST_ENCRYPTION_KEY
  });

  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient(),
    integrationFetch: async (input) => {
      const url = String(input);

      if (url.startsWith("https://github.com/login/oauth/access_token")) {
        return new Response(JSON.stringify({
          access_token: "gho_test_access_token",
          token_type: "bearer",
          scope: "read:user,user:email"
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

  assert.equal(start.statusCode, 302);
  const location = String(start.headers.location ?? "");
  const sessionCookie = readSetCookie(start);
  assert.ok(location.startsWith("https://github.com/login/oauth/authorize"));
  assert.ok(sessionCookie);
  const locationUrl = new URL(location);
  const state = locationUrl.searchParams.get("state");
  assert.ok(state);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(state ?? "")}&code=real_code`,
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
  assert.equal(payload.github.labels.identity, "octocat");
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
    GITHUB_OAUTH_CLIENT_ID: "github-client-id",
    GITHUB_OAUTH_CLIENT_SECRET: "github-client-secret",
    MOSAIC_STACK_SESSION_SECRET: "github-reverify-session-secret",
    ...TEST_ENCRYPTION_KEY
  });

  let userCalls = 0;
  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient(),
    integrationFetch: async (input) => {
      const url = String(input);

      if (url.startsWith("https://github.com/login/oauth/access_token")) {
        return new Response(JSON.stringify({
          access_token: "gho_test_access_token",
          token_type: "bearer",
          scope: "read:user,user:email"
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url === "https://api.github.com/user") {
        userCalls += 1;

        if (userCalls === 1) {
          return new Response(JSON.stringify({
            login: "octocat"
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
    url: `/api/auth/github/callback?state=${encodeURIComponent(state ?? "")}&code=real_code`,
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

test("github callback fails closed when OAuth is denied by the provider", async (t) => {
  const app = createApp({
    env: createTestEnv({
      GITHUB_OAUTH_CLIENT_ID: "github-client-id",
      GITHUB_OAUTH_CLIENT_SECRET: "github-client-secret"
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

test("github start fails closed when OAuth config is partial instead of falling back to stub", async (t) => {
  const app = createApp({
    env: createTestEnv({
      GITHUB_OAUTH_CLIENT_ID: "github-client-id",
      GITHUB_OAUTH_CLIENT_SECRET: ""
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

test("github start fails closed when OAuth callback URL is missing", async (t) => {
  const app = createApp({
    env: createTestEnv({
      GITHUB_OAUTH_CLIENT_ID: "github-client-id",
      GITHUB_OAUTH_CLIENT_SECRET: "github-client-secret",
      GITHUB_OAUTH_CALLBACK_URL: ""
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

test("github start fails closed when session secret is missing in OAuth mode", async (t) => {
  const app = createApp({
    env: createTestEnv({
      GITHUB_OAUTH_CLIENT_ID: "github-client-id",
      GITHUB_OAUTH_CLIENT_SECRET: "github-client-secret",
      GITHUB_OAUTH_CALLBACK_URL: "http://127.0.0.1:8787/api/auth/github/callback",
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

test("github callback fails closed when OAuth code is missing in real credential mode", async (t) => {
  const app = createApp({
    env: createTestEnv({
      GITHUB_OAUTH_CLIENT_ID: "github-client-id",
      GITHUB_OAUTH_CLIENT_SECRET: "github-client-secret",
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

test("github callback fails closed when oauth code exchange is invalid", async (t) => {
  const app = createApp({
    env: createTestEnv({
      GITHUB_OAUTH_CLIENT_ID: "github-client-id",
      GITHUB_OAUTH_CLIENT_SECRET: "github-client-secret"
    }),
    openRouter: createMockOpenRouterClient(),
    integrationFetch: async (input) => {
      const url = String(input);

      if (url.startsWith("https://github.com/login/oauth/access_token")) {
        return new Response(JSON.stringify({
          error: "bad_verification_code"
        }), {
          status: 400,
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
  const state = readGitHubStateFromAuthorizeLocation(String(start.headers.location ?? ""));

  assert.ok(sessionCookie);
  assert.ok(state);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(state ?? "")}&code=invalid_code`,
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

test("github callback fails closed when required oauth scopes are missing", async (t) => {
  let userLookupCalls = 0;
  const app = createApp({
    env: createTestEnv({
      GITHUB_OAUTH_CLIENT_ID: "github-client-id",
      GITHUB_OAUTH_CLIENT_SECRET: "github-client-secret",
      GITHUB_OAUTH_SCOPES: ["repo", "read:user"]
    }),
    openRouter: createMockOpenRouterClient(),
    integrationFetch: async (input) => {
      const url = String(input);

      if (url.startsWith("https://github.com/login/oauth/access_token")) {
        return new Response(JSON.stringify({
          access_token: "gho_test_access_token",
          token_type: "bearer",
          scope: "read:user"
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url === "https://api.github.com/user") {
        userLookupCalls += 1;
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
  const state = readGitHubStateFromAuthorizeLocation(String(start.headers.location ?? ""));

  assert.ok(sessionCookie);
  assert.ok(state);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(state ?? "")}&code=real_code`,
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
  assert.equal(userLookupCalls, 0);
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
      GITHUB_OAUTH_CLIENT_ID: "github-client-id",
      GITHUB_OAUTH_CLIENT_SECRET: "github-client-secret",
      MOSAIC_STACK_SESSION_SECRET: "oauth-encryption-test-session-secret",
      INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY: "",
      INTEGRATION_AUTH_ENCRYPTION_PREVIOUS_KEYS: ""
    }),
    openRouter: createMockOpenRouterClient(),
    integrationFetch: async (input) => {
      const url = String(input);

      if (url.startsWith("https://github.com/login/oauth/access_token")) {
        return new Response(JSON.stringify({
          access_token: "gho_test_access_token",
          token_type: "bearer",
          scope: "read:user,user:email"
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
  const state = readGitHubStateFromAuthorizeLocation(String(start.headers.location ?? ""));

  assert.ok(sessionCookie);
  assert.ok(state);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(state ?? "")}&code=real_code`,
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
      GITHUB_OAUTH_CLIENT_ID: "github-client-id",
      GITHUB_OAUTH_CLIENT_SECRET: "github-client-secret",
      INTEGRATION_AUTH_STORE_MODE: "file",
      INTEGRATION_AUTH_STORE_FILE_PATH: storePath,
      ...TEST_ENCRYPTION_KEY
    }),
    openRouter: createMockOpenRouterClient(),
    integrationFetch: async (input) => {
      const url = String(input);

      if (url.startsWith("https://github.com/login/oauth/access_token")) {
        return new Response(JSON.stringify({
          access_token: "gho_durable_disconnect_token",
          token_type: "bearer",
          scope: "read:user,user:email"
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
  const state = readGitHubStateFromAuthorizeLocation(String(start.headers.location ?? ""));

  assert.ok(sessionCookie);
  assert.ok(state);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(state ?? "")}&code=real_code`,
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
