import { expect, test, type Locator, type Page } from "@playwright/test";

const HEALTH_OK = {
  ok: true,
  service: "mosaicstack-test",
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

const DIAGNOSTICS_OK = {
  ok: true,
  service: "mosaicstack-test",
  runtimeMode: "local",
  diagnosticsGeneratedAt: "2026-04-30T12:00:00.000Z",
  processStartedAt: "2026-04-30T11:58:00.000Z",
  uptimeMs: 120000,
  models: {
    defaultPublicAlias: "default",
    publicAliases: ["default"],
  },
  routing: {
    mode: "policy",
    allowFallback: true,
    failClosed: true,
    requireBackendOwnedResolution: true,
  },
  rateLimit: {
    enabled: true,
    windowMs: 60000,
    limits: {
      chat: 30,
      auth_login: 8,
      github_propose: 10,
      github_execute: 6,
      matrix_execute: 6,
    },
    blockedByScope: {
      chat: 0,
      auth_login: 0,
      github_propose: 0,
      github_execute: 0,
      matrix_execute: 0,
    },
  },
  actionStore: {
    mode: "memory",
  },
  github: {
    configured: true,
    ready: true,
  },
  matrix: {
    configured: false,
    ready: false,
  },
  journal: {
    enabled: true,
    mode: "memory",
    maxEntries: 500,
    exposeRecentLimit: 50,
    recentCount: 0,
  },
  counters: {
    chatRequests: 0,
    chatStreamStarted: 0,
    chatStreamCompleted: 0,
    chatStreamError: 0,
    chatStreamAborted: 0,
    upstreamError: 0,
  },
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

const INTEGRATIONS_STATUS_OK = {
  ok: true,
  generatedAt: "2026-04-27T12:00:00.000Z",
  github: {
    status: "connect_available",
    credentialSource: "not_connected",
    capabilities: {
      read: "blocked",
      propose: "blocked",
      execute: "blocked",
      verify: "blocked",
    },
    executionMode: "disabled",
    labels: {
      identity: null,
      scope: "No allowed repositories configured.",
      allowedReposStatus: "missing",
    },
    lastVerifiedAt: null,
    lastErrorCode: null,
  },
  matrix: {
    status: "connect_available",
    credentialSource: "not_connected",
    capabilities: {
      read: "blocked",
      propose: "blocked",
      execute: "blocked",
      verify: "blocked",
    },
    executionMode: "disabled",
    labels: {
      identity: null,
      scope: "Matrix scope unavailable until backend config is ready.",
      homeserver: null,
      roomAccess: "unknown",
    },
    lastVerifiedAt: null,
    lastErrorCode: null,
  },
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

const CHAT_STREAM_FALLBACK = [
  "event: start",
  'data: {"ok":true,"model":"default"}',
  "",
  "event: route",
  'data: {"ok":true,"route":{"selectedAlias":"default","taskClass":"dialog","fallbackUsed":true,"degraded":true,"streaming":true}}',
  "",
  "event: token",
  'data: {"delta":"Hello from fallback route"}',
  "",
  "event: done",
  'data: {"ok":true,"model":"default","text":"Hello from fallback route","route":{"selectedAlias":"default","taskClass":"dialog","fallbackUsed":true,"degraded":true,"streaming":true}}',
  "",
].join("\n");

type MatrixStatus = "ok" | "error" | "malformed";

async function installBaseMocks(
  page: Page,
  options?: { matrixStatus?: MatrixStatus; integrationsStatus?: typeof INTEGRATIONS_STATUS_OK },
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

  await page.route("**/diagnostics", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(DIAGNOSTICS_OK),
    });
  });

  await page.route("**/api/integrations/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(options?.integrationsStatus ?? INTEGRATIONS_STATUS_OK),
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
          branchName: "mosaicstack/demo-plan",
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
          branchName: "mosaicstack/demo-plan",
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
          branchName: "mosaicstack/demo-plan",
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
  await expect(page.getByTestId("app-shell")).toContainText("MosaicStack");
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

test("console route normalizes legacy query entry and keeps active workspace in the URL", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await page.goto("/?console=1", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("app-shell")).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/console\?mode=chat$/);

  await page.getByTestId("tab-github").click();
  await expect(page.getByTestId("github-workspace")).toBeVisible();
  await expect(page).toHaveURL(/\/console\?mode=github$/);

  await page.goto("/console?mode=matrix", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("matrix-workspace")).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/console\?mode=matrix$/);
});

