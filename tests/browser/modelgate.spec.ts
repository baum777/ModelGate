import { expect, test, type Page } from "@playwright/test";

const HEALTH_OK = {
  ok: true,
  service: "modelgate-test",
  mode: "local",
  upstream: "openrouter",
  defaultModel: "default",
  allowedModelCount: 1,
  streaming: "sse",
  accessToken: "sk-test-openrouter-key",
};

const MODELS_OK = {
  ok: true,
  defaultModel: "default",
  models: ["default"],
  source: "backend-policy",
  providerTarget: "openrouter/auto",
};

const MATRIX_WHOAMI_OK = {
  ok: true,
  userId: "@user:matrix.example",
  deviceId: "DEVICE",
  homeserver: "https://matrix.example",
  accessToken: "sk-test-matrix-token",
};

const MATRIX_ROOMS_OK = {
  ok: true,
  rooms: [
    {
      roomId: "!room:matrix.example",
      name: "Room name",
      canonicalAlias: "#room:matrix.example",
      roomType: "room",
      matrixAccessToken: "sk-test-matrix-token",
    },
  ],
};

const CHAT_STREAM = [
  "event: start",
  'data: {"ok":true,"model":"default"}',
  "",
  "event: route",
  'data: {"ok":true,"route":{"selectedAlias":"default","taskClass":"dialog","fallbackUsed":false,"degraded":false,"streaming":true}}',
  "",
  "event: token",
  'data: {"delta":"Hello from mocked backend"}',
  "",
  "event: done",
  'data: {"ok":true,"model":"default","text":"Hello from mocked backend","route":{"selectedAlias":"default","taskClass":"dialog","fallbackUsed":false,"degraded":false,"streaming":true}}',
  "",
].join("\n");

type MatrixStatus = "ok" | "error" | "malformed";

async function installBaseMocks(
  page: Page,
  options?: { matrixStatus?: MatrixStatus },
) {
  await page.route("**/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(HEALTH_OK),
    });
  });

  await page.route("**/models", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MODELS_OK),
    });
  });

  if (options?.matrixStatus === "ok") {
    await page.route("**/api/matrix/whoami", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MATRIX_WHOAMI_OK),
      });
    });

    await page.route("**/api/matrix/joined-rooms", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MATRIX_ROOMS_OK),
      });
    });
  } else if (options?.matrixStatus === "error") {
    await page.route("**/api/matrix/whoami", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: {
            code: "matrix_unavailable",
            message: "Matrix backend is unavailable",
          },
        }),
      });
    });

    await page.route("**/api/matrix/joined-rooms", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: {
            code: "matrix_unavailable",
            message: "Matrix backend is unavailable",
          },
        }),
      });
    });
  } else if (options?.matrixStatus === "malformed") {
    await page.route("**/api/matrix/whoami", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.route("**/api/matrix/joined-rooms", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, rooms: [{}] }),
      });
    });
  }
}

type GitHubWorkspaceMockOptions = {
  executeResponse?: {
    status: number;
    body: unknown;
  };
  verifyResponse?: {
    status: number;
    body: unknown;
  };
};

