import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import { createGitHubClient } from "../src/lib/github-client.js";
import { createIntegrationAuthStore } from "../src/lib/integration-auth-store.js";
import { createTestEnv, createMockOpenRouterClient, createTestGitHubConfig, createTestSessionCookie } from "../test-support/helpers.js";

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

const TEST_GITHUB_APP_SLUG = "mosaicstacked-test-app";
const TEST_USER_INSTALLATION_ID = 12345;
const TEST_INSTANCE_INSTALLATION_ID = 67890;

function createGitHubAppIntegrationFetch(options: {
  userToken?: string;
  instanceToken?: string;
} = {}) {
  const userToken = options.userToken ?? "ghs_user_installation_token";
  const instanceToken = options.instanceToken ?? "ghs_instance_installation_token";

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";

    if (url.pathname === `/app/installations/${TEST_USER_INSTALLATION_ID}` && method === "GET") {
      return makeJsonResponse({
        id: TEST_USER_INSTALLATION_ID,
        account: {
          login: "octocat",
          type: "Organization",
          id: 1
        }
      });
    }

    if (url.pathname === `/app/installations/${TEST_USER_INSTALLATION_ID}/access_tokens` && method === "POST") {
      return makeJsonResponse({
        token: userToken,
        expires_at: "2030-01-01T00:00:00Z"
      });
    }

    if (url.pathname === `/app/installations/${TEST_INSTANCE_INSTALLATION_ID}/access_tokens` && method === "POST") {
      return makeJsonResponse({
        token: instanceToken,
        expires_at: "2030-01-01T00:00:00Z"
      });
    }

    if (url.pathname === "/installation/repositories" && method === "GET") {
      return makeJsonResponse({
        total_count: 1,
        repositories: [{ id: 1, full_name: "acme/widget" }]
      });
    }

    return new Response(null, { status: 404 });
  };
}

function makeJsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers
    }
  });
}

const TEST_SESSION_COOKIE = createTestSessionCookie();

test("github routes return not configured when the feature is disabled", async (t) => {
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
    url: "/api/github/repos",
    headers: {
      cookie: TEST_SESSION_COOKIE
    }
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(JSON.parse(response.body), {
    ok: false,
    error: {
      code: "github_not_configured",
      message: "GitHub backend is not configured"
    }
  });
});

test("github routes derive user-connected repository scope from GitHub App installation", async (t) => {
  const githubConfig = createTestGitHubConfig({
    appPrivateKey: TEST_GITHUB_APP_PRIVATE_KEY,
    appSlug: TEST_GITHUB_APP_SLUG,
    allowedRepos: [],
    allowedRepoSet: new Set(),
    instanceReady: false,
    installationId: null,
    installationTokenOverride: null
  });
  const authStore = createIntegrationAuthStore({
    mode: "memory",
    currentEncryptionKey: {
      keyId: "test-key",
      keyVersion: 1,
      keyMaterial: "test-integration-key"
    }
  });
  const session = authStore.ensureSession(null);

  assert.equal(authStore.storeCredential(session.sessionId, "github", {
    kind: "github_app_installation",
    installationId: String(TEST_USER_INSTALLATION_ID),
    accountLogin: "octocat",
    connectedAt: "2026-05-12T00:00:00.000Z"
  }), true);
  authStore.markConnected({
    provider: "github",
    sessionId: session.sessionId,
    safeIdentityLabel: "octocat",
    source: "user_connected"
  });

  const githubClient = createGitHubClient({
    config: githubConfig,
    fetchImpl: async (input, init) => {
      const url = new URL(String(input));
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer ghs_user_installation_token");

      if (url.pathname === "/repos/acme/widget") {
        return makeJsonResponse({
          full_name: "acme/widget",
          name: "widget",
          default_branch: "main",
          description: "Widget repo",
          private: false,
          archived: false,
          disabled: false,
          permissions: {
            push: true
          },
          owner: {
            login: "acme"
          }
        });
      }

      if (url.pathname === "/repos/acme/widget/commits/main") {
        return makeJsonResponse({
          sha: "commit-sha",
          commit: {
            tree: {
              sha: "tree-sha"
            }
          }
        });
      }

      throw new Error(`unexpected path: ${url.pathname}${url.search}`);
    }
  });

  const app = createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient(),
    githubConfig,
    githubClient,
    integrationAuthStore: authStore,
    integrationFetch: createGitHubAppIntegrationFetch(),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/github/repos",
    headers: {
      cookie: `mosaicstacked_integration_session=${encodeURIComponent(session.sessionId)}`
    }
  });

  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body) as {
    ok: true;
    repos: Array<{ fullName: string }>;
    credentialSource: string;
  };

  assert.equal(payload.credentialSource, "user_connected");
  assert.deepEqual(payload.repos.map((repo) => repo.fullName), ["acme/widget"]);
});

