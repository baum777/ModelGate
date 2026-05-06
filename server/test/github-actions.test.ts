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

test("github proposal routes create a review-only plan scaffold and keep it readable", async (t) => {
  let currentCommitSha = "commit-sha-1";
  const fetchCalls: string[] = [];
  const openRouter = createMockOpenRouterClient({
    createChatCompletion: async (request, selection) => {
      assert.equal(request.stream, false);
      assert.equal(selection.publicModelId, "default");
      assert.deepEqual(selection.providerTargets, [
        "qwen/qwen3-coder:free",
        "qwen/qwen3-next-80b-a3b-instruct:free"
      ]);
      assert.equal(request.messages.length, 1);
      assert.equal(request.messages[0]?.role, "user");

      const userContent = request.messages[0]?.content ?? "";
      const userPayloadText = userContent.slice(userContent.indexOf("INPUT:") + "INPUT:".length);
      const userPayload = JSON.parse(userPayloadText) as {
        objective: string;
        baseSha: string;
        files: Array<{ path: string; currentContent: string }>;
      };

      assert.equal(userPayload.objective, "Review the widget flow");
      assert.equal(userPayload.baseSha, "commit-sha-1");
      assert.deepEqual(userPayload.files.map((file) => file.path), [
        "src/utils.ts",
        "src/index.ts"
      ]);

      return {
        model: selection.publicModelId,
        text: JSON.stringify({
          summary: "Review the widget flow",
          rationale: "Tighten the widget flow while keeping the backend reviewable.",
          riskLevel: "medium_surface",
          files: [
            {
              path: "src/index.ts",
              changeType: "modified",
              afterContent: [
                "export const entry = 'widget';",
                "export const mode = 'flow';"
              ].join("\n") + "\n"
            },
            {
              path: "src/utils.ts",
              changeType: "modified",
              afterContent: [
                "export function explainFlow() {",
                "  return 'flow through utils v2';",
                "}"
              ].join("\n") + "\n"
            }
          ]
        })
      };
    }
  });
  const githubConfig = createTestGitHubConfig({
    allowedRepos: ["acme/widget"],
    allowedRepoSet: new Set(["acme/widget"]),
    planTtlMs: 60_000
  });

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
          sha: currentCommitSha,
          commit: {
            tree: {
              sha: currentCommitSha === "commit-sha-1" ? "tree-sha-1" : "tree-sha-2"
            }
          }
        });
      }

      if (url.pathname === "/repos/acme/widget/git/trees/tree-sha-1" || url.pathname === "/repos/acme/widget/git/trees/tree-sha-2") {
        return makeJsonResponse({
          sha: currentCommitSha === "commit-sha-1" ? "tree-sha-1" : "tree-sha-2",
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
            }
          ]
        });
      }

      if (url.pathname === "/repos/acme/widget/contents/src/utils.ts") {
        return makeJsonResponse({
          type: "file",
          path: "src/utils.ts",
          sha: "blob-utils",
          size: 57,
          encoding: "base64",
          content: encodeText([
            "export function explainFlow() {",
            "  return 'flow through utils';",
            "}"
          ].join("\n") + "\n")
        });
      }

      if (url.pathname === "/repos/acme/widget/contents/src/index.ts") {
        return makeJsonResponse({
          type: "file",
          path: "src/index.ts",
          sha: "blob-index",
          size: 61,
          encoding: "base64",
          content: encodeText([
            "export const entry = 'widget';",
            "export const mode = 'default';"
          ].join("\n") + "\n")
        });
      }

      throw new Error(`unexpected path: ${url.pathname}${url.search}`);
    }
  });

  const app = createApp({
    env: createTestEnv(),
    openRouter,
    githubConfig,
    githubClient,
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const proposeResponse = await app.inject({
    method: "POST",
    url: "/api/github/actions/propose",
    headers: {
      cookie: TEST_SESSION_COOKIE
    },
    payload: {
      repo: {
        owner: "acme",
        repo: "widget"
      },
      objective: "Review the widget flow",
      question: "Explain the flow through the widget repo and utils",
      ref: "main",
      selectedPaths: ["src/utils.ts"],
      constraints: ["keep behavior stable"]
    }
  });

  assert.equal(proposeResponse.statusCode, 200);
  const proposeBody = JSON.parse(proposeResponse.body) as {
    ok: true;
    plan: {
      planId: string;
      repo: { fullName: string };
      baseRef: string;
      baseSha: string;
      branchName: string;
      targetBranch: string;
      status: string;
      stale: boolean;
      requiresApproval: true;
      summary: string;
      rationale: string;
      riskLevel: string;
      citations: Array<{ path: string }>;
      diff: unknown[];
      generatedAt: string;
      expiresAt: string;
      routingMetadata?: {
        workflowRole: string;
        selectedModel: string;
        candidateModels: string[];
        fallbackUsed: boolean;
        selectionSource: string;
        routingMode: string;
        allowFallback: boolean;
        failClosed: boolean;
        structuredOutputRequired: boolean;
        approvalRequired: boolean;
        mayExecuteExternalTools: boolean;
        mayWriteExternalState: boolean;
        policySectionKey: string | null;
        recordedAt: string;
      };
    };
  };

  const journalResponse = await app.inject({
    method: "GET",
    url: "/journal/recent?source=github&limit=10"
  });
  assert.equal(journalResponse.statusCode, 200);
  const journalPayload = JSON.parse(journalResponse.body) as {
    ok: true;
    entries: Array<{
      eventType: string;
      planId: string | null;
    }>;
  };
  assert.equal(journalPayload.ok, true);
  assert.ok(journalPayload.entries.some((entry) => entry.eventType === "github_proposal_created"));

  assert.equal(proposeBody.ok, true);
  assert.match(proposeBody.plan.planId, /^plan_[0-9a-f-]{36}$/);
  assert.equal(proposeBody.plan.repo.fullName, "acme/widget");
  assert.equal(proposeBody.plan.baseRef, "main");
  assert.equal(proposeBody.plan.baseSha, "commit-sha-1");
  assert.equal(proposeBody.plan.branchName, `mosaicstack/github/${proposeBody.plan.planId}`);
  assert.equal(proposeBody.plan.targetBranch, "main");
  assert.equal(proposeBody.plan.status, "pending_review");
  assert.equal(proposeBody.plan.stale, false);
  assert.equal(proposeBody.plan.requiresApproval, true);
  assert.equal(proposeBody.plan.summary, "Review the widget flow");
  assert.match(
    proposeBody.plan.rationale,
    /Validated against 2 cited files from acme\/widget at main\./i
  );
  assert.equal(proposeBody.plan.riskLevel, "medium_surface");
  assert.deepEqual(proposeBody.plan.citations.map((citation) => citation.path), [
    "src/utils.ts",
    "src/index.ts"
  ]);
  assert.deepEqual(proposeBody.plan.diff.map((file) => file.path), [
    "src/index.ts",
    "src/utils.ts"
  ]);
  assert.match(proposeBody.plan.diff[0]?.patch ?? "", /-export const mode = 'default';/);
  assert.match(proposeBody.plan.diff[0]?.patch ?? "", /\+export const mode = 'flow';/);
  assert.match(proposeBody.plan.diff[1]?.patch ?? "", /-  return 'flow through utils';/);
  assert.match(proposeBody.plan.diff[1]?.patch ?? "", /\+  return 'flow through utils v2';/);
  assert.match(proposeBody.plan.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(proposeBody.plan.expiresAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(proposeBody.plan.routingMetadata?.workflowRole, "github_code_agent");
  assert.equal(proposeBody.plan.routingMetadata?.selectedModel, "qwen/qwen3-coder:free");
  assert.deepEqual(proposeBody.plan.routingMetadata?.candidateModels, [
    "qwen/qwen3-coder:free",
    "qwen/qwen3-next-80b-a3b-instruct:free"
  ]);
  assert.equal(proposeBody.plan.routingMetadata?.fallbackUsed, false);
  assert.equal(proposeBody.plan.routingMetadata?.selectionSource, "env");
  assert.equal(proposeBody.plan.routingMetadata?.routingMode, "policy");
  assert.equal(proposeBody.plan.routingMetadata?.allowFallback, true);
  assert.equal(proposeBody.plan.routingMetadata?.failClosed, true);
  assert.equal(proposeBody.plan.routingMetadata?.structuredOutputRequired, true);
  assert.equal(proposeBody.plan.routingMetadata?.approvalRequired, true);
  assert.equal(proposeBody.plan.routingMetadata?.mayExecuteExternalTools, false);
  assert.equal(proposeBody.plan.routingMetadata?.mayWriteExternalState, false);
  assert.equal(proposeBody.plan.routingMetadata?.policySectionKey, "github_code_agent");
  assert.match(proposeBody.plan.routingMetadata?.recordedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);

  currentCommitSha = "commit-sha-2";

  const readResponse = await app.inject({
    method: "GET",
    url: `/api/github/actions/${proposeBody.plan.planId}`,
    headers: {
      cookie: TEST_SESSION_COOKIE
    }
  });

  assert.equal(readResponse.statusCode, 409);
  assert.deepEqual(JSON.parse(readResponse.body), {
    ok: false,
    error: {
      code: "github_stale_plan",
      message: "GitHub plan is stale and must be refreshed"
    }
  });

  assert.deepEqual(fetchCalls.slice(0, 10), [
    "/repos/acme/widget",
    "/repos/acme/widget/commits/main",
    "/repos/acme/widget/commits/main",
    "/repos/acme/widget/git/trees/tree-sha-1?recursive=1",
    "/repos/acme/widget/contents/src/utils.ts?ref=main",
    "/repos/acme/widget/contents/src/index.ts?ref=main",
    "/repos/acme/widget/contents/src/utils.ts?ref=main",
    "/repos/acme/widget/contents/src/index.ts?ref=main",
    "/repos/acme/widget",
    "/repos/acme/widget/commits/main"
  ]);
});

test("github proposal routes create a deterministic smoke plan without the LLM", async (t) => {
  let llmInvoked = false;
  const githubConfig = createTestGitHubConfig({
    allowedRepos: ["acme/widget"],
    allowedRepoSet: new Set(["acme/widget"]),
    planTtlMs: 60_000
  });

  const githubClient = createGitHubClient({
    config: githubConfig,
    fetchImpl: async (input, init) => {
      const url = new URL(String(input));
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
          sha: "commit-sha-smoke",
          commit: {
            tree: {
              sha: "tree-sha-smoke"
            }
          }
        });
      }

      if (url.pathname === "/repos/acme/widget/git/trees/tree-sha-smoke") {
        return makeJsonResponse({
          sha: "tree-sha-smoke",
          truncated: false,
          tree: [
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

      if (url.pathname === "/repos/acme/widget/contents/README.md") {
        return makeJsonResponse({
          type: "file",
          path: "README.md",
          sha: "blob-readme",
          size: 70,
          encoding: "base64",
          content: encodeText("widget repo\n")
        });
      }

      if (url.pathname === "/repos/acme/widget/contents/docs/mosaicstack-smoke.md") {
        return new Response("not found", {
          status: 404,
          headers: {
            "Content-Type": "text/plain"
          }
        });
      }

      throw new Error(`unexpected path: ${url.pathname}${url.search}`);
    }
  });

  const openRouter = createMockOpenRouterClient({
    createChatCompletion: async () => {
      llmInvoked = true;
      throw new Error("LLM should not be called for smoke proposals");
    }
  });

  const app = createApp({
    env: createTestEnv(),
    openRouter,
    githubConfig,
    githubClient,
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/github/actions/propose",
    headers: {
      cookie: TEST_SESSION_COOKIE
    },
    payload: {
      repo: {
        owner: "acme",
        repo: "widget"
      },
      objective: "Smoke the GitHub proposal flow",
      baseBranch: "main",
      targetBranch: "mosaicstack/github-smoke",
      mode: "smoke",
      intent: "create or update docs/mosaicstack-smoke.md with a harmless timestamp"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(llmInvoked, false);

  const body = JSON.parse(response.body) as {
    ok: true;
    plan: {
      planId: string;
      branchName: string;
      targetBranch: string;
      summary: string;
      rationale: string;
      routingMetadata?: unknown;
      diff: Array<{
        path: string;
        changeType: string;
        patch: string;
      }>;
    };
  };

  assert.match(body.plan.planId, /^plan_[0-9a-f-]{36}$/);
  assert.equal(body.plan.branchName, `mosaicstack/github-smoke/${body.plan.planId}`);
  assert.equal(body.plan.targetBranch, "main");
  assert.equal(body.plan.summary, "Smoke proposal for acme/widget");
  assert.match(body.plan.rationale, /Deterministic smoke proposal for acme\/widget/i);
  assert.equal(body.plan.routingMetadata, undefined);
  assert.deepEqual(body.plan.diff.map((file) => file.path), [
    "docs/mosaicstack-smoke.md"
  ]);
  assert.equal(body.plan.diff[0]?.changeType, "added");
  assert.match(body.plan.diff[0]?.patch ?? "", /@@ reviewable addition @@/);
  assert.match(body.plan.diff[0]?.patch ?? "", /\+Generated at:/);
  assert.match(
    body.plan.diff[0]?.patch ?? "",
    /\+Intent: create or update docs\/mosaicstack-smoke\.md with a harmless timestamp/
  );
});

test("github proposal smoke requests reject unsafe branch or file selection", async (t) => {
  const githubConfig = createTestGitHubConfig({
    allowedRepos: ["acme/widget"],
    allowedRepoSet: new Set(["acme/widget"]),
    planTtlMs: 60_000
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
          sha: "commit-sha-smoke",
          commit: {
            tree: {
              sha: "tree-sha-smoke"
            }
          }
        });
      }

      if (url.pathname === "/repos/acme/widget/git/trees/tree-sha-smoke") {
        return makeJsonResponse({
          sha: "tree-sha-smoke",
          truncated: false,
          tree: [
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

      if (url.pathname === "/repos/acme/widget/contents/README.md") {
        return makeJsonResponse({
          type: "file",
          path: "README.md",
          sha: "blob-readme",
          size: 70,
          encoding: "base64",
          content: encodeText("widget repo\n")
        });
      }

      if (url.pathname === "/repos/acme/widget/contents/docs/mosaicstack-smoke.md") {
        return new Response("not found", {
          status: 404,
          headers: {
            "Content-Type": "text/plain"
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
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const invalidBranchResponse = await app.inject({
    method: "POST",
    url: "/api/github/actions/propose",
    headers: {
      cookie: TEST_SESSION_COOKIE
    },
    payload: {
      repo: {
        owner: "acme",
        repo: "widget"
      },
      objective: "Smoke the GitHub proposal flow",
      baseBranch: "main",
      targetBranch: "main",
      mode: "smoke",
      intent: "create or update docs/mosaicstack-smoke.md with a harmless timestamp"
    }
  });

  assert.equal(invalidBranchResponse.statusCode, 400);
  assert.deepEqual(JSON.parse(invalidBranchResponse.body), {
    ok: false,
    error: {
      code: "invalid_request",
      message: "Invalid GitHub request"
    }
  });

  const invalidSelectionResponse = await app.inject({
    method: "POST",
    url: "/api/github/actions/propose",
    headers: {
      cookie: TEST_SESSION_COOKIE
    },
    payload: {
      repo: {
        owner: "acme",
        repo: "widget"
      },
      objective: "Smoke the GitHub proposal flow",
      baseBranch: "main",
      targetBranch: "mosaicstack/github-smoke",
      mode: "smoke",
      selectedPaths: ["package.json"],
      intent: "create or update docs/mosaicstack-smoke.md with a harmless timestamp"
    }
  });

  assert.equal(invalidSelectionResponse.statusCode, 400);
  assert.deepEqual(JSON.parse(invalidSelectionResponse.body), {
    ok: false,
    error: {
      code: "invalid_request",
      message: "Invalid GitHub request"
    }
  });
});

test("github proposal routes fail closed with a controlled timeout when the LLM stalls", async (t) => {
  const githubConfig = createTestGitHubConfig({
    allowedRepos: ["acme/widget"],
    allowedRepoSet: new Set(["acme/widget"]),
    maxContextFiles: 2,
    maxContextBytes: 2000,
    requestTimeoutMs: 250
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
              path: "README.md",
              type: "blob",
              sha: "blob-readme",
              size: 70,
              mode: "100644"
            }
          ]
        });
      }

      if (url.pathname === "/repos/acme/widget/contents/README.md") {
        return makeJsonResponse({
          type: "file",
          path: "README.md",
          sha: "blob-readme",
          size: 70,
          encoding: "base64",
          content: encodeText("widget repo\n")
        });
      }

      throw new Error(`unexpected path: ${url.pathname}${url.search}`);
    }
  });

  const openRouter = createMockOpenRouterClient({
    createChatCompletion: async () => {
      return await new Promise<never>(() => {});
    }
  });

  const app = createApp({
    env: createTestEnv(),
    openRouter,
    githubConfig,
    githubClient,
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/github/actions/propose",
    headers: {
      cookie: TEST_SESSION_COOKIE
    },
    payload: {
      repo: {
        owner: "acme",
        repo: "widget"
      },
      objective: "Smoke the proposal timeout",
      ref: "main",
      selectedPaths: ["README.md"]
    }
  });

  assert.equal(response.statusCode, 504);
  assert.deepEqual(JSON.parse(response.body), {
    ok: false,
    error: {
      code: "github_propose_timeout",
      message: "GitHub proposal generation timed out"
    }
  });
  assert.doesNotMatch(response.body, /ghp_|github_pat_/);
});

test("github proposal routes fail closed when the repository changes during proposal generation", async (t) => {
  let currentCommitSha = "commit-sha-1";
  const githubConfig = createTestGitHubConfig({
    allowedRepos: ["acme/widget"],
    allowedRepoSet: new Set(["acme/widget"]),
    planTtlMs: 60_000
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
          sha: currentCommitSha,
          commit: {
            tree: {
              sha: currentCommitSha === "commit-sha-1" ? "tree-sha-1" : "tree-sha-2"
            }
          }
        });
      }

      if (url.pathname === "/repos/acme/widget/git/trees/tree-sha-1" || url.pathname === "/repos/acme/widget/git/trees/tree-sha-2") {
        return makeJsonResponse({
          sha: currentCommitSha === "commit-sha-1" ? "tree-sha-1" : "tree-sha-2",
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

      if (url.pathname === "/repos/acme/widget/contents/src/index.ts") {
        return makeJsonResponse({
          type: "file",
          path: "src/index.ts",
          sha: "blob-index",
          size: 61,
          encoding: "base64",
          content: encodeText([
            "export const entry = 'widget';",
            "export const mode = 'default';"
          ].join("\n") + "\n")
        });
      }

      throw new Error(`unexpected path: ${url.pathname}${url.search}`);
    }
  });

  const openRouter = createMockOpenRouterClient({
    createChatCompletion: async (request, selection) => {
      currentCommitSha = "commit-sha-2";
      assert.equal(selection.publicModelId, "default");
      assert.equal(request.stream, false);

      return {
        model: selection.publicModelId,
        text: JSON.stringify({
          summary: "Update the widget flow",
          rationale: "Refresh the widget flow while the repo state is still reviewable.",
          riskLevel: "medium_surface",
          files: [
            {
              path: "src/index.ts",
              changeType: "modified",
              afterContent: [
                "export const entry = 'widget';",
                "export const mode = 'refreshed';"
              ].join("\n") + "\n"
            }
          ]
        })
      };
    }
  });

  const app = createApp({
    env: createTestEnv(),
    openRouter,
    githubConfig,
    githubClient,
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/github/actions/propose",
    headers: {
      cookie: TEST_SESSION_COOKIE
    },
    payload: {
      repo: {
        owner: "acme",
        repo: "widget"
      },
      objective: "Update the widget flow",
      ref: "main",
      selectedPaths: ["src/index.ts"]
    }
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(JSON.parse(response.body), {
    ok: false,
    error: {
      code: "github_stale_plan",
      message: "GitHub plan is stale and must be refreshed"
    }
  });
});

test("github proposal routes fail closed for missing plans and invalid proposal payloads", async (t) => {
  const githubConfig = createTestGitHubConfig({
    allowedRepos: ["acme/widget"],
    allowedRepoSet: new Set(["acme/widget"])
  });

  const githubClient = createGitHubClient({
    config: githubConfig,
    fetchImpl: async () => {
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

  const invalidResponse = await app.inject({
    method: "POST",
    url: "/api/github/actions/propose",
    headers: {
      cookie: TEST_SESSION_COOKIE
    },
    payload: {
      repo: {
        owner: "acme",
        repo: "widget"
      },
      objective: "",
      selectedPaths: ["../secret"]
    }
  });

  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(JSON.parse(invalidResponse.body), {
    ok: false,
    error: {
      code: "invalid_request",
      message: "Invalid GitHub request"
    }
  });

  const missingPlanResponse = await app.inject({
    method: "GET",
    url: "/api/github/actions/plan_missing",
    headers: {
      cookie: TEST_SESSION_COOKIE
    }
  });

  assert.equal(missingPlanResponse.statusCode, 404);
  assert.deepEqual(JSON.parse(missingPlanResponse.body), {
    ok: false,
    error: {
      code: "github_plan_not_found",
      message: "GitHub plan was not found"
    }
  });
});

test("github proposal routes reject malformed model drafts", async (t) => {
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

      if (url.pathname === "/repos/acme/widget/contents/src/index.ts") {
        return makeJsonResponse({
          type: "file",
          path: "src/index.ts",
          sha: "blob-index",
          size: 61,
          encoding: "base64",
          content: encodeText([
            "export const entry = 'widget';",
            "export const mode = 'default';"
          ].join("\n") + "\n")
        });
      }

      throw new Error(`unexpected path: ${url.pathname}${url.search}`);
    }
  });

  const app = createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient({
      createChatCompletion: async () => ({
        model: "default",
        text: [
          "Here is the plan:",
          "{",
          '  "summary": "Update the widget flow",',
          '  "rationale": "Keep it simple",',
          '  "riskLevel": "medium_surface",',
          '  "files": [',
          '    {',
          '      "path": "src/index.ts",',
          '      "changeType": "modified",',
          '      "afterContent": "export const mode = \'refreshed\';\\n"',
          "    }",
          "  ]",
          "}",
          "Thanks."
        ].join("\n")
      })
    }),
    githubConfig,
    githubClient,
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/github/actions/propose",
    headers: {
      cookie: TEST_SESSION_COOKIE
    },
    payload: {
      repo: {
        owner: "acme",
        repo: "widget"
      },
      objective: "Update the widget flow",
      ref: "main",
      selectedPaths: ["src/index.ts"]
    }
  });

  assert.equal(response.statusCode, 422);
  assert.deepEqual(JSON.parse(response.body), {
    ok: false,
    error: {
      code: "github_patch_invalid",
      message: "GitHub proposal response was invalid"
    }
  });
});

test("github proposal routes return 429 and skip OpenRouter when rate-limited", async (t) => {
  let openRouterCalls = 0;
  const githubConfig = createTestGitHubConfig({
    allowedRepos: ["acme/widget"],
    allowedRepoSet: new Set(["acme/widget"]),
    planTtlMs: 60_000
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
          sha: "commit-sha-1",
          commit: {
            tree: {
              sha: "tree-sha-1"
            }
          }
        });
      }

      if (url.pathname === "/repos/acme/widget/git/trees/tree-sha-1") {
        return makeJsonResponse({
          sha: "tree-sha-1",
          truncated: false,
          tree: [
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

      if (url.pathname === "/repos/acme/widget/contents/README.md") {
        return makeJsonResponse({
          type: "file",
          path: "README.md",
          sha: "blob-readme",
          size: 70,
          encoding: "base64",
          content: encodeText("widget repo\n")
        });
      }

      throw new Error(`unexpected path: ${url.pathname}${url.search}`);
    }
  });

  const openRouter = createMockOpenRouterClient({
    createChatCompletion: async (request, selection) => {
      openRouterCalls += 1;
      return {
        model: selection.publicModelId,
        text: JSON.stringify({
          summary: request.messages[0]?.content.includes("INPUT:") ? "Update widget" : "Update",
          rationale: "Keep it reviewable.",
          riskLevel: "low_surface",
          files: [
            {
              path: "README.md",
              changeType: "modified",
              afterContent: "widget repo updated\n"
            }
          ]
        })
      };
    }
  });

  const app = createApp({
    env: createTestEnv({
      RATE_LIMIT_WINDOW_MS: 60_000,
      RATE_LIMIT_GITHUB_PROPOSE_MAX: 1
    }),
    openRouter,
    githubConfig,
    githubClient,
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const firstResponse = await app.inject({
    method: "POST",
    url: "/api/github/actions/propose",
    headers: {
      cookie: TEST_SESSION_COOKIE
    },
    payload: {
      repo: {
        owner: "acme",
        repo: "widget"
      },
      objective: "Update widget",
      ref: "main",
      selectedPaths: ["README.md"]
    }
  });
  assert.equal(firstResponse.statusCode, 200);

  const secondResponse = await app.inject({
    method: "POST",
    url: "/api/github/actions/propose",
    headers: {
      cookie: TEST_SESSION_COOKIE
    },
    payload: {
      repo: {
        owner: "acme",
        repo: "widget"
      },
      objective: "Update widget again",
      ref: "main",
      selectedPaths: ["README.md"]
    }
  });

  assert.equal(secondResponse.statusCode, 429);
  assert.equal(secondResponse.headers["retry-after"], "60");
  assert.deepEqual(JSON.parse(secondResponse.body), {
    ok: false,
    error: {
      code: "github_rate_limited",
      message: "GitHub rate limit was hit",
      retryAfterSeconds: 60
    }
  });
  assert.equal(openRouterCalls, 1);
});