async function installGitHubWorkspaceMocks(page: Page, options: GitHubWorkspaceMockOptions = {}) {
  const counters = {
    execute: 0,
    verify: 0,
  };

  await page.route("**/api/github/repos", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        checkedAt: "2026-04-16T08:00:00.000Z",
        repos: [
          {
            owner: "octo",
            repo: "demo",
            fullName: "octo/demo",
            defaultBranch: "main",
            defaultBranchSha: "abc123",
            description: "Demo repository",
            isPrivate: false,
            status: "ready",
            permissions: { canWrite: false },
            checkedAt: "2026-04-16T08:00:00.000Z",
          },
          {
            owner: "octo",
            repo: "sample",
            fullName: "octo/sample",
            defaultBranch: "main",
            defaultBranchSha: "def456",
            description: "Sample repository",
            isPrivate: false,
            status: "ready",
            permissions: { canWrite: false },
            checkedAt: "2026-04-16T08:00:00.000Z",
          },
        ],
      }),
    });
  });

  await page.route("**/api/github/context", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        context: {
          repo: {
            owner: "octo",
            repo: "demo",
            fullName: "octo/demo",
            defaultBranch: "main",
            defaultBranchSha: "abc123",
            description: "Demo repository",
            isPrivate: false,
            status: "ready",
            permissions: { canWrite: false },
            checkedAt: "2026-04-16T08:00:00.000Z",
          },
          ref: "main",
          baseSha: "abc123",
          question: "Describe the repository and propose the safest next action.",
          files: [
            {
              path: "README.md",
              sha: "sha-readme",
              excerpt: "Demo",
              citations: [],
              truncated: false,
            },
            {
              path: "web/src/App.tsx",
              sha: "sha-app",
              excerpt: "App",
              citations: [],
              truncated: false,
            },
          ],
          citations: [],
          tokenBudget: {
            maxTokens: 1000,
            usedTokens: 100,
            truncated: false,
          },
          warnings: [],
          generatedAt: "2026-04-16T08:00:00.000Z",
        },
      }),
    });
  });

  await page.route("**/api/github/actions/propose", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        plan: {
          planId: "plan-123",
          repo: {
            owner: "octo",
            repo: "demo",
            fullName: "octo/demo",
            defaultBranch: "main",
            defaultBranchSha: "abc123",
            description: "Demo repository",
            isPrivate: false,
            status: "ready",
            permissions: { canWrite: false },
            checkedAt: "2026-04-16T08:00:00.000Z",
          },
          baseRef: "main",
          baseSha: "abc123",
          branchName: "modelgate/demo-plan",
          targetBranch: "main",
          status: "pending_review",
          stale: false,
          requiresApproval: true,
          summary: "Demo plan",
          rationale: "Safe demonstration proposal.",
          riskLevel: "low_surface",
          citations: [],
          diff: [
            {
              path: "README.md",
              changeType: "modified",
              beforeSha: "before",
              afterSha: "after",
              additions: 1,
              deletions: 1,
              patch: "@@ -1 +1 @@\n-Hello\n+Hello world",
              citations: [],
            },
          ],
          generatedAt: "2026-04-16T08:00:00.000Z",
          expiresAt: "2026-04-16T09:00:00.000Z",
        },
      }),
    });
  });

  await page.route("**/api/github/actions/plan-123/execute", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    counters.execute += 1;

    if (options.executeResponse) {
      await route.fulfill({
        status: options.executeResponse.status,
        contentType: "application/json",
        body: JSON.stringify(options.executeResponse.body),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        result: {
          planId: "plan-123",
          status: "executed",
          branchName: "modelgate/demo-plan",
          baseSha: "abc123",
          headSha: "def456",
          commitSha: "def456",
          prNumber: 42,
          prUrl: "https://github.com/octo/demo/pull/42",
          targetBranch: "main",
          executedAt: "2026-04-16T08:30:00.000Z",
        },
      }),
    });
  });

  await page.route("**/api/github/actions/plan-123/verify", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    counters.verify += 1;

    if (options.verifyResponse) {
      await route.fulfill({
        status: options.verifyResponse.status,
        contentType: "application/json",
        body: JSON.stringify(options.verifyResponse.body),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        verification: {
          planId: "plan-123",
          status: "verified",
          checkedAt: "2026-04-16T08:31:00.000Z",
          branchName: "modelgate/demo-plan",
          targetBranch: "main",
          expectedBaseSha: "abc123",
          actualBaseSha: "abc123",
          expectedCommitSha: "def456",
          actualCommitSha: "def456",
          prNumber: 42,
          prUrl: "https://github.com/octo/demo/pull/42",
          mismatchReasons: [],
        },
      }),
    });
  });

  return counters;
}

async function installAbortableChatFetchMock(page: Page) {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input, init) => {
      const request = typeof input === "string" ? new Request(input, init) : input;
      const requestUrl = new URL(request.url, window.location.href);

      if (requestUrl.pathname.endsWith("/chat") && request.method === "POST") {
        const encoder = new TextEncoder();
        const signal = init?.signal ?? request.signal;

        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('event: start\ndata: {"ok":true,"model":"default"}\n\n'));

            setTimeout(() => {
              controller.enqueue(encoder.encode('event: token\ndata: {"delta":"Partial reply"}\n\n'));
            }, 40);

            signal?.addEventListener(
              "abort",
              () => {
                controller.error(new DOMException("Aborted", "AbortError"));
              },
              { once: true },
            );
          },
        });

        return new Response(stream, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
          },
        });
      }

      return originalFetch(input, init);
    };
  });
}

async function loadConsole(page: Page) {
  await page.goto("/console", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("app-shell")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("ModelGate Console")).toBeVisible();
  await expect(page.getByTestId("tab-chat")).toBeVisible();
  await expect(page.getByTestId("tab-github")).toBeVisible();
  await expect(page.getByTestId("tab-matrix")).toBeVisible();
  await expect(page.getByTestId("tab-review")).toBeVisible();
  await expect(page.getByTestId("tab-settings")).toBeVisible();
}

