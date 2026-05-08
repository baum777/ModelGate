import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import { createInMemoryGitHubActionStore } from "../src/lib/github-action-store.js";
import { createGitHubClient } from "../src/lib/github-client.js";
import { createTestEnv, createMockOpenRouterClient, createTestGitHubConfig, createTestSessionCookie, withTestSession } from "../test-support/helpers.js";

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

const TEST_ADMIN_KEY = "test-github-admin-key";
const TEST_SESSION_COOKIE = createTestSessionCookie();

function injectWithSession(
  app: {
    inject: (request: {
      method: string;
      url: string;
      headers?: Record<string, string>;
      payload?: unknown;
    }) => Promise<{ statusCode: number; body: string }>;
  },
  request: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    payload?: unknown;
  }
) {
  return app.inject({
    ...request,
    headers: {
      cookie: TEST_SESSION_COOKIE,
      ...(request.headers ?? {})
    }
  });
}

function createPolicyTestPlan(options: {
  planId: string;
  mode?: "smoke";
  routingMetadata?: {
    workflowRole: "github_code_agent";
    selectedModel: string;
    candidateModels: string[];
    fallbackUsed: boolean;
    selectionSource: "env" | "legacy_openrouter_model" | "fallback_env" | "recommended_model";
    routingMode: "policy";
    allowFallback: boolean;
    failClosed: boolean;
    structuredOutputRequired: boolean;
    approvalRequired: boolean;
    mayExecuteExternalTools: boolean;
    mayWriteExternalState: boolean;
    policySectionKey: string | null;
    recordedAt: string;
  };
}) {
  return {
    planId: options.planId,
    repo: {
      owner: "acme",
      repo: "widget",
      fullName: "acme/widget",
      defaultBranch: "main",
      defaultBranchSha: "commit-sha-1",
      description: "Widget repo",
      isPrivate: false,
      status: "ready" as const,
      permissions: { canWrite: true },
      checkedAt: "2026-01-01T00:00:00.000Z"
    },
    baseRef: "main",
    baseSha: "commit-sha-1",
    branchName: `mosaicstacked/github/${options.planId}`,
    targetBranch: "main",
    status: "pending_review" as const,
    stale: false,
    requiresApproval: true as const,
    summary: "Policy test plan",
    rationale: "Policy test rationale",
    riskLevel: "low_surface" as const,
    citations: [],
    diff: [],
    generatedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-01T00:12:00.000Z",
    ...(options.routingMetadata ? { routingMetadata: options.routingMetadata } : {}),
    request: {
      repo: {
        owner: "acme",
        repo: "widget"
      },
      objective: "Policy execute test objective",
      baseBranch: "main",
      ...(options.mode ? { mode: options.mode } : {})
    },
    context: {
      repo: {
        owner: "acme",
        repo: "widget",
        fullName: "acme/widget",
        defaultBranch: "main",
        defaultBranchSha: "commit-sha-1",
        description: "Widget repo",
        isPrivate: false,
        status: "ready" as const,
        permissions: { canWrite: true },
        checkedAt: "2026-01-01T00:00:00.000Z"
      },
      ref: "main",
      baseSha: "commit-sha-1",
      question: "Policy execute test",
      files: [],
      citations: [],
      tokenBudget: {
        maxTokens: 0,
        usedTokens: 0,
        truncated: false
      },
      warnings: [],
      generatedAt: "2026-01-01T00:00:00.000Z"
    }
  };
}

function createSafeRoutingMetadata() {
  return {
    workflowRole: "github_code_agent" as const,
    selectedModel: "qwen/qwen3-coder:free",
    candidateModels: ["qwen/qwen3-coder:free"],
    fallbackUsed: false,
    selectionSource: "env" as const,
    routingMode: "policy" as const,
    allowFallback: true,
    failClosed: true,
    structuredOutputRequired: true,
    approvalRequired: true,
    mayExecuteExternalTools: false,
    mayWriteExternalState: false,
    policySectionKey: "github_code_agent",
    recordedAt: "2026-01-01T00:00:00.000Z"
  };
}

