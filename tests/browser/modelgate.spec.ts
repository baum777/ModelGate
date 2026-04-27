import { expect, test, type Page } from "@playwright/test";

const HEALTH_OK = {
  ok: true,
  service: "modelgate-test",
  mode: "local",
  upstream: "openrouter",
  defaultModel: "default",
  allowedModelCount: 1,
  streaming: "sse",
  accessToken: "sk-test-openrouter-key"
};

const MODELS_OK = {
  ok: true,
  defaultModel: "default",
  models: ["default"],
  source: "backend-policy",
  providerTarget: "openrouter/auto"
};

const MATRIX_WHOAMI_OK = {
  ok: true,
  userId: "@user:matrix.example",
  deviceId: "DEVICE",
  homeserver: "https://matrix.example",
  accessToken: "sk-test-matrix-token"
};

const MATRIX_ROOMS_OK = {
  ok: true,
  rooms: [
    {
      roomId: "!room:matrix.example",
      name: "Room name",
      canonicalAlias: "#room:matrix.example",
      roomType: "room",
      matrixAccessToken: "sk-test-matrix-token"
    }
  ]
};

const CHAT_SSE = [
  "event: start",
  'data: {"ok":true,"model":"default"}',
  "",
  "event: route",
  'data: {"ok":true,"route":{"selectedAlias":"default","taskClass":"chat","fallbackUsed":false,"degraded":false,"streaming":true}}',
  "",
  "event: token",
  'data: {"delta":"Hello from mocked backend"}',
  "",
  "event: done",
  'data: {"ok":true,"model":"default","text":"Hello from mocked backend","route":{"selectedAlias":"default","taskClass":"chat","fallbackUsed":false,"degraded":false,"streaming":true}}',
  ""
].join("\n");

type MatrixStatus = "ok" | "error" | "malformed";

type BaseMockOptions = {
  matrixStatus?: MatrixStatus;
  authAuthenticated?: boolean | (() => boolean);
};

async function installBaseMocks(page: Page, options: BaseMockOptions = {}) {
  await page.route("**/health", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(HEALTH_OK) });
  });

  await page.route("**/models", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MODELS_OK) });
  });

  await page.route("**/*diagnostics*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        backend: { status: "ok", version: "modelgate-test", mode: "policy" },
        routing: {
          activePolicy: "policy",
          failClosed: true,
          allowFallback: true,
          freeOnly: true,
          logEnabled: false,
          taskAliasMap: { chat: "gemma-4-31b:free", coding: "qwen3-coder:free", repo_review: "gpt-oss-120b:free" },
          fallbackChain: ["qwen3-next-80b:free", "llama-3.3-70b:free"]
        },
        github: { status: "ok", repoCount: 2, activeRepos: ["octo/demo", "octo/sample"], adminKeyConfigured: true, lastContextBuild: null },
        matrix: { status: "ok", enabled: true, required: false, failClosed: true, expectedUserConfigured: true, allowedActions: ["set_room_topic"], homeserverConfigured: true }
      })
    });
  });

  await page.route("**/api/auth/me", async (route) => {
    const authenticated = typeof options.authAuthenticated === "function"
      ? options.authAuthenticated()
      : options.authAuthenticated !== false;
    await route.fulfill({ status: authenticated ? 200 : 401, contentType: "application/json", body: JSON.stringify({ authenticated }) });
  });

  if (options.matrixStatus === "error") {
    await page.route("**/api/matrix/whoami", async (route) => {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "matrix_unavailable", message: "Matrix backend is unavailable" } }) });
    });
    await page.route("**/api/matrix/joined-rooms", async (route) => {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "matrix_unavailable", message: "Matrix backend is unavailable" } }) });
    });
    return;
  }

  if (options.matrixStatus === "malformed") {
    await page.route("**/api/matrix/whoami", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
    await page.route("**/api/matrix/joined-rooms", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, rooms: [{}] }) });
    });
    return;
  }

  await page.route("**/api/matrix/whoami", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MATRIX_WHOAMI_OK) });
  });
  await page.route("**/api/matrix/joined-rooms", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MATRIX_ROOMS_OK) });
  });
}

