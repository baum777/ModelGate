import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import { createGitHubClient } from "../src/lib/github-client.js";
import { createTestEnv, createMockOpenRouterClient, createTestGitHubConfig, createTestSessionCookie } from "../test-support/helpers.js";

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
    repos: Array<{ fullName: string; status: string; defaultBranchSha: string | null }>;
  };
  assert.equal(reposBody.ok, true);
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
    tree: { rootPath: string; entries: Array<{ path: string }> };
  };
  assert.equal(treeBody.ok, true);
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
    file: { path: string; content: string; encoding: string; binary: boolean; truncated: boolean };
  };
  assert.equal(fileBody.ok, true);
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
