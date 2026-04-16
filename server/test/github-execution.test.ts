import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import { createGitHubClient } from "../src/lib/github-client.js";
import { createTestEnv, createMockOpenRouterClient, createTestGitHubConfig } from "../test-support/helpers.js";

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

        assert.equal(body.message, `ModelGate plan ${plannedBranchName.slice(plannedBranchName.lastIndexOf("/") + 1)}`);
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
              sha: "commit-sha-1"
            },
            mergeable: true,
            draft: false,
            title: `ModelGate plan ${plannedBranchName.slice(plannedBranchName.lastIndexOf("/") + 1)}`,
            body: "ModelGate approval-gated proposal"
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
  plannedBranchName = `modelgate/github/${proposeBody.plan.planId}`;

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
    }
  });

  const executeResponse = await app.inject({
    method: "POST",
    url: `/api/github/actions/${proposeBody.plan.planId}/execute`,
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

test("github execution routes fail closed when the repository becomes stale before execution", async (t) => {
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

  const app = createApp({
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
  });

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
    planTtlMs: 60_000
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

      if (url.pathname.startsWith("/repos/acme/widget/git/ref/heads%2Fmodelgate%2Fgithub%2Fplan_")) {
        return makeJsonResponse({
          ref: "heads/modelgate/github/plan_1",
          url: "https://api.github.com/repos/acme/widget/git/refs/heads/modelgate/github/plan_1",
          object: {
            sha: "commit-sha-other",
            type: "commit"
          }
        });
      }

      throw new Error(`unexpected path: ${url.pathname}${url.search}`);
    }
  });

  const app = createApp({
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
  });

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
    payload: {
      approval: true
    }
  });

  assert.equal(executeResponse.statusCode, 409);
  assert.deepEqual(JSON.parse(executeResponse.body), {
    ok: false,
    error: {
      code: "github_branch_conflict",
      message: `GitHub branch already exists with a different head: modelgate/github/${planId}`
    }
  });
});