test("github routes return repository summaries and file context from the backend client", async (t) => {
  const githubConfig = createTestGitHubConfig({
    allowedRepos: ["acme/widget"],
    allowedRepoSet: new Set(["acme/widget"])
  });

  const fetchCalls: string[] = [];
  const githubClient = createGitHubClient({
    config: githubConfig,
    fetchImpl: async (input, init) => {
      const url = new URL(String(input));
      fetchCalls.push(`${url.pathname}${url.search}`);
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-github-token");

      if (url.pathname === "/repos/acme/widget") {
        return makeJsonResponse({
          full_name: "acme/widget",
          name: "widget",
          default_branch: "main",
          description: "Widget repo",
          private: false,
          archived: false,
          disabled: false,
          permissions: {
            push: true
          },
          owner: {
            login: "acme"
          }
        });
      }

      if (url.pathname === "/repos/acme/widget/commits/main") {
        return makeJsonResponse({
          sha: "commit-sha",
          commit: {
            tree: {
              sha: "tree-sha"
            }
          }
        });
      }

      if (url.pathname === "/repos/acme/widget/git/trees/tree-sha") {
        assert.equal(url.searchParams.get("recursive"), "1");
        return makeJsonResponse({
          sha: "tree-sha",
          truncated: false,
          tree: [
            {
              path: "src",
              type: "tree",
              sha: "tree-src",
              size: 0,
              mode: "040000"
            },
            {
              path: "src/index.ts",
              type: "blob",
              sha: "blob-index",
              size: 42,
              mode: "100644"
            }
          ]
        });
      }

      if (url.pathname === "/repos/acme/widget/contents/src/index.ts") {
        assert.equal(url.searchParams.get("ref"), "main");
        return makeJsonResponse({
          type: "file",
          path: "src/index.ts",
          sha: "blob-index",
          size: 24,
          encoding: "base64",
          content: Buffer.from("export const value = 1;\n").toString("base64")
        });
      }

      throw new Error(`unexpected path: ${url.pathname}${url.search}`);
    }
  });

  const app = createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient(),
    githubConfig,
    githubClient,
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const reposResponse = await app.inject({
    method: "GET",
    url: "/api/github/repos",
    headers: {
      cookie: TEST_SESSION_COOKIE
    }
  });

  assert.equal(reposResponse.statusCode, 200);
  const reposBody = JSON.parse(reposResponse.body) as {
    ok: true;
    checkedAt: string;
    credentialSource: string;
    repos: Array<{ fullName: string; status: string; defaultBranchSha: string | null }>;
  };
  assert.equal(reposBody.ok, true);
  assert.equal(reposBody.credentialSource, "instance_config");
  assert.match(reposBody.checkedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(reposBody.repos.length, 1);
  assert.equal(reposBody.repos[0]?.fullName, "acme/widget");
  assert.equal(reposBody.repos[0]?.status, "ready");
  assert.equal(reposBody.repos[0]?.defaultBranchSha, "commit-sha");

  const treeResponse = await app.inject({
    method: "GET",
    url: "/api/github/repos/acme/widget/tree?ref=main&path=src&depth=1&maxEntries=10",
    headers: {
      cookie: TEST_SESSION_COOKIE
    }
  });

  assert.equal(treeResponse.statusCode, 200);
  const treeBody = JSON.parse(treeResponse.body) as {
    ok: true;
    credentialSource: string;
    tree: { rootPath: string; entries: Array<{ path: string }> };
  };
  assert.equal(treeBody.ok, true);
  assert.equal(treeBody.credentialSource, "instance_config");
  assert.equal(treeBody.tree.rootPath, "src");
  assert.deepEqual(treeBody.tree.entries.map((entry) => entry.path), [
    "src",
    "src/index.ts"
  ]);

  const fileResponse = await app.inject({
    method: "GET",
    url: "/api/github/repos/acme/widget/file?path=src/index.ts&ref=main",
    headers: {
      cookie: TEST_SESSION_COOKIE
    }
  });

  assert.equal(fileResponse.statusCode, 200);
  const fileBody = JSON.parse(fileResponse.body) as {
    ok: true;
    credentialSource: string;
    file: { path: string; content: string; encoding: string; binary: boolean; truncated: boolean };
  };
  assert.equal(fileBody.ok, true);
  assert.equal(fileBody.credentialSource, "instance_config");
  assert.equal(fileBody.file.path, "src/index.ts");
  assert.equal(fileBody.file.encoding, "utf-8");
  assert.equal(fileBody.file.binary, false);
  assert.equal(fileBody.file.truncated, false);
  assert.equal(fileBody.file.content, "export const value = 1;\n");

  assert.deepEqual(fetchCalls, [
    "/repos/acme/widget",
    "/repos/acme/widget/commits/main",
    "/repos/acme/widget/commits/main",
    "/repos/acme/widget/git/trees/tree-sha?recursive=1",
    "/repos/acme/widget/contents/src/index.ts?ref=main"
  ]);
});

test("github routes fail closed for invalid paths and repos outside the allowlist", async (t) => {
  let fetchCount = 0;
  const githubConfig = createTestGitHubConfig({
    allowedRepos: ["acme/widget"],
    allowedRepoSet: new Set(["acme/widget"])
  });
  const githubClient = createGitHubClient({
    config: githubConfig,
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error("upstream should not be called for invalid inputs");
    }
  });

  const app = createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient(),
    githubConfig,
    githubClient,
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const invalidPathResponse = await app.inject({
    method: "GET",
    url: "/api/github/repos/acme/widget/file?path=../secret&ref=main",
    headers: {
      cookie: TEST_SESSION_COOKIE
    }
  });

  assert.equal(invalidPathResponse.statusCode, 400);
  assert.deepEqual(JSON.parse(invalidPathResponse.body), {
    ok: false,
    error: {
      code: "invalid_request",
      message: "Invalid GitHub request"
    }
  });

  const treeResponse = await app.inject({
    method: "GET",
    url: "/api/github/repos/acme/widget/tree?path=../secret",
    headers: {
      cookie: TEST_SESSION_COOKIE
    }
  });

  assert.equal(treeResponse.statusCode, 400);
  assert.deepEqual(JSON.parse(treeResponse.body), {
    ok: false,
    error: {
      code: "invalid_request",
      message: "Invalid GitHub request"
    }
  });

  const forbiddenResponse = await app.inject({
    method: "GET",
    url: "/api/github/repos/other/widget/tree?ref=main",
    headers: {
      cookie: TEST_SESSION_COOKIE
    }
  });

  assert.equal(forbiddenResponse.statusCode, 403);
  assert.deepEqual(JSON.parse(forbiddenResponse.body), {
    ok: false,
    error: {
      code: "github_repo_not_allowed",
      message: "GitHub repository is not allowlisted"
    }
  });

  assert.equal(fetchCount, 0);
});