type GitHubMockOptions = {
  proposalStale?: boolean;
  executeStatus?: number;
};

async function installGitHubMocks(page: Page, options: GitHubMockOptions = {}) {
  const counters = { execute: 0, verify: 0 };

  await page.route("**/api/github/repos", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        checkedAt: "2026-04-16T08:00:00.000Z",
        repos: [
          repo("octo", "demo", "abc123", "Demo repository"),
          repo("octo", "sample", "def456", "Sample repository")
        ]
      })
    });
  });

  await page.route("**/api/github/context", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        context: {
          repo: repo("octo", "demo", "abc123", "Demo repository"),
          ref: "main",
          baseSha: "abc123",
          question: "Describe the project structure and name the safe next action.",
          files: [
            { path: "README.md", sha: "sha-readme", excerpt: "Demo", citations: [], truncated: false },
            { path: "web/src/App.tsx", sha: "sha-app", excerpt: "App", citations: [], truncated: false }
          ],
          citations: [],
          tokenBudget: { maxTokens: 1000, usedTokens: 100, truncated: false },
          warnings: [],
          generatedAt: "2026-04-16T08:00:00.000Z"
        }
      })
    });
  });

  await page.route("**/api/github/actions/propose", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        plan: {
          planId: "plan-123",
          repo: repo("octo", "demo", "abc123", "Demo repository"),
          baseRef: "main",
          baseSha: "abc123",
          branchName: "modelgate/demo-plan",
          targetBranch: "main",
          status: "pending_review",
          stale: Boolean(options.proposalStale),
          requiresApproval: true,
          summary: "Demo plan",
          rationale: "Only a sample plan.",
          riskLevel: "low_surface",
          citations: [],
          diff: [{ path: "README.md", changeType: "modified", beforeSha: "before", afterSha: "after", additions: 1, deletions: 1, patch: "@@ -1 +1 @@\n-Hello\n+Hello world", citations: [] }],
          generatedAt: "2026-04-16T08:00:00.000Z",
          expiresAt: "2026-04-16T09:00:00.000Z"
        }
      })
    });
  });

  await page.route("**/api/github/actions/plan-123/execute", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    counters.execute += 1;
    if (options.executeStatus && options.executeStatus !== 200) {
      await route.fulfill({ status: options.executeStatus, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "github_execution_failed", message: "Execution failed" } }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        result: { planId: "plan-123", status: "executed", branchName: "modelgate/demo-plan", baseSha: "abc123", headSha: "def456", commitSha: "def456", prNumber: 42, prUrl: "https://github.com/octo/demo/pull/42", targetBranch: "main", executedAt: "2026-04-16T08:30:00.000Z" }
      })
    });
  });

  await page.route("**/api/github/actions/plan-123/verify", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    counters.verify += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        verification: { planId: "plan-123", status: "verified", checkedAt: "2026-04-16T08:31:00.000Z", branchName: "modelgate/demo-plan", targetBranch: "main", expectedBaseSha: "abc123", actualBaseSha: "abc123", expectedCommitSha: "def456", actualCommitSha: "def456", prNumber: 42, prUrl: "https://github.com/octo/demo/pull/42", mismatchReasons: [] }
      })
    });
  });

  return counters;
}

function repo(owner: string, repoName: string, sha: string, description: string) {
  return {
    owner,
    repo: repoName,
    fullName: `${owner}/${repoName}`,
    defaultBranch: "main",
    defaultBranchSha: sha,
    description,
    isPrivate: false,
    status: "ready",
    permissions: { canWrite: false },
    checkedAt: "2026-04-16T08:00:00.000Z"
  };
}