test("GitHub and Matrix workspaces expose backend route ownership in the truth rail", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);

  await page.getByTestId("tab-github").click();
  await expect(page.getByTestId("truth-rail-route-ownership")).toBeVisible();
  await expect(page.getByTestId("truth-rail-route-ownership")).toContainText("GitHub and Matrix are not browser integrations.");
  await expect(page.getByTestId("truth-rail-route-ownership")).toContainText("identity");
  await expect(page.getByTestId("truth-rail-route-ownership")).toContainText("verify");

  await page.getByTestId("tab-matrix").click();
  await expect(page.getByTestId("truth-rail-route-ownership")).toBeVisible();
  await expect(page.getByTestId("truth-rail-route-ownership")).toContainText("analyze");
  await expect(page.getByTestId("truth-rail-route-ownership")).toContainText("execute");
});

async function setLocale(page: Page, locale: "en" | "de") {
  const button = locale === "en" ? page.getByTestId("locale-en") : page.getByTestId("locale-de");
  const pressed = await button.getAttribute("aria-pressed");
  if (pressed !== "true") {
    await button.click();
  }
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
}

async function openDetailsPanel(panel: Locator) {
  await panel.evaluate((node) => {
    if (node instanceof HTMLDetailsElement && !node.open) {
      node.open = true;
    }
  });
}

async function waitForMatrixWorkspace(page: Page) {
  await expect(page.getByTestId("matrix-workspace")).toBeVisible();
  await expect(page.getByTestId("matrix-status")).toHaveText("Ready");
  await expect(page.getByTestId("matrix-topic-update-panel")).toBeVisible();
  await openDetailsPanel(page.getByTestId("matrix-topic-update-panel"));
  await openDetailsPanel(page.locator(".matrix-scope-card").first());
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

test("left rail workspace tabs keep keyboard focus names in compact layout", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 720 });
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);

  const matrixTab = page.getByTestId("tab-matrix");
  await expect(matrixTab).toHaveAttribute("aria-label", "Matrix");

  await matrixTab.focus();
  await expect(matrixTab).toBeFocused();
  await expect(matrixTab).toHaveCSS("outline-style", "solid");
});

test("console shell avoids page-level horizontal overflow in compact desktop layout", async ({ page }) => {
  await page.setViewportSize({ width: 916, height: 688 });
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);

  const overflow = await page.evaluate(() => ({
    htmlClientWidth: document.documentElement.clientWidth,
    htmlScrollWidth: document.documentElement.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));

  expect(overflow.htmlScrollWidth).toBeLessThanOrEqual(overflow.htmlClientWidth);
  expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(overflow.bodyClientWidth);
});

test("mobile shell exposes micro header status strip and accessible tabs without horizontal overflow", async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 480, height: 900 },
    { width: 760, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await installBaseMocks(page, { matrixStatus: "ok" });
    await loadConsole(page);

    await expect(page.getByTestId("mobile-micro-header")).toBeVisible();
    await expect(page.getByTestId("mobile-status-strip")).toBeVisible();
    await expect(page.getByTestId("truth-rail-health")).toBeHidden();
    await expect(page.locator("nav.sidebar-nav")).toHaveAttribute("role", "tablist");
    await expect(page.getByTestId("tab-chat")).toHaveAttribute("role", "tab");
    await expect(page.getByTestId("tab-chat")).toHaveAttribute("aria-selected", "true");

    const overflow = await page.evaluate(() => ({
      htmlClientWidth: document.documentElement.clientWidth,
      htmlScrollWidth: document.documentElement.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));

    expect(overflow.htmlScrollWidth).toBeLessThanOrEqual(overflow.htmlClientWidth);
    expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(overflow.bodyClientWidth);
    await expect(page.locator("body")).not.toContainText("sk-test");
    await expect(page.locator("body")).not.toContainText("openrouter/auto");
  }
});

