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

test("github client normalizes branch, commit, tree, and pull request write primitives", async () => {
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

      if (url.pathname === "/repos/acme/widget/git/ref/heads%2Fmosaicstacked%2Fgithub%2Fplan_1" && (init?.method ?? "GET") === "GET") {
        return makeJsonResponse({
          ref: "heads/mosaicstacked/github/plan_1",
          url: "https://api.github.com/repos/acme/widget/git/refs/heads/mosaicstacked/github/plan_1",
          object: {
            sha: "commit-sha-existing",
            type: "commit"
          }
        });
      }

      if (url.pathname === "/repos/acme/widget/git/refs/heads%2Fmosaicstacked%2Fgithub%2Fplan_1" && (init?.method ?? "GET") === "PATCH") {
        return makeJsonResponse({
          ref: "refs/heads/mosaicstacked/github/plan_1",
          url: "https://api.github.com/repos/acme/widget/git/refs/heads/mosaicstacked/github/plan_1",
          object: {
            sha: "commit-sha-write",
            type: "commit"
          }
        });
      }

      if (url.pathname === "/repos/acme/widget/git/trees" && (init?.method ?? "GET") === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          base_tree: string;
          tree: Array<{ path: string; mode: string; type: string; content: string }>;
        };

        assert.equal(body.base_tree, "tree-sha-base");
        assert.deepEqual(body.tree, [
          {
            path: "src/index.ts",
            mode: "100644",
            type: "blob",
            content: "export const value = 2;\n"
          }
        ]);

        return makeJsonResponse({
          sha: "tree-sha-write"
        });
      }

      if (url.pathname === "/repos/acme/widget/git/commits" && (init?.method ?? "GET") === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          message: string;
          tree: string;
          parents: string[];
          author: { name: string; email: string; date: string };
          committer: { name: string; email: string; date: string };
        };

        assert.equal(body.message, "MosaicStacked plan plan_1");
        assert.equal(body.tree, "tree-sha-write");
        assert.deepEqual(body.parents, ["commit-sha-base"]);
        assert.equal(body.author.name, "MosaicStacked");
        assert.equal(body.committer.email, "mosaicstacked@users.noreply.github.com");

        return makeJsonResponse({
          sha: "commit-sha-write",
          tree: {
            sha: "tree-sha-write"
          }
        });
      }

      if (url.pathname === "/repos/acme/widget/git/refs" && (init?.method ?? "GET") === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { ref: string; sha: string };

        assert.equal(body.ref, "refs/heads/mosaicstacked/github/plan_1");
        assert.equal(body.sha, "commit-sha-write");

        return makeJsonResponse({
          ref: "refs/heads/mosaicstacked/github/plan_1",
          url: "https://api.github.com/repos/acme/widget/git/refs/heads/mosaicstacked/github/plan_1",
          object: {
            sha: "commit-sha-write",
            type: "commit"
          }
        });
      }

      if (url.pathname === "/repos/acme/widget/pulls" && (init?.method ?? "GET") === "GET") {
        assert.equal(url.searchParams.get("state"), "all");
        assert.equal(url.searchParams.get("head"), "acme:mosaicstacked/github/plan_1");
        assert.equal(url.searchParams.get("base"), "main");
        assert.equal(url.searchParams.get("per_page"), "10");
        assert.equal(url.searchParams.get("page"), "1");

        return makeJsonResponse([]);
      }

      if (url.pathname === "/repos/acme/widget/pulls" && (init?.method ?? "GET") === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          title: string;
          head: string;
          base: string;
          body: string;
          draft: boolean;
          maintainer_can_modify: boolean;
        };

        assert.equal(body.title, "MosaicStacked plan plan_1");
        assert.equal(body.head, "mosaicstacked/github/plan_1");
        assert.equal(body.base, "main");
        assert.equal(body.draft, false);
        assert.equal(body.maintainer_can_modify, true);

        return makeJsonResponse({
          number: 12,
          html_url: "https://github.com/acme/widget/pull/12",
          state: "open",
          head: {
            ref: "mosaicstacked/github/plan_1",
            sha: "commit-sha-write"
          },
          base: {
            ref: "main",
            sha: "commit-sha-base"
          },
          mergeable: true,
          draft: false,
          title: "MosaicStacked plan plan_1",
          body: "MosaicStacked approval-gated proposal"
        });
      }

      throw new Error(`unexpected path: ${url.pathname}${url.search}`);
    }
  });

  const reference = await client.readRepositoryReference("acme", "widget", "heads/mosaicstacked/github/plan_1");
  assert.deepEqual(reference, {
    ref: "heads/mosaicstacked/github/plan_1",
    sha: "commit-sha-existing",
    url: "https://api.github.com/repos/acme/widget/git/refs/heads/mosaicstacked/github/plan_1",
    objectType: "commit"
  });

  const tree = await client.createRepositoryTree("acme", "widget", {
    baseTreeSha: "tree-sha-base",
    entries: [
      {
        path: "src/index.ts",
        mode: "100644",
        content: "export const value = 2;\n"
      }
    ]
  });
  assert.deepEqual(tree, {
    sha: "tree-sha-write"
  });

  const commit = await client.createRepositoryCommit("acme", "widget", {
    message: "MosaicStacked plan plan_1",
    treeSha: "tree-sha-write",
    parentShas: ["commit-sha-base"],
    author: {
      name: "MosaicStacked",
      email: "mosaicstacked@users.noreply.github.com",
      date: "2026-04-16T00:00:00.000Z"
    },
    committer: {
      name: "MosaicStacked",
      email: "mosaicstacked@users.noreply.github.com",
      date: "2026-04-16T00:00:00.000Z"
    }
  });
  assert.deepEqual(commit, {
    sha: "commit-sha-write",
    treeSha: "tree-sha-write"
  });

  const createdReference = await client.createRepositoryReference("acme", "widget", "heads/mosaicstacked/github/plan_1", "commit-sha-write");
  assert.deepEqual(createdReference, {
    ref: "refs/heads/mosaicstacked/github/plan_1",
    sha: "commit-sha-write",
    url: "https://api.github.com/repos/acme/widget/git/refs/heads/mosaicstacked/github/plan_1",
    objectType: "commit"
  });

  const updatedReference = await client.updateRepositoryReference("acme", "widget", "heads/mosaicstacked/github/plan_1", "commit-sha-write");
  assert.deepEqual(updatedReference, {
    ref: "refs/heads/mosaicstacked/github/plan_1",
    sha: "commit-sha-write",
    url: "https://api.github.com/repos/acme/widget/git/refs/heads/mosaicstacked/github/plan_1",
    objectType: "commit"
  });

  const pullRequests = await client.listPullRequests("acme", "widget", {
    state: "all",
    head: "acme:mosaicstacked/github/plan_1",
    base: "main",
    perPage: 10,
    page: 1
  });
  assert.deepEqual(pullRequests, []);

  const pullRequest = await client.createPullRequest("acme", "widget", {
    title: "MosaicStacked plan plan_1",
    head: "mosaicstacked/github/plan_1",
    base: "main",
    body: "MosaicStacked approval-gated proposal",
    draft: false,
    maintainerCanModify: true
  });
  assert.deepEqual(pullRequest, {
    number: 12,
    htmlUrl: "https://github.com/acme/widget/pull/12",
    state: "open",
    headRef: "mosaicstacked/github/plan_1",
    headSha: "commit-sha-write",
    baseRef: "main",
    baseSha: "commit-sha-base",
    mergeable: true,
    draft: false,
    title: "MosaicStacked plan plan_1",
    body: "MosaicStacked approval-gated proposal",
    createdAt: null,
    updatedAt: null,
    mergeCommitSha: null,
    url: null
  });

  assert.deepEqual(calls, [
    "/repos/acme/widget/git/ref/heads%2Fmosaicstacked%2Fgithub%2Fplan_1",
    "/repos/acme/widget/git/trees",
    "/repos/acme/widget/git/commits",
    "/repos/acme/widget/git/refs",
    "/repos/acme/widget/git/refs/heads%2Fmosaicstacked%2Fgithub%2Fplan_1",
    "/repos/acme/widget/pulls?state=all&head=acme%3Amosaicstacked%2Fgithub%2Fplan_1&base=main&per_page=10&page=1",
    "/repos/acme/widget/pulls"
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
