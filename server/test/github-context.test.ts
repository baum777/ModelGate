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

function encodeText(text: string) {
  return Buffer.from(text, "utf8").toString("base64");
}

const TEST_SESSION_COOKIE = createTestSessionCookie();

test("github context returns a ranked, citation-backed bundle", async (t) => {
  const githubConfig = createTestGitHubConfig({
    allowedRepos: ["acme/widget"],
    allowedRepoSet: new Set(["acme/widget"]),
    maxContextFiles: 2,
    maxContextBytes: 2000
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
              path: "src/index.ts",
              type: "blob",
              sha: "blob-index",
              size: 85,
              mode: "100644"
            },
            {
              path: "src/utils.ts",
              type: "blob",
              sha: "blob-utils",
              size: 110,
              mode: "100644"
            },
            {
              path: "README.md",
              type: "blob",
              sha: "blob-readme",
              size: 70,
              mode: "100644"
            }
          ]
        });
      }

      if (url.pathname === "/repos/acme/widget/contents/src/utils.ts") {
        assert.equal(url.searchParams.get("ref"), "main");
        return makeJsonResponse({
          type: "file",
          path: "src/utils.ts",
          sha: "blob-utils",
          size: 57,
          encoding: "base64",
          content: encodeText(
            [
              "export function explainFlow() {",
              "  return 'flow through utils';",
              "}"
            ].join("\n") + "\n"
          )
        });
      }

      if (url.pathname === "/repos/acme/widget/contents/src/index.ts") {
        assert.equal(url.searchParams.get("ref"), "main");
        return makeJsonResponse({
          type: "file",
          path: "src/index.ts",
          sha: "blob-index",
          size: 61,
          encoding: "base64",
          content: encodeText(
            [
              "export const entry = 'widget';",
              "export const mode = 'default';"
            ].join("\n") + "\n"
          )
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

  const response = await app.inject({
    method: "POST",
    url: "/api/github/context",
    headers: {
      cookie: TEST_SESSION_COOKIE
    },
    payload: {
      repo: {
        owner: "acme",
        repo: "widget"
      },
      question: "Explain the flow through the widget repo and utils",
      ref: "main",
      rootPath: "src",
      selectedPaths: ["src/utils.ts"],
      maxFiles: 2,
      maxBytes: 2000
    }
  });

  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body) as {
    ok: true;
    context: {
      repo: { fullName: string; defaultBranchSha: string | null };
      ref: string;
      baseSha: string;
      files: Array<{ path: string; excerpt: string; citations: Array<{ startLine: number; endLine: number }> }>;
      tree: { rootPath: string; entries: Array<{ path: string }> };
      tokenBudget: { maxTokens: number; usedTokens: number; truncated: boolean };
      warnings: string[];
    };
  };

  assert.equal(body.ok, true);
  assert.equal(body.context.repo.fullName, "acme/widget");
  assert.equal(body.context.ref, "main");
  assert.equal(body.context.baseSha, "commit-sha");
  assert.equal(body.context.tree.rootPath, "src");
  assert.deepEqual(body.context.tree.entries.map((entry) => entry.path), [
    "src/index.ts",
    "src/utils.ts"
  ]);
  assert.equal(body.context.files[0]?.path, "src/utils.ts");
  assert.equal(body.context.files[0]?.citations[0]?.startLine, 1);
  assert.equal(body.context.files[0]?.citations[0]?.endLine, 3);
  assert.match(body.context.files[0]?.excerpt ?? "", /explainFlow/);
  assert.equal(body.context.files[1]?.path, "src/index.ts");
  assert.equal(body.context.tokenBudget.truncated, false);
  assert.equal(body.context.warnings.length, 0);

  assert.deepEqual(fetchCalls, [
    "/repos/acme/widget",
    "/repos/acme/widget/commits/main",
    "/repos/acme/widget/commits/main",
    "/repos/acme/widget/git/trees/tree-sha?recursive=1",
    "/repos/acme/widget/contents/src/utils.ts?ref=main",
    "/repos/acme/widget/contents/src/index.ts?ref=main"
  ]);
});

test("github context fails closed for invalid paths before any upstream fetch", async (t) => {
  let fetchCount = 0;
  const githubConfig = createTestGitHubConfig({
    allowedRepos: ["acme/widget"],
    allowedRepoSet: new Set(["acme/widget"])
  });
  const githubClient = createGitHubClient({
    config: githubConfig,
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error("upstream should not be called");
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

  const response = await app.inject({
    method: "POST",
    url: "/api/github/context",
    headers: {
      cookie: TEST_SESSION_COOKIE
    },
    payload: {
      repo: {
        owner: "acme",
        repo: "widget"
      },
      question: "Explain the flow",
      selectedPaths: ["../secret"]
    }
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.body), {
    ok: false,
    error: {
      code: "invalid_request",
      message: "Invalid GitHub request"
    }
  });
  assert.equal(fetchCount, 0);
});

test("github context returns file not found when a selected path is missing", async (t) => {
  const githubConfig = createTestGitHubConfig({
    allowedRepos: ["acme/widget"],
    allowedRepoSet: new Set(["acme/widget"])
  });

  const githubClient = createGitHubClient({
    config: githubConfig,
    fetchImpl: async (input) => {
      const url = new URL(String(input));

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
        return makeJsonResponse({
          sha: "tree-sha",
          truncated: false,
          tree: [
            {
              path: "src/index.ts",
              type: "blob",
              sha: "blob-index",
              size: 85,
              mode: "100644"
            }
          ]
        });
      }

      if (url.pathname === "/repos/acme/widget/contents/src/missing.ts") {
        return new Response("", { status: 404 });
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

  const response = await app.inject({
    method: "POST",
    url: "/api/github/context",
    headers: {
      cookie: TEST_SESSION_COOKIE
    },
    payload: {
      repo: {
        owner: "acme",
        repo: "widget"
      },
      question: "Explain the flow",
      selectedPaths: ["src/missing.ts"]
    }
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(JSON.parse(response.body), {
    ok: false,
    error: {
      code: "github_file_not_found",
      message: "GitHub selected path was not found: src/missing.ts"
    }
  });
});