test("mobile expert status strip opens diagnostics sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);

  await page.getByTestId("tab-settings").click();
  await page.getByTestId("settings-workspace").getByRole("button", { name: "Expert" }).click();
  await page.getByTestId("mobile-status-strip").click();

  await expect(page.getByTestId("mobile-diagnostics-sheet")).toBeVisible();
  await expect(page.getByTestId("mobile-diagnostics-sheet")).toContainText("Settings Diagnostics");
});

test("mobile pending approval bar routes to Review workspace", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);

  await page.getByTestId("chat-composer").fill("Prepare a governed mobile shell check.");
  await page.getByTestId("chat-send").click();

  await expect(page.getByTestId("mobile-approval-bar")).toBeVisible();
  await page.getByTestId("mobile-approval-bar-action").click();
  await expect(page.getByTestId("review-workspace")).toBeVisible();
  await expect(page).toHaveURL(/\/console\?mode=review$/);
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

test("workspace guide presents comprehensive navigable chat cards", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);
  await setLocale(page, "de");

  await page.getByTestId("guide-chat").click();
  const dialog = page.getByRole("dialog", { name: "Chat-Guide" });
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("guide-chat-card")).toContainText("Arbeitsbereiche und Arbeitsmodus");
  await expect(page.getByTestId("guide-chat-card")).toContainText("Basis");
  await expect(page.getByTestId("guide-chat-card")).toContainText("Expert");

  await dialog.getByRole("button", { name: "Weiter" }).click();
  await expect(page.getByTestId("guide-chat-card")).toContainText("Guide, Status und Diagnostik");
  await expect(page.getByTestId("guide-chat-card")).toContainText("Diagnostik öffnen");

  await dialog.getByRole("button", { name: "Weiter" }).click();
  await expect(page.getByTestId("guide-chat-card")).toContainText("Ausführungsmodus");

  await dialog.getByRole("button", { name: "Weiter" }).click();
  await dialog.getByRole("button", { name: "Weiter" }).click();
  await expect(page.getByTestId("guide-chat-card")).toContainText("Enter bereitet den nächsten Schritt vor");
  await expect(page.getByTestId("guide-chat-card")).toContainText("Shift+Enter");
});

test("all workspace guides expose detailed operational cards", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);

  const workspaces = [
    { tab: "chat", guide: "guide-chat", title: "Chat guide", expected: "backend status" },
    { tab: "github", guide: "guide-github", title: "GitHub guide", expected: "GitHub readiness" },
    { tab: "matrix", guide: "guide-matrix", title: "Matrix guide", expected: "explicit target" },
    { tab: "review", guide: "guide-review", title: "Review guide", expected: "human decision" },
    { tab: "settings", guide: "guide-settings", title: "Settings guide", expected: "backend authority" },
  ];

  for (const workspace of workspaces) {
    await page.getByTestId(`tab-${workspace.tab}`).click();
    await page.getByTestId(workspace.guide).click();
    const dialog = page.getByRole("dialog", { name: workspace.title });
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.locator(".guide-card-dot").count()).toBeGreaterThanOrEqual(6);
    await expect(dialog).toContainText(workspace.expected);
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toHaveCount(0);
  }
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
  await page.getByTestId("chat-composer").press("Enter");

  await expect(page.getByTestId("chat-proposal-card")).toBeVisible();
  expect(chatRequests).toBe(0);

  await page.getByTestId("chat-decision-zone").getByRole("button", { name: "Approve" }).click();
  await expect(page.getByTestId("chat-connection-state")).toHaveText("Completed");
  await expect(page.locator(".thread-block-agent")).toHaveCount(1);
  expect(chatRequests).toBe(1);
});