test("github routes sanitize upstream authorization failures", async (t) => {
  const githubConfig = createTestGitHubConfig({
    allowedRepos: ["acme/widget"],
    allowedRepoSet: new Set(["acme/widget"])
  });
  const githubClient = createGitHubClient({
    config: githubConfig,
    fetchImpl: async () => new Response("test-github-token secret-token", {
      status: 401,
      headers: {
        "Content-Type": "text/plain"
      }
    })
  });

  const app = createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient(),
    githubConfig,
    githubClient,
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/github/repos/acme/widget/tree?ref=main",
    headers: {
      cookie: TEST_SESSION_COOKIE
    }
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(JSON.parse(response.body), {
    ok: false,
    error: {
      code: "github_unauthorized",
      message: "GitHub credentials were rejected"
    }
  });
  assert.doesNotMatch(response.body, /test-github-token/);
  assert.doesNotMatch(response.body, /secret-token/);
});

test("github routes use session GitHub App installation credentials when available", async (t) => {
  const authHeaders: string[] = [];
  const githubConfig = createTestGitHubConfig({
    appId: "github-app-id",
    appPrivateKey: TEST_GITHUB_APP_PRIVATE_KEY,
    appSlug: TEST_GITHUB_APP_SLUG,
    installationId: TEST_INSTANCE_INSTALLATION_ID,
    installationTokenOverride: null,
    allowedRepos: ["acme/widget"],
    allowedRepoSet: new Set(["acme/widget"])
  });
  const githubClient = createGitHubClient({
    config: githubConfig,
    fetchImpl: async (input, init) => {
      const url = new URL(String(input));
      const authorization = new Headers(init?.headers).get("Authorization");
      authHeaders.push(authorization ?? "");

      if (url.pathname === "/repos/acme/widget") {
        return makeJsonResponse({
          full_name: "acme/widget",
          name: "widget",
          default_branch: "main",
          description: "Widget repo",
          private: false,
          archived: false,
          disabled: false,
          permissions: {
            push: true
          },
          owner: {
            login: "acme"
          }
        });
      }

      if (url.pathname === "/repos/acme/widget/commits/main") {
        return makeJsonResponse({
          sha: "commit-sha",
          commit: {
            tree: {
              sha: "tree-sha"
            }
          }
        });
      }

      return new Response(null, { status: 404 });
    }
  });

  const app = createApp({
    env: createTestEnv({
      GITHUB_APP_ID: "github-app-id",
      GITHUB_APP_PRIVATE_KEY: TEST_GITHUB_APP_PRIVATE_KEY,
      GITHUB_APP_SLUG: TEST_GITHUB_APP_SLUG,
      GITHUB_APP_INSTALLATION_ID: String(TEST_INSTANCE_INSTALLATION_ID),
      GITHUB_ALLOWED_REPOS: ["acme/widget"],
      INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY_ID: "test-key",
      INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY_VERSION: "1",
      INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY: "test-key-material"
    }),
    openRouter: createMockOpenRouterClient(),
    githubConfig,
    githubClient,
    integrationFetch: createGitHubAppIntegrationFetch({
      userToken: "ghs_user_token",
      instanceToken: "ghs_instance_token"
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
  const sessionCookie = String(start.headers["set-cookie"] ?? "");
  const state = new URL(String(start.headers.location ?? "")).searchParams.get("state");
  assert.ok(sessionCookie.length > 0);
  assert.ok(state);

  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(state ?? "")}&installation_id=${TEST_USER_INSTALLATION_ID}`,
    headers: {
      cookie: sessionCookie
    }
  });
  assert.equal(callback.statusCode, 302);

  const response = await app.inject({
    method: "GET",
    url: "/api/github/repos",
    headers: {
      cookie: sessionCookie
    }
  });

  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body) as {
    credentialSource: string;
  };
  assert.equal(payload.credentialSource, "user_connected");
  assert.equal(authHeaders[0], "Bearer ghs_user_token");
});

test("github routes do not reuse another session user token", async (t) => {
  const authHeaders: string[] = [];
  const githubConfig = createTestGitHubConfig({
    appId: "github-app-id",
    appPrivateKey: TEST_GITHUB_APP_PRIVATE_KEY,
    appSlug: TEST_GITHUB_APP_SLUG,
    installationId: TEST_INSTANCE_INSTALLATION_ID,
    installationTokenOverride: null,
    allowedRepos: ["acme/widget"],
    allowedRepoSet: new Set(["acme/widget"])
  });
  const githubClient = createGitHubClient({
    config: githubConfig,
    fetchImpl: async (input, init) => {
      const url = new URL(String(input));
      const authorization = new Headers(init?.headers).get("Authorization");
      authHeaders.push(authorization ?? "");

      if (url.pathname === "/repos/acme/widget") {
        return makeJsonResponse({
          full_name: "acme/widget",
          name: "widget",
          default_branch: "main",
          description: "Widget repo",
          private: false,
          archived: false,
          disabled: false,
          permissions: {
            push: true
          },
          owner: {
            login: "acme"
          }
        });
      }

      if (url.pathname === "/repos/acme/widget/commits/main") {
        return makeJsonResponse({
          sha: "commit-sha",
          commit: {
            tree: {
              sha: "tree-sha"
            }
          }
        });
      }

      return new Response(null, { status: 404 });
    }
  });

  const app = createApp({
    env: createTestEnv({
      GITHUB_APP_ID: "github-app-id",
      GITHUB_APP_PRIVATE_KEY: TEST_GITHUB_APP_PRIVATE_KEY,
      GITHUB_APP_SLUG: TEST_GITHUB_APP_SLUG,
      GITHUB_APP_INSTALLATION_ID: String(TEST_INSTANCE_INSTALLATION_ID),
      GITHUB_ALLOWED_REPOS: ["acme/widget"],
      INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY_ID: "test-key",
      INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY_VERSION: "1",
      INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY: "test-key-material"
    }),
    openRouter: createMockOpenRouterClient(),
    githubConfig,
    githubClient,
    integrationFetch: createGitHubAppIntegrationFetch({
      userToken: "ghs_user_token",
      instanceToken: "ghs_instance_token"
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
  const sessionCookieA = String(start.headers["set-cookie"] ?? "");
  const state = new URL(String(start.headers.location ?? "")).searchParams.get("state");
  assert.ok(state);

  await app.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(state ?? "")}&installation_id=${TEST_USER_INSTALLATION_ID}`,
    headers: {
      cookie: sessionCookieA
    }
  });

  const startOther = await app.inject({
    method: "GET",
    url: "/api/auth/github/start"
  });
  const sessionCookieB = String(startOther.headers["set-cookie"] ?? "");

  const response = await app.inject({
    method: "GET",
    url: "/api/github/repos",
    headers: {
      cookie: sessionCookieB
    }
  });

  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body) as {
    credentialSource: string;
  };
  assert.equal(payload.credentialSource, "instance_config");
  assert.equal(authHeaders[0], "Bearer ghs_instance_token");
});
