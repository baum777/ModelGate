import assert from "node:assert/strict";
import test from "node:test";
import { createGitHubClient, GitHubClientError } from "../src/lib/github-client.js";
import { createTestGitHubConfig } from "../test-support/helpers.js";

function makeJsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers
    }
  });
}

test("github client normalizes repository summaries, trees, and file content", async () => {
  const calls: string[] = [];
  const client = createGitHubClient({
    config: createTestGitHubConfig({
      allowedRepos: ["acme/widget"],
      allowedRepoSet: new Set(["acme/widget"])
    }),
    fetchImpl: async (input, init) => {
      const url = new URL(String(input));
      calls.push(`${url.pathname}${url.search}`);
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-github-token");

      if (url.pathname === "/repos/acme/widget") {
        return makeJsonResponse({
          full_name: "acme/widget",
          name: "widget",
          default_branch: "main",
          description: "Widget repo",
          private: true,
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
              path: "README.md",
              type: "blob",
              sha: "blob-readme",
              size: 12,
              mode: "100644"
            },
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
          content: Buffer.from("console.log('hi')\n").toString("base64")
        });
      }

      throw new Error(`unexpected path: ${url.pathname}${url.search}`);
    }
  });

  const summary = await client.readRepositorySummary("acme", "widget");
  assert.deepEqual(summary, {
    owner: "acme",
    repo: "widget",
    fullName: "acme/widget",
    defaultBranch: "main",
    defaultBranchSha: "commit-sha",
    description: "Widget repo",
    isPrivate: true,
    status: "ready",
    permissions: {
      canWrite: true
    },
    checkedAt: summary.checkedAt
  });
  assert.match(summary.checkedAt, /^\d{4}-\d{2}-\d{2}T/);

  const tree = await client.readRepositoryTree("acme", "widget", {
    ref: "main",
    path: "src",
    depth: 1,
    maxEntries: 10
  });

  assert.deepEqual(tree, {
    owner: "acme",
    repo: "widget",
    ref: "main",
    sha: "tree-sha",
    rootPath: "src",
    entries: [
      {
        path: "src",
        type: "directory",
        sha: "tree-src",
        size: 0,
        mode: "040000"
      },
      {
        path: "src/index.ts",
        type: "file",
        sha: "blob-index",
        size: 42,
        mode: "100644"
      }
    ],
    truncated: false,
    generatedAt: tree.generatedAt
  });
  assert.match(tree.generatedAt, /^\d{4}-\d{2}-\d{2}T/);

  const file = await client.readRepositoryFile("acme", "widget", {
    ref: "main",
    path: "src/index.ts"
  });

  assert.deepEqual(file, {
    owner: "acme",
    repo: "widget",
    path: "src/index.ts",
    ref: "main",
    sha: "blob-index",
    encoding: "utf-8",
    content: "console.log('hi')\n",
    language: "typescript",
    size: 24,
    lineCount: 2,
    truncated: false,
    binary: false,
    generatedAt: file.generatedAt
  });
  assert.match(file.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(calls, [
    "/repos/acme/widget",
    "/repos/acme/widget/commits/main",
    "/repos/acme/widget/commits/main",
    "/repos/acme/widget/git/trees/tree-sha?recursive=1",
    "/repos/acme/widget/contents/src/index.ts?ref=main"
  ]);
});

test("github client fails closed for malformed responses, unauthorized requests, and timeouts", async () => {
  const malformedClient = createGitHubClient({
    config: createTestGitHubConfig({
      allowedRepos: ["acme/widget"],
      allowedRepoSet: new Set(["acme/widget"])
    }),
    fetchImpl: async (input) => {
      const url = new URL(String(input));

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
          tree: "not-an-array"
        });
      }

      throw new Error(`unexpected path: ${url.pathname}`);
    }
  });

  await assert.rejects(
    malformedClient.readRepositoryTree("acme", "widget", {
      ref: "main",
      path: "src"
    }),
    (error) => error instanceof GitHubClientError && error.code === "github_malformed_response"
  );

  const unauthorizedClient = createGitHubClient({
    config: createTestGitHubConfig({
      allowedRepos: ["acme/widget"],
      allowedRepoSet: new Set(["acme/widget"])
    }),
    fetchImpl: async () => new Response("secret-token", {
      status: 401,
      headers: {
        "Content-Type": "text/plain"
      }
    })
  });

  await assert.rejects(
    unauthorizedClient.readRepositoryTree("acme", "widget", {
      ref: "main",
      path: "src"
    }),
    (error) => {
      assert.ok(error instanceof GitHubClientError);
      assert.equal(error.code, "github_unauthorized");
      assert.doesNotMatch(error.message, /secret-token/);
      return true;
    }
  );

  const timeoutClient = createGitHubClient({
    config: createTestGitHubConfig({
      requestTimeoutMs: 1,
      allowedRepos: ["acme/widget"],
      allowedRepoSet: new Set(["acme/widget"])
    }),
    fetchImpl: async (_input, init) =>
      await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new Error("AbortError"));
        });
      })
  });

  await assert.rejects(
    timeoutClient.readRepositoryFile("acme", "widget", {
      ref: "main",
      path: "src/index.ts"
    }),
    (error) => error instanceof GitHubClientError && error.code === "github_timeout"
  );
});