test("github execution routes create a branch, commit, pull request, and verify the result", async (t) => {
  let currentCommitSha = "commit-sha-1";
  let branchExists = false;
  let pullRequestCreated = false;
  let plannedBranchName = "";
  const fetchCalls: string[] = [];

  const openRouter = createMockOpenRouterClient({
    createChatCompletion: async (_request, selection) => {
      assert.equal(selection.publicModelId, "default");

      return {
        model: selection.publicModelId,
        text: JSON.stringify({
          summary: "Update the widget flow",
          rationale: "Keep the widget flow reviewable and safe.",
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
    planTtlMs: 60_000,
    agentApiKey: TEST_ADMIN_KEY
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
              sha: currentCommitSha === "commit-sha-1" ? "tree-sha-1" : "tree-sha-exec"
            }
          }
        });
      }

      if (url.pathname === "/repos/acme/widget/commits/commit-sha-1") {
        return makeJsonResponse({
          sha: "commit-sha-1",
          commit: {
            tree: {
              sha: "tree-sha-1"
            }
          }
        });
      }

      if (url.pathname === "/repos/acme/widget/git/trees/tree-sha-1" || url.pathname === "/repos/acme/widget/git/trees/tree-sha-exec") {
        return makeJsonResponse({
          sha: currentCommitSha === "commit-sha-1" ? "tree-sha-1" : "tree-sha-exec",
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

      if (url.pathname.startsWith("/repos/acme/widget/git/ref/heads%2F")) {
        if (!branchExists || url.pathname !== `/repos/acme/widget/git/ref/${encodeURIComponent(`heads/${plannedBranchName}`)}`) {
          return new Response("not found", {
            status: 404,
            headers: {
              "Content-Type": "text/plain"
            }
          });
        }

        return makeJsonResponse({
          ref: `heads/${plannedBranchName}`,
          url: `https://api.github.com/repos/acme/widget/git/refs/heads/${plannedBranchName}`,
          object: {
            sha: "commit-sha-exec",
            type: "commit"
          }
        });
      }

      if (url.pathname === "/repos/acme/widget/git/trees" && (init?.method ?? "GET") === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          base_tree: string;
          tree: Array<{ path: string; mode: string; type: string; content: string }>;
        };

        assert.equal(body.base_tree, "tree-sha-1");
        assert.deepEqual(body.tree.map((entry) => entry.path), [
          "src/index.ts",
          "src/utils.ts"
        ]);

        return makeJsonResponse({
          sha: "tree-sha-exec"
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

        assert.equal(body.message, `MosaicStacked plan ${plannedBranchName.slice(plannedBranchName.lastIndexOf("/") + 1)}`);
        assert.equal(body.tree, "tree-sha-exec");
        assert.deepEqual(body.parents, ["commit-sha-1"]);

        return makeJsonResponse({
          sha: "commit-sha-exec",
          tree: {
            sha: "tree-sha-exec"
          }
        });
      }

      if (url.pathname === "/repos/acme/widget/git/refs" && (init?.method ?? "GET") === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { ref: string; sha: string };

        assert.equal(body.ref, `refs/heads/${plannedBranchName}`);
        assert.equal(body.sha, "commit-sha-exec");
        branchExists = true;

        return makeJsonResponse({
          ref: `refs/heads/${plannedBranchName}`,
          url: `https://api.github.com/repos/acme/widget/git/refs/heads/${plannedBranchName}`,
          object: {
            sha: "commit-sha-exec",
            type: "commit"
          }
        });
      }

      if (url.pathname.startsWith("/repos/acme/widget/git/refs/heads%2F") && (init?.method ?? "GET") === "PATCH") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { sha: string; force: boolean };

        assert.equal(body.sha, "commit-sha-exec");
        assert.equal(body.force, false);
        branchExists = true;

        return makeJsonResponse({
          ref: `refs/heads/${plannedBranchName}`,
          url: `https://api.github.com/repos/acme/widget/git/refs/heads/${plannedBranchName}`,
          object: {
            sha: "commit-sha-exec",
            type: "commit"
          }
        });
      }

      if (url.pathname.startsWith("/repos/acme/widget/git/ref/heads%2Fmosaicstacked%2Fgithub%2F") && (init?.method ?? "GET") === "GET") {
        return new Response("not found", {
          status: 404,
          headers: {
            "Content-Type": "text/plain"
          }
        });
      }

      if (url.pathname === "/repos/acme/widget/pulls" && (init?.method ?? "GET") === "GET") {
        assert.equal(url.searchParams.get("state"), "all");
        assert.equal(url.searchParams.get("base"), "main");

        if (url.searchParams.get("head") !== `acme:${plannedBranchName}`) {
          return makeJsonResponse([]);
        }

        if (!pullRequestCreated) {
          return makeJsonResponse([]);
        }

        return makeJsonResponse([
          {
            number: 12,
            html_url: "https://github.com/acme/widget/pull/12",
            state: "open",
            head: {
              ref: plannedBranchName,
              sha: "commit-sha-exec"
            },
            base: {
              ref: "main",
              sha: "commit-sha-1"
            },
            mergeable: true,
            draft: false,
            title: `MosaicStacked plan ${plannedBranchName.slice(plannedBranchName.lastIndexOf("/") + 1)}`,
            body: "MosaicStacked approval-gated proposal"
          }
        ]);
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

        assert.equal(body.head, plannedBranchName);
        assert.equal(body.base, "main");
        assert.equal(body.draft, false);
        assert.equal(body.maintainer_can_modify, false);
        pullRequestCreated = true;

        return makeJsonResponse({
          number: 12,
          html_url: "https://github.com/acme/widget/pull/12",
          state: "open",
          head: {
            ref: plannedBranchName,
            sha: "commit-sha-exec"
          },
          base: {
            ref: "main",
            sha: "commit-sha-1"
          },
          mergeable: true,
          draft: false,
          title: body.title,
          body: body.body
        });
      }

      return new Response("not found", {
        status: 404,
        headers: {
          "Content-Type": "text/plain"
        }
      });
    }
  });

  const app = withTestSession(createApp({
    env: createTestEnv(),
    openRouter,
    githubConfig,
    githubClient,
    logger: false
  }));

  t.after(async () => {
    await app.close();
  });

  const proposeResponse = await app.inject({
    method: "POST",
    url: "/api/github/actions/propose",
    payload: {
      repo: {
        owner: "acme",
        repo: "widget"
      },
      objective: "Update the widget flow",
      ref: "main",
      selectedPaths: ["src/index.ts", "src/utils.ts"]
    }
  });

  assert.equal(proposeResponse.statusCode, 200);
  const proposeBody = JSON.parse(proposeResponse.body) as {
    ok: true;
    plan: {
      planId: string;
      branchName: string;
    };
  };
  plannedBranchName = `mosaicstacked/github/${proposeBody.plan.planId}`;

  const pendingVerifyResponse = await app.inject({
    method: "GET",
    url: `/api/github/actions/${proposeBody.plan.planId}/verify`
  });

  assert.equal(pendingVerifyResponse.statusCode, 200);
  const pendingVerifyBody = JSON.parse(pendingVerifyResponse.body) as {
    ok: true;
    verification: {
      checkedAt: string;
    };
  };
  assert.deepEqual(pendingVerifyBody, {
    ok: true,
    verification: {
      planId: proposeBody.plan.planId,
      status: "pending",
      checkedAt: pendingVerifyBody.verification.checkedAt,
      branchName: plannedBranchName,
      targetBranch: "main",
      expectedBaseSha: "commit-sha-1",
      actualBaseSha: "commit-sha-1",
      expectedCommitSha: null,
      actualCommitSha: null,
      prNumber: null,
      prUrl: null,
      mismatchReasons: ["The plan has not been executed yet"]
    },
    credentialSource: "instance_config"
  });

  const executeResponse = await app.inject({
    method: "POST",
    url: `/api/github/actions/${proposeBody.plan.planId}/execute`,
    headers: {
      "x-mosaicstacked-admin-key": TEST_ADMIN_KEY
    },
    payload: {
      approval: true
    }
  });

  assert.equal(executeResponse.statusCode, 200);
  const executeBody = JSON.parse(executeResponse.body) as {
    ok: true;
    result: {
      planId: string;
      status: string;
      branchName: string;
      baseSha: string;
      headSha: string;
      commitSha: string;
      prNumber: number;
      prUrl: string;
      targetBranch: string;
      executedAt: string;
    };
  };

  assert.equal(executeBody.ok, true);
  assert.equal(executeBody.result.planId, proposeBody.plan.planId);
  assert.equal(executeBody.result.status, "executed");
  assert.equal(executeBody.result.branchName, plannedBranchName);
  assert.equal(executeBody.result.baseSha, "commit-sha-1");
  assert.equal(executeBody.result.headSha, "commit-sha-exec");
  assert.equal(executeBody.result.commitSha, "commit-sha-exec");
  assert.equal(executeBody.result.prNumber, 12);
  assert.equal(executeBody.result.prUrl, "https://github.com/acme/widget/pull/12");
  assert.equal(executeBody.result.targetBranch, "main");

  const planResponse = await app.inject({
    method: "GET",
    url: `/api/github/actions/${proposeBody.plan.planId}`
  });

  assert.equal(planResponse.statusCode, 200);
  const planBody = JSON.parse(planResponse.body) as {
    ok: true;
    plan: {
      status: string;
      execution: {
        prNumber: number;
      };
    };
  };
  assert.equal(planBody.plan.status, "executed");
  assert.equal(planBody.plan.execution?.prNumber, 12);

  const retryExecuteResponse = await app.inject({
    method: "POST",
    url: `/api/github/actions/${proposeBody.plan.planId}/execute`,
    headers: {
      "x-mosaicstacked-admin-key": TEST_ADMIN_KEY
    },
    payload: {
      approval: true
    }
  });

  assert.equal(retryExecuteResponse.statusCode, 200);
  assert.deepEqual(JSON.parse(retryExecuteResponse.body).result, executeBody.result);

  const verifiedResponse = await app.inject({
    method: "GET",
    url: `/api/github/actions/${proposeBody.plan.planId}/verify`
  });

  assert.equal(verifiedResponse.statusCode, 200);
  const verifiedBody = JSON.parse(verifiedResponse.body) as {
    ok: true;
    verification: {
      status: string;
      expectedCommitSha: string;
      actualCommitSha: string;
      prNumber: number;
    };
  };
  assert.equal(verifiedBody.verification.status, "verified");
  assert.equal(verifiedBody.verification.expectedCommitSha, "commit-sha-exec");
  assert.equal(verifiedBody.verification.actualCommitSha, "commit-sha-exec");
  assert.equal(verifiedBody.verification.prNumber, 12);

  assert.ok(fetchCalls.some((call) => call.startsWith("/repos/acme/widget/git/trees")));
  assert.ok(fetchCalls.includes("/repos/acme/widget/git/commits"));
});

test("github execution routes support deterministic smoke plans with added files", async (t) => {
  let branchExists = false;
  let pullRequestCreated = false;
  let plannedBranchName = "";
  const fetchCalls: string[] = [];

  const openRouter = createMockOpenRouterClient({
    createChatCompletion: async () => {
      throw new Error("LLM should not be called for smoke plans");
    }
  });

  const githubConfig = createTestGitHubConfig({
    allowedRepos: ["acme/widget"],
    allowedRepoSet: new Set(["acme/widget"]),
    planTtlMs: 60_000,
    agentApiKey: TEST_ADMIN_KEY
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
          sha: "commit-sha-smoke",
          commit: {
            tree: {
              sha: "tree-sha-smoke"
            }
          }
        });
      }

      if (url.pathname === "/repos/acme/widget/commits/commit-sha-smoke") {
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

      if (url.pathname === "/repos/acme/widget/contents/docs/mosaicstacked-smoke.md") {
        return new Response("not found", {
          status: 404,
          headers: {
            "Content-Type": "text/plain"
          }
        });
      }

      if (url.pathname === `/repos/acme/widget/git/ref/${encodeURIComponent(`heads/${plannedBranchName}`)}`) {
        if (!branchExists) {
          return new Response("not found", {
            status: 404,
            headers: {
              "Content-Type": "text/plain"
            }
          });
        }

        return makeJsonResponse({
          ref: `heads/${plannedBranchName}`,
          url: `https://api.github.com/repos/acme/widget/git/refs/heads/${plannedBranchName}`,
          object: {
            sha: "commit-sha-exec",
            type: "commit"
          }
        });
      }

      if (url.pathname === "/repos/acme/widget/git/trees" && (init?.method ?? "GET") === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          base_tree: string;
          tree: Array<{ path: string; mode: string; type: string; content: string }>;
        };

        assert.equal(body.base_tree, "tree-sha-smoke");
        assert.deepEqual(body.tree.map((entry) => entry.path), [
          "docs/mosaicstacked-smoke.md"
        ]);
        assert.equal(body.tree[0]?.mode, "100644");
        assert.match(body.tree[0]?.content ?? "", /# MosaicStacked smoke/);
        assert.match(body.tree[0]?.content ?? "", /Intent: smoke execute against a dedicated target branch/);

        return makeJsonResponse({
          sha: "tree-sha-exec"
        });
      }

      if (url.pathname === "/repos/acme/widget/git/commits" && (init?.method ?? "GET") === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          message: string;
          tree: string;
          parents: string[];
        };

        assert.match(body.message, /^MosaicStacked plan /);
        assert.equal(body.tree, "tree-sha-exec");
        assert.deepEqual(body.parents, ["commit-sha-smoke"]);

        return makeJsonResponse({
          sha: "commit-sha-exec",
          tree: {
            sha: "tree-sha-exec"
          }
        });
      }

      if (url.pathname === "/repos/acme/widget/git/refs" && (init?.method ?? "GET") === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { ref: string; sha: string };

        assert.equal(body.ref, `refs/heads/${plannedBranchName}`);
        assert.equal(body.sha, "commit-sha-exec");
        branchExists = true;

        return makeJsonResponse({
          ref: `heads/${plannedBranchName}`,
          url: `https://api.github.com/repos/acme/widget/git/refs/heads/${plannedBranchName}`,
          object: {
            sha: "commit-sha-exec",
            type: "commit"
          }
        });
      }

      if (url.pathname.startsWith("/repos/acme/widget/git/refs/heads%2F") && (init?.method ?? "GET") === "PATCH") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { sha: string; force: boolean };

        assert.equal(body.sha, "commit-sha-exec");
        assert.equal(body.force, false);
        branchExists = true;

        return makeJsonResponse({
          ref: `heads/${plannedBranchName}`,
          url: `https://api.github.com/repos/acme/widget/git/refs/heads/${plannedBranchName}`,
          object: {
            sha: "commit-sha-exec",
            type: "commit"
          }
        });
      }

      if (url.pathname === "/repos/acme/widget/pulls" && (init?.method ?? "GET") === "GET") {
        assert.equal(url.searchParams.get("state"), "all");
        assert.equal(url.searchParams.get("head"), `acme:${plannedBranchName}`);
        assert.equal(url.searchParams.get("base"), "main");

        if (!pullRequestCreated) {
          return makeJsonResponse([]);
        }

        return makeJsonResponse([
          {
            number: 12,
            html_url: "https://github.com/acme/widget/pull/12",
            state: "open",
            head: {
              ref: plannedBranchName,
              sha: "commit-sha-exec"
            },
            base: {
              ref: "main",
              sha: "commit-sha-smoke"
            },
            mergeable: true,
            draft: false,
            title: `MosaicStacked plan ${plannedBranchName.slice(plannedBranchName.lastIndexOf("/") + 1)}`,
            body: "MosaicStacked approval-gated proposal"
          }
        ]);
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

        assert.equal(body.head, plannedBranchName);
        assert.equal(body.base, "main");
        assert.equal(body.draft, false);
        assert.equal(body.maintainer_can_modify, false);
        pullRequestCreated = true;

        return makeJsonResponse({
          number: 12,
          html_url: "https://github.com/acme/widget/pull/12",
          state: "open",
          head: {
            ref: plannedBranchName,
            sha: "commit-sha-exec"
          },
          base: {
            ref: "main",
            sha: "commit-sha-smoke"
          },
          mergeable: true,
          draft: false,
          title: body.title,
          body: body.body
        });
      }

      return new Response("not found", {
        status: 404,
        headers: {
          "Content-Type": "text/plain"
        }
      });
    }
  });

  const app = withTestSession(createApp({
    env: createTestEnv(),
    openRouter,
    githubConfig,
    githubClient,
    logger: false
  }));

  t.after(async () => {
    await app.close();
  });

  const proposeResponse = await app.inject({
    method: "POST",
    url: "/api/github/actions/propose",
    payload: {
      repo: {
        owner: "acme",
        repo: "widget"
      },
      objective: "Smoke the GitHub proposal flow",
      baseBranch: "main",
      targetBranch: "mosaicstacked/github-smoke",
      mode: "smoke",
      intent: "smoke execute against a dedicated target branch"
    }
  });

  assert.equal(proposeResponse.statusCode, 200);
  const proposeBody = JSON.parse(proposeResponse.body) as {
    ok: true;
    plan: {
      planId: string;
      branchName: string;
      targetBranch: string;
      diff: Array<{ path: string; changeType: string; patch: string }>;
    };
  };
  plannedBranchName = `mosaicstacked/github-smoke/${proposeBody.plan.planId}`;

  const executeResponse = await app.inject({
    method: "POST",
    url: `/api/github/actions/${proposeBody.plan.planId}/execute`,
    headers: {
      "x-mosaicstacked-admin-key": TEST_ADMIN_KEY
    },
    payload: {
      approval: true
    }
  });

  assert.equal(executeResponse.statusCode, 200);
  const executeBody = JSON.parse(executeResponse.body) as {
    ok: true;
    result: {
      planId: string;
      branchName: string;
      baseSha: string;
      headSha: string;
      commitSha: string;
      prNumber: number;
      prUrl: string;
      targetBranch: string;
    };
  };
  assert.equal(executeBody.result.planId, proposeBody.plan.planId);
  assert.equal(executeBody.result.branchName, plannedBranchName);
  assert.equal(executeBody.result.baseSha, "commit-sha-smoke");
  assert.equal(executeBody.result.headSha, "commit-sha-exec");
  assert.equal(executeBody.result.commitSha, "commit-sha-exec");
  assert.equal(executeBody.result.prNumber, 12);
  assert.equal(executeBody.result.prUrl, "https://github.com/acme/widget/pull/12");
  assert.equal(executeBody.result.targetBranch, "main");

  const verificationApp = withTestSession(createApp({
    env: createTestEnv(),
    openRouter,
    githubConfig,
    githubClient,
    logger: false
  }));

  t.after(async () => {
    await verificationApp.close();
  });

  const verifyResponse = await verificationApp.inject({
    method: "GET",
    url: `/api/github/actions/${proposeBody.plan.planId}/verify`
  });

  assert.equal(verifyResponse.statusCode, 200);
  const verifyBody = JSON.parse(verifyResponse.body) as {
    ok: true;
    verification: {
      status: string;
      branchName: string;
      targetBranch: string;
      prNumber: number;
    };
  };
  assert.equal(verifyBody.verification.status, "verified");
  assert.equal(verifyBody.verification.branchName, plannedBranchName);
  assert.equal(verifyBody.verification.targetBranch, "main");
  assert.equal(verifyBody.verification.prNumber, 12);

  assert.deepEqual(proposeBody.plan.diff.map((file) => file.path), [
    "docs/mosaicstacked-smoke.md"
  ]);
  assert.equal(proposeBody.plan.diff[0]?.changeType, "added");
  assert.match(proposeBody.plan.diff[0]?.patch ?? "", /@@ reviewable addition @@/);
  assert.ok(fetchCalls.some((call) => call.startsWith("/repos/acme/widget/git/trees")));
  assert.ok(fetchCalls.some((call) => call.startsWith("/repos/acme/widget/pulls")));
});