test("root route renders public preview without console internals", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("public-preview")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Public preview shell. Governed workspace access stays separate from this route.")).toBeVisible();
  await expect(page.getByTestId("app-shell")).toHaveCount(0);
  await expect(page.getByTestId("tab-chat")).toHaveCount(0);
  await expect(page.getByTestId("truth-rail-health")).toHaveCount(0);
});

async function setLocale(page: Page, locale: "en" | "de") {
  const button = locale === "en" ? page.getByTestId("locale-en") : page.getByTestId("locale-de");
  const pressed = await button.getAttribute("aria-pressed");
  if (pressed !== "true") {
    await button.click();
  }
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
}

async function waitForMatrixWorkspace(page: Page) {
  await expect(page.getByTestId("matrix-status")).toHaveText("Ready");
  await expect(page.getByTestId("matrix-topic-update-panel")).toBeVisible();
  await expect(page.getByTestId("matrix-composer-panel")).toBeVisible();
  await expect(page.getByTestId("matrix-rooms")).toBeVisible();
}

test("shell renders core governed surfaces and keeps secrets out of the DOM", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);

  await expect(page.getByTestId("truth-rail-health")).toBeVisible();
  await expect(page.getByTestId("truth-rail-next-step")).toBeVisible();
  await expect(page.locator("nav.sidebar-nav")).toHaveAttribute("aria-label", "Workspaces");

  const body = page.locator("body");
  await expect(body).not.toContainText("sk-test-openrouter-key");
  await expect(body).not.toContainText("sk-test-matrix-token");
});

test("locale toggle switches key copy and persists across reload", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);

  await page.getByTestId("tab-review").click();
  await expect(page.getByTestId("review-workspace")).toContainText("No open reviews yet.");

  await setLocale(page, "de");
  await expect(page.getByTestId("review-workspace")).toContainText("Noch keine offenen Prüfungen.");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("review-workspace")).toContainText("Noch keine offenen Prüfungen.");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
});

test("workspace guide presents three navigable cards", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);
  await setLocale(page, "de");

  await page.getByTestId("guide-chat").click();
  const dialog = page.getByRole("dialog", { name: "Chat-Guide" });
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("guide-chat-card")).toContainText("Composer zuerst");

  await dialog.getByRole("button", { name: "Weiter" }).click();
  await expect(page.getByTestId("guide-chat-card")).toContainText("Best Practice");
  await expect(page.getByTestId("guide-chat-card")).toContainText("Vorschlag vor Ausführung");

  await dialog.getByRole("button", { name: "Weiter" }).click();
  await expect(page.getByTestId("guide-chat-card")).toContainText("Logik");
  await expect(page.getByTestId("guide-chat-card")).toContainText("Backend-eigener Stream");
});

test("chat enforces proposal-first execution and sends backend request only on approve", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });

  let chatRequests = 0;
  await page.route("**/chat", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    chatRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body: CHAT_STREAM,
    });
  });

  await loadConsole(page);
  await page.getByTestId("chat-composer").fill("Please propose a safe backend action.");
  await page.getByTestId("chat-send").click();

  await expect(page.getByTestId("chat-proposal-card")).toBeVisible();
  expect(chatRequests).toBe(0);

  await page.getByTestId("chat-decision-zone").getByRole("button", { name: "Approve" }).click();
  await expect(page.getByTestId("chat-connection-state")).toHaveText("Completed");
  await expect(page.locator(".thread-block-agent")).toHaveCount(1);
  expect(chatRequests).toBe(1);
});

test("chat abort keeps fail-closed behavior and does not fabricate assistant completion", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await installAbortableChatFetchMock(page);
  await loadConsole(page);

  await page.getByTestId("chat-composer").fill("Abort this stream");
  await page.getByTestId("chat-send").click();
  await page.getByTestId("chat-decision-zone").getByRole("button", { name: "Approve" }).click();

  await expect(page.getByRole("button", { name: "Stop execution" })).toBeVisible();
  await page.getByRole("button", { name: "Stop execution" }).click();

  await expect(page.getByTestId("chat-connection-state")).toHaveText("Error");
  await expect(page.locator("body")).toContainText("Execution cancelled by operator.");
  await expect(page.locator(".thread-block-agent")).toHaveCount(0);
});