async function installMatrixTopicMocks(page: Page, options: { expiredRefresh?: boolean; executeStale?: boolean } = {}) {
  await page.route("**/api/matrix/analyze", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        plan: {
          planId: "plan-topic",
          roomId: "!room:matrix.example",
          scopeId: null,
          snapshotId: null,
          status: "pending_review",
          actions: [{ type: "set_room_topic", roomId: "!room:matrix.example", currentValue: "Old topic", proposedValue: "New topic" }],
          currentValue: "Old topic",
          proposedValue: "New topic",
          risk: "low",
          requiresApproval: true,
          createdAt: "2026-04-15T08:00:00.000Z",
          expiresAt: "2026-04-15T08:12:00.000Z"
        }
      })
    });
  });

  await page.route("**/api/matrix/actions/plan-topic", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    if (options.expiredRefresh) {
      await route.fulfill({ status: 410, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "matrix_plan_expired", message: "Matrix plan is stale and must be refreshed" } }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        plan: { planId: "plan-topic", roomId: "!room:matrix.example", scopeId: null, snapshotId: null, status: "pending_review", actions: [{ type: "set_room_topic", roomId: "!room:matrix.example", currentValue: "Refreshed old topic", proposedValue: "Refreshed new topic" }], currentValue: "Refreshed old topic", proposedValue: "Refreshed new topic", risk: "low", requiresApproval: true, createdAt: "2026-04-15T08:00:00.000Z", expiresAt: "2026-04-15T08:20:00.000Z" }
      })
    });
  });

  await page.route("**/api/matrix/actions/plan-topic/execute", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    if (options.executeStale) {
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "matrix_stale_plan", message: "Matrix plan is stale and must be refreshed" } }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, result: { planId: "plan-topic", status: "executed", transactionId: "txn-topic-update", executedAt: "2026-04-15T08:01:00.000Z" } }) });
  });

  await page.route("**/api/matrix/actions/plan-topic/verify", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, verification: { planId: "plan-topic", status: "verified", checkedAt: "2026-04-15T08:01:30.000Z", expected: "New topic", actual: "New topic" } }) });
  });
}

async function loadConsole(page: Page) {
  await page.goto("/console", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("app-shell")).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("heading", { name: "ModelGate Console" })).toBeVisible();
  for (const tab of ["chat", "github", "matrix", "review", "settings"]) {
    await expect(page.getByTestId(`tab-${tab}`)).toBeVisible();
  }
}

async function openMatrix(page: Page) {
  await page.getByTestId("tab-matrix").click();
  await expect(page.getByTestId("matrix-workspace")).toBeVisible();
  await expect(page.getByTestId("matrix-status")).toHaveText("Ready");
  await expect(page.getByTestId("matrix-topic-update-panel")).toBeVisible();
  await expect(page.getByTestId("matrix-composer-panel")).toBeVisible();
  await expect(page.getByTestId("matrix-rooms")).toBeVisible();
}

async function prepareGitHubPlan(page: Page) {
  await page.getByTestId("tab-github").click();
  await page.locator("#github-repo-select").selectOption("octo/demo");
  await page.getByRole("button", { name: "Start analysis" }).click();
  await expect(page.getByText("README.md")).toBeVisible();
  await page.getByRole("button", { name: "Review proposal" }).click();
  await expect(page.getByTestId("github-approval-surface")).toContainText("Demo plan");
}

async function prepareMatrixPlan(page: Page) {
  await openMatrix(page);
  await page.getByTestId("matrix-topic-room-id").fill("!room:matrix.example");
  await page.getByTestId("matrix-topic-text").fill("New topic");
  await page.getByTestId("matrix-topic-update-panel").getByRole("button", { name: "Topic update" }).click();
  await expect(page.getByTestId("matrix-topic-plan")).toContainText("New topic");
}

test("console shell renders governed workspace navigation without leaking secrets", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);

  await expect(page.locator("nav.sidebar-nav")).toHaveAttribute("aria-label", "Workspaces");
  await expect(page.getByTestId("truth-rail-health")).toBeVisible();
  await expect(page.getByTestId("truth-rail-diagnostics")).toContainText("Beginner mode keeps diagnostics hidden");

  const body = page.locator("body");
  await expect(body).not.toContainText("openrouter/auto");
  await expect(body).not.toContainText("sk-test-openrouter-key");
  await expect(body).not.toContainText("sk-test-matrix-token");
});

test("root route renders public preview without console internals", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("public-preview")).toBeVisible();
  await expect(page.getByTestId("app-shell")).toHaveCount(0);
  const body = page.locator("body");
  await expect(body).not.toContainText("Diagnostics");
  await expect(body).not.toContainText("Public alias");
  await expect(body).not.toContainText("Workspaces");
});