test("github execution routes reject missing or invalid admin keys before touching plan state", async (t) => {
  const githubConfig = createTestGitHubConfig({
    allowedRepos: ["acme/widget"],
    allowedRepoSet: new Set(["acme/widget"]),
    agentApiKey: TEST_ADMIN_KEY
  });

  const app = withTestSession(createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient(),
    githubConfig,
    logger: false
  }));

  t.after(async () => {
    await app.close();
  });

  const missingKeyResponse = await app.inject({
    method: "POST",
    url: "/api/github/actions/plan_missing/execute",
    payload: {
      approval: true
    }
  });

  assert.equal(missingKeyResponse.statusCode, 401);
  assert.deepEqual(JSON.parse(missingKeyResponse.body), {
    ok: false,
    error: {
      code: "github_unauthorized",
      message: "GitHub credentials were rejected"
    }
  });

  const wrongKeyResponse = await app.inject({
    method: "POST",
    url: "/api/github/actions/plan_missing/execute",
    headers: {
      "x-mosaicstacked-admin-key": "wrong-key"
    },
    payload: {
      approval: true
    }
  });

  assert.equal(wrongKeyResponse.statusCode, 403);
  assert.deepEqual(JSON.parse(wrongKeyResponse.body), {
    ok: false,
    error: {
      code: "github_forbidden",
      message: "GitHub backend denied access"
    }
  });
});