test("GitHub workspace runs analysis and proposal, then executes and verifies once", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  const counters = await installGitHubWorkspaceMocks(page);
  await loadConsole(page);

  await page.getByTestId("tab-github").click();
  await page.locator("#github-repo-select").selectOption("octo/demo");
  await page.getByRole("button", { name: "Start analysis" }).click();
  await page.getByRole("button", { name: "Review proposal" }).click();

  await expect(page.getByTestId("github-approval-surface")).toBeVisible();
  await page.getByTestId("github-decision-zone").getByRole("button", { name: "Approve and execute" }).click();

  await expect(page.getByTestId("github-pr-result")).toBeVisible();
  await expect(page.getByTestId("github-pr-result")).toContainText("verified");
  await expect(page.getByRole("link", { name: "Open in GitHub" })).toBeVisible();
  expect(counters.execute).toBe(1);
  expect(counters.verify).toBe(1);
});

test("GitHub stale-plan execute failure is surfaced and no receipt is fabricated", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  const counters = await installGitHubWorkspaceMocks(page, {
    executeResponse: {
      status: 409,
      body: {
        ok: false,
        error: {
          code: "github_stale_plan",
          message: "GitHub plan is stale and must be refreshed",
        },
      },
    },
  });

  await loadConsole(page);
  await page.getByTestId("tab-github").click();
  await page.locator("#github-repo-select").selectOption("octo/demo");
  await page.getByRole("button", { name: "Start analysis" }).click();
  await page.getByRole("button", { name: "Review proposal" }).click();
  await page.getByTestId("github-decision-zone").getByRole("button", { name: "Approve and execute" }).click();

  await expect(page.getByTestId("github-workspace-notice")).toContainText("stale");
  await expect(page.getByTestId("github-pr-result")).toHaveCount(0);
  expect(counters.execute).toBe(1);
  expect(counters.verify).toBe(0);
});

test("Matrix composer remains fail-closed without write contract", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);

  await page.getByTestId("tab-matrix").click();
  await waitForMatrixWorkspace(page);
  await page.getByTestId("matrix-composer-room-id").fill("!room:matrix.example");
  await page.getByTestId("matrix-new-post").click();
  await page.getByTestId("matrix-composer-draft").fill("Hello Matrix");
  await page.getByTestId("matrix-composer-submit").click();

  await expect(page.getByTestId("matrix-composer-result")).toContainText("fail-closed");
  await expect(page.getByTestId("matrix-composer-result")).toContainText("write contract");
});

test("Matrix topic update flows from plan to execute+verify receipt", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });

  let analyzeCount = 0;
  let executeCount = 0;
  let verifyCount = 0;

  await page.route("**/api/matrix/analyze", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    analyzeCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        plan: {
          planId: "plan-topic-update",
          roomId: "!room:matrix.example",
          scopeId: null,
          snapshotId: null,
          status: "pending_review",
          actions: [
            {
              type: "set_room_topic",
              roomId: "!room:matrix.example",
              currentValue: "Old topic",
              proposedValue: "New topic",
            },
          ],
          currentValue: "Old topic",
          proposedValue: "New topic",
          risk: "low",
          requiresApproval: true,
          createdAt: "2026-04-15T08:00:00.000Z",
          expiresAt: "2026-04-15T08:12:00.000Z",
        },
      }),
    });
  });

  await page.route("**/api/matrix/actions/plan-topic-update/execute", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    executeCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        result: {
          planId: "plan-topic-update",
          status: "executed",
          executedAt: "2026-04-15T08:01:00.000Z",
          transactionId: "txn-topic-update",
        },
      }),
    });
  });

  await page.route("**/api/matrix/actions/plan-topic-update/verify", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    verifyCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        verification: {
          planId: "plan-topic-update",
          status: "verified",
          checkedAt: "2026-04-15T08:01:30.000Z",
          expected: "New topic",
          actual: "New topic",
        },
      }),
    });
  });

  await loadConsole(page);
  await page.getByTestId("tab-matrix").click();
  await waitForMatrixWorkspace(page);

  await page.getByTestId("matrix-topic-room-id").fill("!room:matrix.example");
  await page.getByTestId("matrix-topic-text").fill("New topic");
  await page.getByTestId("matrix-topic-update-panel").getByRole("button", { name: "Topic update" }).first().click();
  await expect.poll(() => analyzeCount).toBe(1);

  await expect(page.getByTestId("matrix-topic-plan")).toBeVisible();
  await page.getByTestId("matrix-topic-decision").getByRole("button", { name: "Approve and execute" }).click();

  await expect(page.getByTestId("matrix-topic-execution")).toContainText("txn-topic-update");
  await expect(page.getByTestId("matrix-topic-verification")).toContainText("verified");

  expect(analyzeCount).toBe(1);
  expect(executeCount).toBe(1);
  expect(verifyCount).toBe(1);
});