test("console query alias renders the governed shell", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await page.goto("/?console=1", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("app-shell")).toBeVisible();
  await expect(page.getByTestId("tab-chat")).toBeVisible();
});

test("Routing inspector is Expert-only and fails closed without browser credentials", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);

  await expect(page.getByTestId("tab-routing")).toHaveCount(0);
  await page.getByRole("button", { name: "Expert", exact: true }).click();
  await page.getByTestId("tab-routing").click();

  const routing = page.getByTestId("routing-workspace");
  await expect(routing).toBeVisible();
  await expect(routing).toContainText("Active Policy");
  await expect(routing).toContainText("Task -> Alias Map");
  await expect(routing).toContainText("auth required");
  await expect(routing).toContainText("Provider IDs are backend-only");

  const body = page.locator("body");
  await expect(body).not.toContainText("openrouter/");
  await expect(body).not.toContainText("sk-test");
});

test("workspace tabs are keyboard reachable", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);

  const chatTab = page.getByTestId("tab-chat");
  const githubTab = page.getByTestId("tab-github");
  await chatTab.focus();
  await expect(chatTab).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(githubTab).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("github-workspace")).toBeVisible();
  await expect(githubTab).toHaveAttribute("aria-current", "page");
});

test("chat prepares a proposal before backend execution", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  let chatRequests = 0;
  await page.route("**/chat", async (route) => {
    chatRequests += 1;
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: CHAT_SSE });
  });

  await loadConsole(page);
  const composer = page.getByTestId("chat-composer");
  await composer.fill("Explain routing policy");
  await page.getByTestId("chat-send").click();

  await expect(page.getByTestId("chat-proposal-card")).toContainText("Prompt execution proposal");
  expect(chatRequests).toBe(0);

  await page.getByTestId("chat-decision-zone").getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Hello from mocked backend")).toBeVisible();
  expect(chatRequests).toBe(1);
});

test("chat backend failures surface as errors without fake assistant success", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await page.route("**/chat", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "upstream_error", message: "mocked backend failure" } }) });
  });

  await loadConsole(page);
  await page.getByTestId("chat-composer").fill("Trigger failure");
  await page.getByTestId("chat-send").click();
  await page.getByTestId("chat-decision-zone").getByRole("button", { name: "Approve" }).click();

  await expect(page.getByTestId("chat-receipt-failed")).toContainText("mocked backend failure");
  await expect(page.getByText("Hello from mocked backend")).toHaveCount(0);
});

test("empty chat composer cannot submit", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);
  await expect(page.getByTestId("chat-send")).toBeDisabled();
  await page.getByTestId("chat-composer").fill("x");
  await expect(page.getByTestId("chat-send")).toBeEnabled();
});

test("GitHub workspace renders without browser password inputs", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await installGitHubMocks(page);

  await loadConsole(page);
  await page.getByTestId("tab-github").click();
  await expect(page.getByTestId("github-workspace")).toBeVisible();
  await expect(page.locator("#github-repo-select")).toBeVisible();
  await expect(page.locator("input[type='password']")).toHaveCount(0);
  await expect(page.getByTestId("github-admin-login")).toHaveCount(0);
});

test("GitHub plan executes once and verifies the result", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  const counters = await installGitHubMocks(page);
  await loadConsole(page);
  await prepareGitHubPlan(page);

  await page.getByTestId("github-decision-zone").getByRole("button", { name: "Approve and execute" }).click();
  await expect(page.getByTestId("github-pr-result")).toContainText("verified");
  await expect(page.getByTestId("github-pr-result")).toContainText("PR #42");
  expect(counters.execute).toBe(1);
  expect(counters.verify).toBe(1);
});

test("stale GitHub plans block execution", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  const counters = await installGitHubMocks(page, { proposalStale: true });
  await loadConsole(page);
  await prepareGitHubPlan(page);

  await expect(page.getByTestId("github-stale-proposal")).toContainText("stale");
  await expect(page.getByTestId("github-decision-zone").getByRole("button", { name: "Approve and execute" })).toBeDisabled();
  expect(counters.execute).toBe(0);
});