test("github execution routes stay fail closed when GitHub is not configured", async (t) => {
  const app = withTestSession(createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient(),
    logger: false
  }));

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/github/actions/plan_missing/execute",
    payload: {
      approval: true
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

test("github execution routes fail closed when the repository becomes stale before execution", async (t) => {
  let currentCommitSha = "commit-sha-1";
  const githubConfig = createTestGitHubConfig({
    allowedRepos: ["acme/widget"],
    allowedRepoSet: new Set(["acme/widget"]),
    planTtlMs: 60_000,
    agentApiKey: TEST_ADMIN_KEY
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
              sha: "tree-sha-1"
            }
          }
        });
      }

      if (url.pathname === "/repos/acme/widget/commits/commit-sha-1") {
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

  const app = withTestSession(createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient({
      createChatCompletion: async (_request, selection) => ({
        model: selection.publicModelId,
        text: JSON.stringify({
          summary: "Update the widget flow",
          rationale: "Keep the widget flow reviewable and safe.",
          riskLevel: "medium_surface",
          files: [
            {
              path: "src/index.ts",
              changeType: "modified",
              afterContent: [
                "export const entry = 'widget';",
                "export const mode = 'flow';"
              ].join("\n") + "\n"
            }
          ]
        })
      })
    }),
    githubConfig,
    githubClient,
    logger: false
  }));

  t.after(async () => {
    await app.close();
  });

  const proposeResponse = await app.inject({
    method: "POST",
    url: "/api/github/actions/propose",
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

  assert.equal(proposeResponse.statusCode, 200);
  const planId = (JSON.parse(proposeResponse.body) as { ok: true; plan: { planId: string } }).plan.planId;
  currentCommitSha = "commit-sha-2";

  const executeResponse = await app.inject({
    method: "POST",
    url: `/api/github/actions/${planId}/execute`,
    headers: {
      "x-mosaicstacked-admin-key": TEST_ADMIN_KEY
    },
    payload: {
      approval: true
    }
  });

  assert.equal(executeResponse.statusCode, 409);
  assert.deepEqual(JSON.parse(executeResponse.body), {
    ok: false,
    error: {
      code: "github_stale_plan",
      message: `GitHub plan ${planId} is stale and must be refreshed`
    }
  });
});