test("chat routing status strip reflects backend routing without exposing provider targets", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });

  await page.route("**/chat", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body: CHAT_STREAM_FALLBACK,
    });
  });

  await loadConsole(page);

  const routingStatus = page.getByTestId("chat-routing-status");
  await expect(routingStatus).toBeVisible();
  await expect(routingStatus).toContainText("Active model");
  await expect(routingStatus).toContainText("default");
  await expect(routingStatus).toContainText("Provider status");
  await expect(routingStatus).toContainText("Ready");
  await expect(routingStatus).toContainText("Fallback enabled");
  await expect(routingStatus).toContainText("Route pending");

  await page.getByTestId("chat-composer").fill("Show route status.");
  await page.getByTestId("chat-send").click();
  await page.getByTestId("chat-decision-zone").getByRole("button", { name: "Approve" }).click();

  await expect(routingStatus).toContainText("Fallback used");
  await expect(routingStatus).toContainText("degraded");
  await expect(page.locator("body")).not.toContainText("openrouter/auto");
  await expect(page.locator("body")).not.toContainText("sk-test");
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

  page.once("dialog", (dialog) => dialog.accept());
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

test("Settings GitHub CTA starts backend-owned auth flow and returns to Settings", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  let startHits = 0;
  let callbackHits = 0;

  await page.route("**/api/auth/github/start**", async (route) => {
    startHits += 1;
    const url = new URL(route.request().url());
    expect(url.searchParams.get("returnTo")).toBe("/console?mode=settings");
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<!doctype html><html><body><script>window.location.replace('/api/auth/github/callback?state=oauth-state&code=oauth-code');</script></body></html>",
    });
  });

  await page.route("**/api/auth/github/callback**", async (route) => {
    callbackHits += 1;
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<!doctype html><html><body><script>window.location.replace('/console?mode=settings');</script></body></html>",
    });
  });

  await loadConsole(page);

  await page.getByTestId("tab-settings").click();
  const settingsWorkspace = page.getByTestId("settings-workspace");
  const githubAdapter = settingsWorkspace.getByTestId("settings-adapter-github");

  const githubConnect = githubAdapter.getByTestId("settings-adapter-github-action-connect");
  await expect(githubConnect).toHaveAttribute("href", /\/api\/auth\/github\/start\?returnTo=%2Fconsole%3Fmode%3Dsettings$/);
  await githubConnect.click();
  await expect(page).toHaveURL(/\/console\?mode=settings$/);
  await expect(page.getByTestId("settings-workspace")).toBeVisible();
  expect(startHits).toBe(1);
  expect(callbackHits).toBe(1);
  await expect(page.locator("body")).not.toContainText("sk-test");
});

test("Settings Matrix CTA starts backend-owned auth flow and returns to Settings", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  let startHits = 0;
  let callbackHits = 0;

  await page.route("**/api/auth/matrix/start**", async (route) => {
    startHits += 1;
    const url = new URL(route.request().url());
    expect(url.searchParams.get("returnTo")).toBe("/console?mode=settings");
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<!doctype html><html><body><script>window.location.replace('/api/auth/matrix/callback?state=sso-state&loginToken=live-login-token');</script></body></html>",
    });
  });

  await page.route("**/api/auth/matrix/callback**", async (route) => {
    callbackHits += 1;
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<!doctype html><html><body><script>window.location.replace('/console?mode=settings');</script></body></html>",
    });
  });

  await loadConsole(page);

  await page.getByTestId("tab-settings").click();
  const settingsWorkspace = page.getByTestId("settings-workspace");
  const matrixAdapter = settingsWorkspace.getByTestId("settings-adapter-matrix");

  const matrixConnect = matrixAdapter.getByTestId("settings-adapter-matrix-action-connect");
  await expect(matrixConnect).toHaveAttribute("href", /\/api\/auth\/matrix\/start\?returnTo=%2Fconsole%3Fmode%3Dsettings$/);
  await matrixConnect.click();
  await expect(page).toHaveURL(/\/console\?mode=settings$/);
  await expect(page.getByTestId("settings-workspace")).toBeVisible();
  expect(startHits).toBe(1);
  expect(callbackHits).toBe(1);
  await expect(page.locator("body")).not.toContainText("sk-test");
});