test("Matrix malformed backend data is surfaced as explicit fail-closed error state", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "malformed" });
  await loadConsole(page);

  await page.getByTestId("tab-matrix").click();
  await expect(page.getByTestId("matrix-status")).toHaveText("Error");
  await expect(page.getByTestId("matrix-identity-error")).toContainText("Matrix whoami");
  await expect(page.getByTestId("matrix-rooms-error")).toContainText("Matrix joined rooms");
});

test("Review workspace aggregates pending items from GitHub and Matrix", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await installGitHubWorkspaceMocks(page);

  await page.route("**/api/matrix/analyze", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        plan: {
          planId: "plan-review-matrix",
          roomId: "!room:matrix.example",
          scopeId: null,
          snapshotId: null,
          status: "pending_review",
          actions: [
            {
              type: "set_room_topic",
              roomId: "!room:matrix.example",
              currentValue: "Old topic",
              proposedValue: "New topic",
            },
          ],
          currentValue: "Old topic",
          proposedValue: "New topic",
          risk: "low",
          requiresApproval: true,
          createdAt: "2026-04-15T08:00:00.000Z",
          expiresAt: "2026-04-15T08:12:00.000Z",
        },
      }),
    });
  });

  await loadConsole(page);
  await page.getByTestId("tab-review").click();
  await expect(page.getByTestId("review-workspace")).toContainText("No open reviews yet.");

  await page.getByTestId("tab-github").click();
  await page.locator("#github-repo-select").selectOption("octo/demo");
  await page.getByRole("button", { name: "Start analysis" }).click();
  await page.getByRole("button", { name: "Review proposal" }).click();

  await page.getByTestId("tab-matrix").click();
  await waitForMatrixWorkspace(page);
  await page.getByTestId("matrix-topic-room-id").fill("!room:matrix.example");
  await page.getByTestId("matrix-topic-text").fill("New topic");
  await page.getByTestId("matrix-topic-update-panel").getByRole("button", { name: "Topic update" }).first().click();

  await page.getByTestId("tab-review").click();
  await expect(page.locator(".review-queue-item")).toHaveCount(2);
  await expect(page.getByTestId("review-workspace")).toContainText("Demo plan");
  await expect(page.getByTestId("review-workspace")).toContainText("Room topic update plan");
  await expect(page.getByTestId("review-workspace")).toContainText("Waiting for approval");
});

test("Settings keeps diagnostics behind Expert mode and allows clearing local entries", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);

  await page.getByTestId("tab-settings").click();
  const settingsWorkspace = page.getByTestId("settings-workspace");
  await expect(settingsWorkspace).toBeVisible();
  await expect(settingsWorkspace).toContainText("Beginner mode");
  await expect(settingsWorkspace).toContainText("Guided and quiet");
  await expect(settingsWorkspace.getByRole("button", { name: "Clear diagnostics" })).toHaveCount(0);

  await settingsWorkspace.getByRole("button", { name: "Expert" }).click();
  await expect(settingsWorkspace).toContainText("Expert mode");
  await expect(settingsWorkspace).toContainText("Full context and control");
  await expect(settingsWorkspace.getByText("Backend health loaded")).toBeVisible();
  await expect(settingsWorkspace.getByRole("button", { name: "Clear diagnostics" })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("settings-workspace")).toContainText("Expert mode");

  await settingsWorkspace.getByRole("button", { name: "Clear diagnostics" }).click();

  await expect(settingsWorkspace).toContainText("No local diagnostic events yet.");
});

test("Settings GitHub CTA opens the GitHub workspace without an admin login gate", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);

  await page.getByTestId("tab-settings").click();
  const settingsWorkspace = page.getByTestId("settings-workspace");
  const githubAdapter = settingsWorkspace.locator(".settings-adapter-row").filter({ hasText: "GitHub" });

  await githubAdapter.getByRole("button", { name: "Open" }).click();
  await expect(page.getByTestId("github-workspace")).toBeVisible();
  await expect(page.getByTestId("github-admin-login")).toHaveCount(0);
});