test("github execution routes fail closed when the approved branch diverges", async (t) => {
  const githubConfig = createTestGitHubConfig({
    allowedRepos: ["acme/widget"],
    allowedRepoSet: new Set(["acme/widget"]),
    planTtlMs: 60_000,
    agentApiKey: TEST_ADMIN_KEY
  });

  const githubClient = createGitHubClient({
    config: githubConfig,
    fetchImpl: async (input, init) => {
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

      if (url.pathname === "/repos/acme/widget/commits/commit-sha-1") {
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

      if (url.pathname === "/repos/acme/widget/git/trees" && (init?.method ?? "GET") === "POST") {
        return makeJsonResponse({
          sha: "tree-sha-exec"
        });
      }

      if (url.pathname === "/repos/acme/widget/git/commits" && (init?.method ?? "GET") === "POST") {
        return makeJsonResponse({
          sha: "commit-sha-exec",
          tree: {
            sha: "tree-sha-exec"
          }
        });
      }

      if (url.pathname.startsWith("/repos/acme/widget/git/ref/heads%2Fmosaicstacked%2Fgithub%2Fplan_")) {
        return makeJsonResponse({
          ref: "heads/mosaicstacked/github/plan_1",
          url: "https://api.github.com/repos/acme/widget/git/refs/heads/mosaicstacked/github/plan_1",
          object: {
            sha: "commit-sha-other",
            type: "commit"
          }
        });
      }

      throw new Error(`unexpected path: ${url.pathname}${url.search}`);
    }
  });

  const app = withTestSession(createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient({
      createChatCompletion: async (_request, selection) => ({
        model: selection.publicModelId,
        text: JSON.stringify({
          summary: "Update the widget flow",
          rationale: "Keep the widget flow reviewable and safe.",
          riskLevel: "medium_surface",
          files: [
            {
              path: "src/index.ts",
              changeType: "modified",
              afterContent: [
                "export const entry = 'widget';",
                "export const mode = 'flow';"
              ].join("\n") + "\n"
            }
          ]
        })
      })
    }),
    githubConfig,
    githubClient,
    logger: false
  }));

  t.after(async () => {
    await app.close();
  });

  const proposeResponse = await app.inject({
    method: "POST",
    url: "/api/github/actions/propose",
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

  assert.equal(proposeResponse.statusCode, 200);
  const planId = (JSON.parse(proposeResponse.body) as { ok: true; plan: { planId: string } }).plan.planId;

  const executeResponse = await app.inject({
    method: "POST",
    url: `/api/github/actions/${planId}/execute`,
    headers: {
      "x-mosaicstacked-admin-key": TEST_ADMIN_KEY
    },
    payload: {
      approval: true
    }
  });

  assert.equal(executeResponse.statusCode, 409);
  assert.deepEqual(JSON.parse(executeResponse.body), {
    ok: false,
    error: {
      code: "github_branch_conflict",
      message: `GitHub branch already exists with a different head: mosaicstacked/github/${planId}`
    }
  });
});

test("github execution fails closed when routing metadata is missing for a non-smoke plan", async (t) => {
  const actionStore = createInMemoryGitHubActionStore(60_000, () => Date.now());
  const plan = createPolicyTestPlan({
    planId: "plan_missing_routing"
  });
  actionStore.createPlan(plan);

  let repoSummaryCalled = false;
  const githubClient = createGitHubClient({
    config: createTestGitHubConfig({
      agentApiKey: TEST_ADMIN_KEY
    }),
    fetchImpl: async () => {
      repoSummaryCalled = true;
      throw new Error("GitHub upstream should not be called when execute policy is blocked");
    }
  });

  const app = withTestSession(createApp({
    env: createTestEnv(),
    openRouter: createMockOpenRouterClient(),
    githubConfig: createTestGitHubConfig({
      agentApiKey: TEST_ADMIN_KEY
    }),
    githubClient,
    githubActionStore: actionStore,
    logger: false
  }));

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/github/actions/plan_missing_routing/execute",
    headers: {
      "x-mosaicstacked-admin-key": TEST_ADMIN_KEY
    },
    payload: {
      approval: true
    }
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(JSON.parse(response.body), {
    ok: false,
    error: {
      code: "github_execute_policy_blocked",
      message: "GitHub routing metadata is required before execute"
    }
  });
  assert.equal(repoSummaryCalled, false);
});

test("github execution fails closed for unsafe routing metadata and allows smoke plans without routing metadata", async (t) => {
  const actionStore = createInMemoryGitHubActionStore(60_000, () => Date.now());
  const unsafeCases = [
    {
      planId: "plan_fallback_used",
      metadata: {
        ...createSafeRoutingMetadata(),
        fallbackUsed: true
      },
      expectedMessage: "GitHub execute path does not allow fallback-routed proposals"
    },
    {
      planId: "plan_wrong_role",
      metadata: {
        ...createSafeRoutingMetadata(),
        workflowRole: "chat" as unknown as "github_code_agent"
      },
      expectedMessage: "GitHub routing workflow role is invalid for execute"
    },
    {
      planId: "plan_external_tools",
      metadata: {
        ...createSafeRoutingMetadata(),
        mayExecuteExternalTools: true
      },
      expectedMessage: "GitHub routing policy disallows external tool execution on execute"
    },
    {
      planId: "plan_external_writes",
      metadata: {
        ...createSafeRoutingMetadata(),
        mayWriteExternalState: true
      },
      expectedMessage: "GitHub routing policy disallows external state writes on execute"
    },
    {
      planId: "plan_no_approval",
      metadata: {
        ...createSafeRoutingMetadata(),
        approvalRequired: false
      },
      expectedMessage: "GitHub routing policy must require approval before execute"
    },
    {
      planId: "plan_no_structured_output",
      metadata: {
        ...createSafeRoutingMetadata(),
        structuredOutputRequired: false
      },
      expectedMessage: "GitHub routing policy must require structured output for execute"
    }
  ];

  for (const item of unsafeCases) {
    actionStore.createPlan(createPolicyTestPlan({
      planId: item.planId,
      routingMetadata: item.metadata as ReturnType<typeof createSafeRoutingMetadata>
    }));
  }

  actionStore.createPlan(createPolicyTestPlan({
    planId: "plan_smoke_without_routing",
    mode: "smoke"
  }));

  const githubConfig = createTestGitHubConfig({
    agentApiKey: TEST_ADMIN_KEY
  });
  let fetchCount = 0;
  const githubClient = createGitHubClient({
    config: githubConfig,
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error("GitHub upstream should not be called for policy-blocked tests");
    }
  });

  const app = withTestSession(createApp({
    env: createTestEnv({
      RATE_LIMIT_GITHUB_EXECUTE_MAX: 20
    }),
    openRouter: createMockOpenRouterClient(),
    githubConfig,
    githubClient,
    githubActionStore: actionStore,
    logger: false
  }));

  t.after(async () => {
    await app.close();
  });

  for (const item of unsafeCases) {
    const response = await app.inject({
      method: "POST",
      url: `/api/github/actions/${item.planId}/execute`,
      headers: {
        "x-mosaicstacked-admin-key": TEST_ADMIN_KEY
      },
      payload: {
        approval: true
      }
    });

    assert.equal(response.statusCode, 409);
    assert.deepEqual(JSON.parse(response.body), {
      ok: false,
      error: {
        code: "github_execute_policy_blocked",
        message: item.expectedMessage
      }
    });
  }

  const smokeResponse = await app.inject({
    method: "POST",
    url: "/api/github/actions/plan_smoke_without_routing/execute",
    headers: {
      "x-mosaicstacked-admin-key": TEST_ADMIN_KEY
    },
    payload: {
      approval: true
    }
  });

  const smokeBody = JSON.parse(smokeResponse.body) as { ok?: boolean; error?: { code?: string } };
  assert.notEqual(smokeBody.error?.code, "github_execute_policy_blocked");
  assert.equal(fetchCount, 1);
});