test("changing the selected GitHub repository clears the pending proposal", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await installGitHubMocks(page);
  await loadConsole(page);
  await prepareGitHubPlan(page);
  await page.locator("#github-repo-select").selectOption("octo/sample");
  await expect(page.getByTestId("github-approval-surface")).toHaveCount(0);
  await expect(page.getByText("Demo plan")).toHaveCount(0);
});

test("Matrix workspace loads read-only identity and room state", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);
  await openMatrix(page);
  await expect(page.getByTestId("matrix-rooms")).toContainText("Room name");
  await expect(page.locator("body")).not.toContainText("sk-test-matrix-token");
});

test("Matrix malformed 200 responses fail closed", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "malformed" });
  await loadConsole(page);
  await page.getByTestId("tab-matrix").click();
  await expect(page.getByTestId("matrix-status")).toHaveText("Error");
  await expect(page.getByText(/Matrix workspace bootstrap error/i)).toBeVisible();
});

test("Matrix topic update executes only through approval flow", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await installMatrixTopicMocks(page);
  await loadConsole(page);
  await prepareMatrixPlan(page);

  await page.getByTestId("matrix-topic-decision").getByRole("button", { name: "Approve and execute" }).click();
  await expect(page.getByTestId("matrix-topic-execution")).toContainText("txn-topic-update");
  await expect(page.getByTestId("matrix-topic-verification")).toContainText("verified");
});

test("Matrix topic refresh failures clear executable state", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await installMatrixTopicMocks(page, { expiredRefresh: true });
  await loadConsole(page);
  await prepareMatrixPlan(page);

  await page.getByTestId("matrix-topic-refresh").click();
  await expect(page.getByTestId("matrix-topic-refresh-error")).toContainText("matrix_plan_expired");
  await expect(page.getByTestId("matrix-topic-plan")).toHaveCount(0);
});

test("Matrix stale execute failure does not fake a receipt", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await installMatrixTopicMocks(page, { executeStale: true });
  await loadConsole(page);
  await prepareMatrixPlan(page);

  await page.getByTestId("matrix-topic-decision").getByRole("button", { name: "Approve and execute" }).click();
  await expect(page.getByTestId("matrix-topic-execute-error")).toContainText("matrix_stale_plan");
  await expect(page.getByTestId("matrix-topic-execution")).toHaveCount(0);
  await expect(page.getByTestId("matrix-topic-verification")).toHaveCount(0);
});

test("Review aggregates GitHub and Matrix approval items", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await installGitHubMocks(page);
  await installMatrixTopicMocks(page);
  await loadConsole(page);

  await page.getByTestId("tab-review").click();
  await expect(page.getByTestId("review-workspace")).toContainText("No open reviews yet.");
  await prepareGitHubPlan(page);
  await prepareMatrixPlan(page);
  await page.getByTestId("tab-review").click();

  await expect(page.getByTestId("review-workspace")).toContainText("Demo plan");
  await expect(page.getByTestId("review-workspace")).toContainText("Room topic update plan");
  await expect(page.locator(".review-queue-item")).toHaveCount(2);
});

test("Settings hides diagnostics in Beginner and exposes clear action in Expert", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);
  await page.getByTestId("tab-settings").click();
  const settings = page.getByTestId("settings-workspace");
  await expect(settings).toBeVisible();
  await expect(settings.getByText("No local diagnostic events yet.")).toHaveCount(0);
  await settings.getByRole("button", { name: "Expert" }).click();
  await expect(settings.getByRole("button", { name: "Clear diagnostics" })).toBeVisible();
  await settings.getByRole("button", { name: "Clear diagnostics" }).click();
  await expect(settings).toContainText("No local diagnostic events yet.");
});

test("PWA manifest and service worker registration are wired", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/icon.svg");
  await expect.poll(async () =>
    page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return 0;
      const registrations = await navigator.serviceWorker.getRegistrations();
      return registrations.length;
    })
  ).toBeGreaterThan(0);
});