test("Settings connected auth CTAs call backend-owned control routes", async ({ page }) => {
  const connectedIntegrationsStatus = {
    ...INTEGRATIONS_STATUS_OK,
    github: {
      ...INTEGRATIONS_STATUS_OK.github,
      status: "connected",
      credentialSource: "user_connected",
      capabilities: {
        read: "available",
        propose: "available",
        execute: "approval_required",
        verify: "available",
      },
      executionMode: "approval_required",
      labels: {
        identity: "octocat",
        scope: "2 allowed repos",
        allowedReposStatus: "configured",
      },
      lastVerifiedAt: "2026-04-27T12:00:00.000Z",
      lastErrorCode: null,
    },
  } satisfies typeof INTEGRATIONS_STATUS_OK;
  await installBaseMocks(page, {
    matrixStatus: "ok",
    integrationsStatus: connectedIntegrationsStatus,
  });
  let reverifyHits = 0;
  let disconnectHits = 0;

  await page.route("**/api/auth/github/reverify", async (route) => {
    reverifyHits += 1;
    expect(route.request().method()).toBe("POST");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, provider: "github" }),
    });
  });

  await page.route("**/api/auth/github/disconnect", async (route) => {
    disconnectHits += 1;
    expect(route.request().method()).toBe("POST");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, provider: "github" }),
    });
  });

  await loadConsole(page);
  await page.getByTestId("tab-settings").click();
  const githubAdapter = page.getByTestId("settings-adapter-github");

  await githubAdapter.getByTestId("settings-adapter-github-action-reverify").click();
  await githubAdapter.getByTestId("settings-adapter-github-action-disconnect").click();

  expect(reverifyHits).toBe(1);
  expect(disconnectHits).toBe(1);
  await expect(page.locator("body")).not.toContainText("sk-test");
});

test("Settings verification buttons call backend-owned read checks without exposing secrets", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  let githubHits = 0;

  await page.route("**/api/github/repos", async (route) => {
    githubHits += 1;
    expect(route.request().method()).toBe("GET");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        checkedAt: "2026-04-30T12:00:00.000Z",
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
            permissions: { canWrite: true },
            checkedAt: "2026-04-30T12:00:00.000Z",
            token: "sk-test-github-token",
          },
        ],
      }),
    });
  });

  await loadConsole(page);
  await page.getByTestId("tab-settings").click();
  const settingsWorkspace = page.getByTestId("settings-workspace");

  await settingsWorkspace.getByTestId("settings-verification-backend-action").click();
  await expect(settingsWorkspace.getByTestId("settings-verification-backend")).toContainText("mosaicstack-test");

  await settingsWorkspace.getByTestId("settings-verification-github-action").click();
  await expect(settingsWorkspace.getByTestId("settings-verification-github")).toContainText("1 repository visible");

  await settingsWorkspace.getByTestId("settings-verification-matrix-action").click();
  await expect(settingsWorkspace.getByTestId("settings-verification-matrix")).toContainText("@user:matrix.example");

  expect(githubHits).toBe(1);
  await expect(page.locator("body")).not.toContainText("sk-test");
});