test("github execute returns 429 before GitHub writes when rate-limited", async (t) => {
  const actionStore = createInMemoryGitHubActionStore(60_000, () => Date.now());
  actionStore.createPlan(createPolicyTestPlan({
    planId: "plan_rate_limit_execute",
    routingMetadata: createSafeRoutingMetadata()
  }));

  let fetchCalls = 0;
  const githubConfig = createTestGitHubConfig({
    agentApiKey: TEST_ADMIN_KEY
  });
  const githubClient = createGitHubClient({
    config: githubConfig,
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("GitHub writes should not be called when execute is rate-limited");
    }
  });

  const app = withTestSession(createApp({
    env: createTestEnv({
      RATE_LIMIT_WINDOW_MS: 60_000,
      RATE_LIMIT_GITHUB_EXECUTE_MAX: 1
    }),
    openRouter: createMockOpenRouterClient(),
    githubConfig,
    githubClient,
    githubActionStore: actionStore,
    logger: false
  }));

  t.after(async () => {
    await app.close();
  });

  const consumeResponse = await app.inject({
    method: "POST",
    url: "/api/github/actions/plan_missing/execute",
    headers: {
      "x-mosaicstacked-admin-key": TEST_ADMIN_KEY
    },
    payload: {
      approval: true
    }
  });
  assert.equal(consumeResponse.statusCode, 404);

  const blockedResponse = await app.inject({
    method: "POST",
    url: "/api/github/actions/plan_rate_limit_execute/execute",
    headers: {
      "x-mosaicstacked-admin-key": TEST_ADMIN_KEY
    },
    payload: {
      approval: true
    }
  });

  assert.equal(blockedResponse.statusCode, 429);
  assert.equal(blockedResponse.headers["retry-after"], "60");
  assert.deepEqual(JSON.parse(blockedResponse.body), {
    ok: false,
    error: {
      code: "github_rate_limited",
      message: "GitHub rate limit was hit",
      retryAfterSeconds: 60
    }
  });
  assert.equal(fetchCalls, 0);
});
