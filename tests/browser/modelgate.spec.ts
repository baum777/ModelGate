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

const CHAT_STREAM = [
  "event: start",
  'data: {"ok":true,"model":"default"}',
  "",
  "event: token",
  'data: {"delta":"Hello from mocked backend"}',
  "",
  "event: done",
  'data: {"ok":true,"model":"default","text":"Hello from mocked backend"}',
  ""
].join("\n");

const CHAT_ERROR = {
  ok: false,
  error: {
    code: "upstream_error",
    message: "mocked backend failure"
  }
};

type MatrixStatus = "ok" | "error" | "malformed";

async function installBaseMocks(
  page: Page,
  options?: { matrixStatus?: MatrixStatus; authAuthenticated?: boolean | (() => boolean) },
) {
  await page.route("**/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(HEALTH_OK)
    });
  });

  await page.route("**/models", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MODELS_OK)
    });
  });

  await page.route("**/api/auth/me", async (route) => {
    const authenticated = typeof options?.authAuthenticated === "function"
      ? options.authAuthenticated()
      : options?.authAuthenticated !== false;

    await route.fulfill({
      status: authenticated ? 200 : 401,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated
      })
    });
  });

  if (options?.matrixStatus === "ok") {
    await page.route("**/api/matrix/whoami", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MATRIX_WHOAMI_OK)
      });
    });

    await page.route("**/api/matrix/joined-rooms", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MATRIX_ROOMS_OK)
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
            message: "Matrix backend is unavailable"
          }
        })
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
            message: "Matrix backend is unavailable"
          }
        })
      });
    });
  } else if (options?.matrixStatus === "malformed") {
    await page.route("**/api/matrix/whoami", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true })
      });
    });

    await page.route("**/api/matrix/joined-rooms", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, rooms: [{}] })
      });
    });
  }
}

type GitHubWorkspaceMockOptions = {
  proposalStale?: boolean;
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
    verify: 0
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
            checkedAt: "2026-04-16T08:00:00.000Z"
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
            checkedAt: "2026-04-16T08:00:00.000Z"
          }
        ]
      })
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
            checkedAt: "2026-04-16T08:00:00.000Z"
          },
          ref: "main",
          baseSha: "abc123",
          question: "Beschreibe die Projektstruktur und nenne die sichere nächste Aktion.",
          files: [
            {
              path: "README.md",
              sha: "sha-readme",
              excerpt: "Demo",
              citations: [],
              truncated: false
            },
            {
              path: "web/src/App.tsx",
              sha: "sha-app",
              excerpt: "App",
              citations: [],
              truncated: false
            }
          ],
          citations: [],
          tokenBudget: {
            maxTokens: 1000,
            usedTokens: 100,
            truncated: false
          },
          warnings: [],
          generatedAt: "2026-04-16T08:00:00.000Z"
        }
      })
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
            checkedAt: "2026-04-16T08:00:00.000Z"
          },
          baseRef: "main",
          baseSha: "abc123",
          branchName: "modelgate/demo-plan",
          targetBranch: "main",
          status: "pending_review",
          stale: Boolean(options.proposalStale),
          requiresApproval: true,
          summary: "Demo plan",
          rationale: "Nur ein Beispielplan.",
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
              citations: []
            }
          ],
          generatedAt: "2026-04-16T08:00:00.000Z",
          expiresAt: "2026-04-16T09:00:00.000Z"
        }
      })
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
        body: JSON.stringify(options.executeResponse.body)
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
          executedAt: "2026-04-16T08:30:00.000Z"
        }
      })
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
        body: JSON.stringify(options.verifyResponse.body)
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
          mismatchReasons: []
        }
      })
    });
  });

  return counters;
}

async function loadConsole(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("app-shell")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("ModelGate Console")).toBeVisible();
  await expect(page.getByTestId("tab-chat")).toBeVisible();
  await expect(page.getByTestId("tab-github")).toBeVisible();
  await expect(page.getByTestId("tab-matrix")).toBeVisible();
  await expect(page.getByTestId("tab-review")).toBeVisible();
  await expect(page.getByTestId("tab-settings")).toBeVisible();
}

async function waitForMatrixWorkspace(page: Page) {
  await expect(page.getByTestId("matrix-status")).toHaveText("Matrix topic slice ready");
  await expect(page.getByTestId("matrix-topic-update-panel")).toBeVisible();
  await expect(page.getByTestId("matrix-composer-panel")).toBeVisible();
  await expect(page.getByTestId("matrix-rooms")).toBeVisible();
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
            }, 50);

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

async function waitForPwaRegistration(page: Page) {
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/icon.svg");
  await expect.poll(async () =>
    page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) {
        return 0;
      }

      const registrations = await navigator.serviceWorker.getRegistrations();
      return registrations.length;
    })
  ).toBeGreaterThan(0);
}

function submitChord() {
  return process.platform === "darwin" ? "Meta+Enter" : "Control+Enter";
}

test("app shell renders, tabs open, header shows backend truth, and secrets stay out of DOM text", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  const requestUrls: string[] = [];
  page.on("request", (request) => {
    requestUrls.push(request.url());
  });
  await loadConsole(page);

  await expect(page.getByTestId("shell-summary-card")).toBeVisible();
  await expect(page.locator(".global-status-banner")).toHaveCount(0);

  await page.getByTestId("tab-chat").click();
  await expect(page.getByRole("heading", { name: "Chat" })).toBeVisible();
  await expect(page.getByTestId("chat-workspace")).toBeVisible();

  await page.getByTestId("tab-github").click();
  await expect(page.getByTestId("github-workspace")).toBeVisible();

  const body = page.locator("body");
  await expect(body).not.toContainText("Dashboard");
  await expect(body).not.toContainText("Active Streams");
  await expect(body).not.toContainText("Security Matrix");
  await expect(body).not.toContainText("Telemetry");
  await expect(body).not.toContainText("Logs");
  await expect(body).not.toContainText("GitHub bereit");
  await expect(body).not.toContainText("openrouter/auto");
  await expect(body).not.toContainText("anthropic/claude-3.5-sonnet");
  await expect(body).not.toContainText("sk-test-openrouter-key");
  await expect(body).not.toContainText("sk-test-matrix-token");
  expect(requestUrls.every((url) => !url.includes("api.github.com") && !url.includes("matrix.org"))).toBe(true);
});

test("workspace navigation is keyboard reachable and status regions are labeled", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);

  await expect(page.locator("nav.sidebar-nav")).toHaveAttribute("aria-label", "Primary workspace navigation");
  await expect(page.locator('[data-testid="workspace-session-list"]')).toHaveAttribute("aria-label", "Chat session list");
  await expect(page.locator("section.status-panel-card").first()).toHaveAttribute("aria-label", "Chatstatus");

  const chatTab = page.getByTestId("tab-chat");
  const githubTab = page.getByTestId("tab-github");
  const matrixTab = page.getByTestId("tab-matrix");

  await chatTab.focus();
  await expect(chatTab).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(githubTab).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("github-workspace")).toBeVisible();
  await expect(githubTab).toHaveAttribute("aria-current", "page");

  await page.keyboard.press("Tab");
  await expect(matrixTab).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("matrix-workspace")).toBeVisible();
  await expect(matrixTab).toHaveAttribute("aria-current", "page");
});

test("chat draft survives workspace switches and a reload keeps the composer usable", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);

  await page.getByTestId("tab-chat").click();
  const chatComposer = page.getByRole("textbox", { name: "Chat composer" });
  await chatComposer.fill("Persist this draft");
  await expect(page.getByTestId("workspace-session-list")).toContainText("Persist this draft");

  await page.getByTestId("workspace-create-session").click();
  await expect(page.getByTestId("workspace-session-list").locator('[data-testid^="workspace-session-item-"]')).toHaveCount(2);
  await expect(chatComposer).toHaveValue("");

  await page.getByTestId("workspace-session-list").getByRole("button", { name: /Persist this draft/ }).click();
  await expect(chatComposer).toHaveValue("Persist this draft");

  await page.getByTestId("tab-matrix").click();
  await waitForMatrixWorkspace(page);
  await page.getByTestId("tab-chat").click();
  await expect(chatComposer).toHaveValue("Persist this draft");
  await expect(page.locator("#model-select")).toHaveValue("default");

  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("tab-chat")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("workspace-session-list")).toContainText("Persist this draft");
  await expect(chatComposer).toHaveValue("Persist this draft");
  await expect(page.getByRole("button", { name: "Stopp" })).toHaveCount(0);
  await chatComposer.fill("Reload still works");
  await expect(page.getByTestId("chat-send")).toBeEnabled();
});

test("legacy Matrix state is re-saved in canonical topic-update form", async ({ page }) => {
  const storageKey = "modelgate.console.workspaces.v1";

  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);

  const persistedState = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), storageKey);
  const matrixSession = persistedState.sessionsByWorkspace.matrix[0];

  expect(matrixSession).toBeTruthy();

  matrixSession.metadata = {
    ...matrixSession.metadata,
    topicText: "New topic",
    topicPlan: {
      planId: "plan_topic_state",
      roomId: "!room:matrix.example",
      scopeId: "scope-state",
      snapshotId: "snapshot-state",
      status: "pending_review",
      actions: [
        {
          type: "set_room_topic",
          roomId: "!room:matrix.example",
          currentValue: "Old topic",
          proposedValue: "New topic"
        }
      ],
      currentValue: "Old topic",
      proposedValue: "New topic",
      risk: "low",
      requiresApproval: true,
      createdAt: "2026-04-16T08:00:00.000Z",
      expiresAt: "2026-04-16T09:00:00.000Z"
    },
    promotedPlan: {
      planId: "legacy-plan",
      targetRoomId: "!room:matrix.example",
      summary: "Legacy summary",
      rationale: "Legacy rationale",
      requiredApproval: true,
      stale: false,
      payloadDelta: {
        before: { topic: "Old topic" },
        after: { topic: "New topic" }
      },
      impactSummary: [],
      riskLevel: "low_surface",
      expectedPermissions: [],
      authorizationRequirements: [],
      preflightStatus: "unknown",
      snapshotId: "snapshot-legacy",
      scopeId: "scope-legacy"
    },
    analysisPrompt: "Legacy prompt",
    analysisResult: { snapshotId: "snapshot-legacy" },
    analysisError: "Legacy error",
    analysisLoading: true,
    selectedCandidateId: "candidate-legacy",
    promotionLoading: true,
    promotionError: "Legacy promote error"
  };

  await page.evaluate(
    ({ key, state }) => {
      localStorage.setItem(key, JSON.stringify(state));
    },
    { key: storageKey, state: persistedState },
  );

  await loadConsole(page);
  await page.getByTestId("tab-matrix").click();
  await waitForMatrixWorkspace(page);
  await expect(page.getByTestId("workspace-session-list")).toContainText("Review nötig");

  const reloadedState = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), storageKey);
  const reloadedMatrixMetadata = reloadedState.sessionsByWorkspace.matrix[0]?.metadata ?? {};

  expect(reloadedMatrixMetadata.topicPlan?.planId).toBe("plan_topic_state");
  expect(reloadedMatrixMetadata.promotedPlan).toBeUndefined();
  expect(reloadedMatrixMetadata.analysisPrompt).toBeUndefined();
  expect(reloadedMatrixMetadata.analysisResult).toBeUndefined();
  expect(reloadedMatrixMetadata.analysisError).toBeUndefined();
  expect(reloadedMatrixMetadata.analysisLoading).toBeUndefined();
  expect(reloadedMatrixMetadata.selectedCandidateId).toBeUndefined();
  expect(reloadedMatrixMetadata.promotionLoading).toBeUndefined();
  expect(reloadedMatrixMetadata.promotionError).toBeUndefined();
});

test("PWA manifest and service worker registration are wired", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);
  await waitForPwaRegistration(page);

  const manifest = await page.evaluate(async () => {
    const response = await fetch("/manifest.webmanifest");
    return response.json();
  });

  expect(manifest).toMatchObject({
    name: "ModelGate",
    short_name: "ModelGate",
    display: "standalone",
    theme_color: "#07111f"
  });
});

test("beginner hides technical GitHub fields while expert details reveal them", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });

  await page.route("**/api/github/repos", async (route) => {
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
            checkedAt: "2026-04-16T08:00:00.000Z"
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
            checkedAt: "2026-04-16T08:00:00.000Z"
          }
        ]
      })
    });
  });

  await page.route("**/api/github/context", async (route) => {
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
            checkedAt: "2026-04-16T08:00:00.000Z"
          },
          ref: "main",
          baseSha: "abc123",
          question: "Beschreibe die Projektstruktur und nenne die sichere nächste Aktion.",
          files: [
            {
              path: "README.md",
              sha: "sha-readme",
              excerpt: "Demo",
              citations: [],
              truncated: false
            }
          ],
          citations: [],
          tokenBudget: {
            maxTokens: 1000,
            usedTokens: 100,
            truncated: false
          },
          warnings: [],
          generatedAt: "2026-04-16T08:00:00.000Z"
        }
      })
    });
  });

  await page.route("**/api/github/actions/propose", async (route) => {
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
            checkedAt: "2026-04-16T08:00:00.000Z"
          },
          baseRef: "main",
          baseSha: "abc123",
          branchName: "modelgate/demo-plan",
          targetBranch: "main",
          status: "pending_review",
          stale: false,
          requiresApproval: true,
          summary: "Demo plan",
          rationale: "Nur ein Beispielplan.",
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
              citations: []
            }
          ],
          generatedAt: "2026-04-16T08:00:00.000Z",
          expiresAt: "2026-04-16T09:00:00.000Z"
        }
      })
    });
  });

  await loadConsole(page);
  await page.getByTestId("tab-github").click();

  await expect(page.locator(".empty-state-card").getByRole("heading", { name: "Noch kein GitHub-Repo ausgewählt" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("octo/demo");
  await expect(page.locator("body")).not.toContainText("plan-123");
  await expect(page.locator("body")).not.toContainText("Anfrage-ID");
  await expect(page.locator("body")).not.toContainText("Plan-ID");

  await page.getByLabel("Repo auswählen").selectOption({ label: "Repository 1" });
  await page.getByRole("button", { name: "Analyse starten" }).click();
  await expect(page.getByText("Analyse abgeschlossen")).toBeVisible();
  await page.getByRole("button", { name: "Vorschlag erstellen" }).click();
  await expect(page.getByText("Bereit zur Freigabe")).toBeVisible();

  await expect(page.locator("body")).not.toContainText("Anfrage-ID");
  await expect(page.locator("body")).not.toContainText("Plan-ID");
  await expect(page.locator("body")).not.toContainText("Branch: n/a");
  await expect(page.locator("body")).not.toContainText("Commit: n/a");
  await expect(page.locator("body")).not.toContainText("GitHub API Status");
  await expect(page.locator("body")).not.toContainText("Anfrage: n/a");
  await expect(page.locator("body")).not.toContainText("Plan: n/a");
  await expect(page.locator("body")).not.toContainText("Route: -");

  await page.getByRole("button", { name: "Expert" }).click();
  await expect(page.getByTestId("github-workspace").locator(".expert-details").locator("summary")).toHaveText("Diagnostics");
  await expect(page.getByTestId("github-workspace").locator(".expert-details").getByText("Anfrage-ID", { exact: true })).toBeVisible();
  await expect(page.getByTestId("github-workspace").locator(".expert-details").getByText("Plan-ID", { exact: true })).toBeVisible();
  await expect(page.getByTestId("github-workspace").locator(".expert-details").getByText("Route")).toBeVisible();
});

test("GitHub approval gate executes once, verifies the PR, and shows the result", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  const counters = await installGitHubWorkspaceMocks(page);

  await loadConsole(page);
  await page.getByTestId("tab-github").click();
  await page.getByLabel("Repo auswählen").selectOption({ label: "Repository 1" });
  await page.getByRole("button", { name: "Analyse starten" }).click();
  await page.getByRole("button", { name: "Vorschlag erstellen" }).click();

  const approval = page.getByLabel("Ich habe den Vorschlag geprüft und möchte einen Pull Request erstellen.");
  const executeButton = page.getByRole("button", { name: "Freigeben und ausführen" });

  await expect(page.getByTestId("github-approval-gate")).toBeVisible();
  await expect(approval).not.toBeChecked();
  await expect(executeButton).toBeDisabled();

  await approval.check();
  await expect(executeButton).toBeEnabled();
  await executeButton.click();

  await expect(page.getByTestId("github-pr-result")).toBeVisible();
  await expect(page.getByTestId("github-pr-result")).toContainText("Pull Request erstellt");
  await expect(page.getByTestId("github-pr-result")).toContainText("Geprüft");
  await expect(page.getByTestId("github-pr-result")).toContainText("Bereit zur Prüfung auf GitHub");
  await expect(page.getByRole("link", { name: "Auf GitHub öffnen" })).toBeVisible();
  await expect(approval).not.toBeChecked();

  expect(counters.execute).toBe(1);
  expect(counters.verify).toBe(1);
});

test("stale GitHub plans block execution and clear approval", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  const counters = await installGitHubWorkspaceMocks(page, {
    executeResponse: {
      status: 409,
      body: {
        ok: false,
        error: {
          code: "github_stale_plan",
          message: "GitHub plan is stale and must be refreshed"
        }
      }
    }
  });

  await loadConsole(page);
  await page.getByTestId("tab-github").click();
  await page.getByLabel("Repo auswählen").selectOption({ label: "Repository 1" });
  await page.getByRole("button", { name: "Analyse starten" }).click();
  await page.getByRole("button", { name: "Vorschlag erstellen" }).click();

  const approval = page.getByLabel("Ich habe den Vorschlag geprüft und möchte einen Pull Request erstellen.");
  const executeButton = page.getByRole("button", { name: "Freigeben und ausführen" });

  await approval.check();
  await executeButton.click();

  await expect(page.getByTestId("github-workspace-notice")).toHaveText("Der Vorschlag ist veraltet und muss neu erstellt werden.");
  await expect(approval).not.toBeChecked();
  await expect(executeButton).toBeDisabled();
  await expect(page.getByTestId("github-pr-result")).toHaveCount(0);

  expect(counters.execute).toBe(1);
  expect(counters.verify).toBe(0);
});

test("changing the selected GitHub repo clears approval and hides execution controls", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await installGitHubWorkspaceMocks(page);

  await loadConsole(page);
  await page.getByTestId("tab-github").click();
  await page.getByLabel("Repo auswählen").selectOption({ label: "Repository 1" });
  await page.getByRole("button", { name: "Analyse starten" }).click();
  await page.getByRole("button", { name: "Vorschlag erstellen" }).click();

  const approval = page.getByLabel("Ich habe den Vorschlag geprüft und möchte einen Pull Request erstellen.");
  await approval.check();
  await expect(approval).toBeChecked();

  await page.getByLabel("Repo auswählen").selectOption({ label: "Repository 2" });

  await expect(page.getByTestId("github-approval-gate")).toHaveCount(0);
  await expect(page.getByTestId("github-pr-result")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Freigeben und ausführen" })).toHaveCount(0);
});

test("chat remains proposal-only and cannot trigger GitHub execute or verify routes", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });

  const counters = {
    execute: 0,
    verify: 0
  };

  await page.route("**/api/github/actions/**/execute", async (route) => {
    counters.execute += 1;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: {
          code: "unexpected_route",
          message: "execute should not be called from chat"
        }
      })
    });
  });

  await page.route("**/api/github/actions/**/verify", async (route) => {
    counters.verify += 1;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: {
          code: "unexpected_route",
          message: "verify should not be called from chat"
        }
      })
    });
  });

  await page.route("**/chat", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: CHAT_STREAM
    });
  });

  await loadConsole(page);
  await page.getByTestId("tab-chat").click();
  await page.getByTestId("chat-composer").fill("Hello");
  await page.getByTestId("chat-send").click();
  await expect(page.getByText("Hello from mocked backend")).toBeVisible();
  await expect(page.getByRole("button", { name: "Freigeben und ausführen" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ergebnis prüfen" })).toHaveCount(0);

  expect(counters.execute).toBe(0);
  expect(counters.verify).toBe(0);
});

test("GitHub expert details stay hidden in beginner mode and reveal execution metadata in Expert mode", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await installGitHubWorkspaceMocks(page);

  await loadConsole(page);
  await page.getByTestId("tab-github").click();
  await page.getByLabel("Repo auswählen").selectOption({ label: "Repository 1" });
  await page.getByRole("button", { name: "Analyse starten" }).click();
  await page.getByRole("button", { name: "Vorschlag erstellen" }).click();

  const approval = page.getByLabel("Ich habe den Vorschlag geprüft und möchte einen Pull Request erstellen.");
  await approval.check();
  await page.getByRole("button", { name: "Freigeben und ausführen" }).click();

  const body = page.locator("body");
  await expect(body).not.toContainText("Anfrage-ID");
  await expect(body).not.toContainText("Plan-ID");
  await expect(body).not.toContainText("Branch");
  await expect(body).not.toContainText("Commit");
  await expect(body).not.toContainText("Route");
  await expect(body).not.toContainText("GitHub API Status");
  await expect(body).not.toContainText("raw diff");

  await page.getByRole("button", { name: "Expert" }).click();
  const expertDetails = page.getByTestId("github-workspace").locator(".expert-details");
  await expect(expertDetails.getByText("Anfrage-ID", { exact: true })).toBeVisible();
  await expect(expertDetails.getByText("Plan-ID", { exact: true })).toBeVisible();
  await expect(expertDetails.getByText("Branch", { exact: true })).toBeVisible();
  await expect(expertDetails.getByText("Commit", { exact: true })).toBeVisible();
  await expect(expertDetails.getByText("Pull Request", { exact: true })).toBeVisible();
  await expect(expertDetails.getByText("Verifikation", { exact: true })).toBeVisible();
  await expect(page.getByTestId("github-workspace").getByText("Pull Request URL:")).toBeVisible();
  await expect(page.getByTestId("github-workspace").locator(".reference-chip").getByText("README.md", { exact: true })).toBeVisible();
});

test("beginner hides Matrix identifiers while expert details reveal them", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  const requestUrls: string[] = [];
  page.on("request", (request) => {
    requestUrls.push(request.url());
  });
  await loadConsole(page);

  await page.getByTestId("tab-matrix").click();
  await waitForMatrixWorkspace(page);

  const rooms = page.getByTestId("matrix-rooms");
  await expect(rooms.getByText("Room name", { exact: true })).toBeVisible();
  await expect(rooms).not.toContainText("!room:matrix.example");
  await expect(rooms).not.toContainText("@user:matrix.example");
  await expect(page.locator(".workspace-context")).not.toContainText("https://matrix.example");
  await expect(page.locator(".workspace-context")).not.toContainText("Route");
  await expect(page.locator(".workspace-context")).not.toContainText("HTTP-Status");
  await expect(page.locator(".workspace-context")).not.toContainText("SSE lifecycle");

  await page.getByRole("button", { name: "Expert" }).click();
  const expertDetails = page.locator(".workspace-context").locator(".expert-details");
  await expect(expertDetails.locator("summary")).toHaveText("Matrix diagnostics");
  await expertDetails.locator("summary").click();
  await expect(expertDetails.getByText("Plan-ID", { exact: true })).toBeVisible();
  await expect(expertDetails.getByText("Composer mode", { exact: true })).toBeVisible();
  await expect(expertDetails.getByText("Composer room", { exact: true })).toBeVisible();
  await expect(expertDetails.getByText("Backend route", { exact: true })).toBeVisible();
  await expect(expertDetails.getByText("HTTP", { exact: true })).toBeVisible();
  await expect(expertDetails.getByText("SSE lifecycle", { exact: true })).toBeVisible();
  expect(requestUrls.every((url) => !url.includes("matrix.org"))).toBe(true);
});

test("Settings keeps diagnostics secondary and removes duplicate system status copy", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);

  await page.getByTestId("tab-settings").click();
  await expect(page.getByTestId("settings-workspace")).toBeVisible();
  await expect(page.getByTestId("settings-workspace")).not.toContainText("Systemstatus");
  await expect(page.getByTestId("settings-workspace")).not.toContainText("Diagnose leeren");
  await expect(page.getByTestId("settings-workspace")).not.toContainText("Route");

  await page.getByTestId("settings-workspace").getByRole("button", { name: "Expert" }).click();
  await expect(page.getByTestId("settings-workspace").getByRole("button", { name: "Diagnose leeren" })).toBeVisible();
});

test("chat keyboard submit is wired, requests the backend, and keeps focus usable", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });

  const chatRequests: Array<{ stream?: boolean; messages?: Array<{ role: string; content: string }> }> = [];

  await page.route("**/chat", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    chatRequests.push(route.request().postDataJSON() as { stream?: boolean; messages?: Array<{ role: string; content: string }> });

    await new Promise((resolve) => setTimeout(resolve, 1200));

    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body: CHAT_STREAM
    });
  });

  await loadConsole(page);

  const composer = page.getByRole("textbox", { name: "Chat composer" });
  const sendButton = page.getByTestId("chat-send");
  const connectionState = page.getByTestId("chat-connection-state");

  await expect(composer).toBeVisible();
  await expect(page.getByTestId("tab-chat")).toBeVisible();
  await expect(page.getByTestId("tab-matrix")).toBeVisible();
  await expect(page.getByRole("button", { name: "Jump to latest" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stopp" })).toHaveCount(0);
  await expect(page.locator(".message-list")).toHaveAttribute("aria-live", "polite");
  await expect(sendButton).toBeDisabled();
  await expect(connectionState).toHaveText("Bereit");

  await composer.fill("Please harden the browser harness");
  await expect(sendButton).toBeEnabled();

  await composer.press(submitChord());

  await expect(sendButton).toBeDisabled();
  await expect(page.getByRole("button", { name: "Stopp" })).toBeVisible();
  await expect(connectionState).toHaveText(/Senden|Antwort läuft|Fertig/);
  await expect(page.getByText("Hello from mocked backend")).toBeVisible();
  await expect(connectionState).toHaveText("Fertig");
  await expect(page.getByRole("button", { name: "Stopp" })).toHaveCount(0);
  await expect(page.locator(".message-user")).toHaveCount(1);
  await expect(page.locator(".message-assistant")).toHaveCount(1);
  await composer.focus();
  await expect(composer).toBeFocused();

  expect(chatRequests).toHaveLength(1);
  expect(chatRequests[0].stream).toBe(true);
  expect(chatRequests[0].messages?.[0]).toMatchObject({
    role: "user",
    content: "Please harden the browser harness"
  });
});

test("chat abort stops the active stream, clears the draft, and returns the composer to a usable state", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await installAbortableChatFetchMock(page);

  await loadConsole(page);
  await page.getByTestId("tab-chat").click();

  const composer = page.getByRole("textbox", { name: "Chat composer" });
  const sendButton = page.getByTestId("chat-send");

  await expect(page.getByRole("button", { name: "Stopp" })).toHaveCount(0);
  await composer.fill("Abort this stream");
  await sendButton.click();

  await expect(page.getByRole("button", { name: "Stopp" })).toBeVisible();
  await expect(page.getByTestId("chat-connection-state")).toHaveText(/Senden|Antwort läuft/);
  await expect(page.locator(".stream-draft-card")).toContainText("Partial reply");

  await page.getByRole("button", { name: "Stopp" }).click();

  await expect(page.getByRole("button", { name: "Stopp" })).toHaveCount(0);
  await expect(page.getByTestId("chat-connection-state")).toHaveText("Fehler");
  await expect(page.getByRole("alert")).toContainText("Stream cancelled.");
  await expect(page.locator(".stream-draft-card")).toHaveCount(0);
  await expect(page.locator(".message-user")).toHaveCount(1);
  await expect(page.locator(".message-assistant")).toHaveCount(0);
  await expect(composer).toBeEnabled();
  await composer.fill("Retry after abort");
  await expect(sendButton).toBeEnabled();
});

test("empty composer cannot submit and sends no backend request", async ({ page }) => {
  await installBaseMocks(page);

  let chatRequestCount = 0;

  await page.route("**/chat", async (route) => {
    if (route.request().method() === "POST") {
      chatRequestCount += 1;
    }

    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body: CHAT_STREAM
    });
  });

  await loadConsole(page);

  const composer = page.getByRole("textbox", { name: "Chat composer" });
  const sendButton = page.getByRole("button", { name: "Send" });

  await expect(sendButton).toBeDisabled();
  await composer.focus();
  await composer.press(submitChord());

  expect(chatRequestCount).toBe(0);
  await expect(connectionState(page)).toHaveText("Bereit");
  await expect(composer).toBeFocused();
});

test("backend chat error renders visibly and does not finalize a fake assistant message", async ({ page }) => {
  await installBaseMocks(page);

  await page.route("**/chat", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify(CHAT_ERROR)
    });
  });

  await loadConsole(page);

  const composer = page.getByRole("textbox", { name: "Chat composer" });

  await composer.fill("Tell me why this should fail");
  await composer.press(submitChord());

  await expect(page.getByRole("alert")).toHaveText(/mocked backend failure/);
  await expect(connectionState(page)).toHaveText("Fehler");
  await expect(page.locator(".message-user")).toHaveCount(1);
  await expect(page.locator(".message-assistant")).toHaveCount(0);
  await composer.focus();
  await expect(composer).toBeFocused();
});

test("Matrix Explore shows read-only backend state", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);

  await page.getByTestId("tab-matrix").click();
  await waitForMatrixWorkspace(page);
  await expect(page.getByTestId("matrix-rooms").getByText("Room name")).toBeVisible();
  await expect(page.getByTestId("matrix-rooms")).not.toContainText("!room:matrix.example");
  await expect(page.getByTestId("matrix-workspace")).not.toContainText("@user:matrix.example");
  await expect(page.getByTestId("matrix-workspace")).not.toContainText("https://matrix.example");
  await expect(page.getByTestId("matrix-workspace")).toContainText("Bereichstatus");
  await expect(page.getByTestId("matrix-workspace")).toContainText("Sicherheit: Nur Lesen aktiv");
});

test("Matrix composer exposes explicit actions and fails closed on submit", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);

  await page.getByTestId("tab-matrix").click();
  await waitForMatrixWorkspace(page);
  await expect(page.getByTestId("matrix-composer-panel")).toBeVisible();

  await page.getByTestId("matrix-composer-room-id").fill("!room:matrix.example");
  await page.getByTestId("matrix-new-post").click();
  await expect(page.getByTestId("matrix-composer-mode-label")).toContainText("post");

  await page.getByTestId("matrix-composer-post-id").fill("evt-thread-root");
  await page.getByTestId("matrix-thread-open").click();
  await expect(page.getByTestId("matrix-thread-context")).toContainText("Thread zu Beitrag evt-thread-root");
  await expect(page.getByTestId("matrix-composer-mode-label")).toContainText("thread");

  await page.getByTestId("matrix-thread-leave").click();
  await expect(page.getByTestId("matrix-thread-context")).toContainText("Noch kein Thread geöffnet");
  await expect(page.getByTestId("matrix-composer-mode-label")).toContainText("post");

  await page.getByTestId("matrix-composer-draft").fill("Hello Matrix");
  await page.getByTestId("matrix-composer-submit").click();

  await expect(page.getByTestId("matrix-composer-result")).toContainText("Kein Backend-Write-Contract");
  await expect(page.getByTestId("matrix-composer-result")).toContainText("fail-closed");
});

test("Matrix provenance loads from the read-only backend route", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });

  let scopeResolveCount = 0;
  let scopeSummaryCount = 0;
  let provenanceCount = 0;
  const provenanceRequests: string[] = [];

  await page.route("**/api/matrix/scope/resolve", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    scopeResolveCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        scope: {
          scopeId: "scope-provenance",
          type: "room",
          rooms: [
            {
              roomId: "!room:matrix.example",
              name: "ModelGate Test",
              canonicalAlias: "#modelgate-test:matrix.example",
              roomType: "room",
              members: 1,
              lastEventSummary: "Latest room event",
            },
          ],
          createdAt: "2026-04-15T08:00:00.000Z",
        },
      }),
    });
  });

  await page.route("**/api/matrix/scope/scope-provenance/summary", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    scopeSummaryCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        scopeId: "scope-provenance",
        snapshotId: "snapshot-provenance",
        generatedAt: "2026-04-15T08:00:30.000Z",
        items: [
          {
            roomId: "!room:matrix.example",
            name: "ModelGate Test",
            canonicalAlias: "#modelgate-test:matrix.example",
            members: 1,
            lastEventSummary: "Latest room event",
            freshnessMs: 1200,
            selected: true,
          },
        ],
      }),
    });
  });

  await page.route("**/api/matrix/rooms/!room%3Amatrix.example/provenance", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    provenanceCount += 1;
    provenanceRequests.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        roomId: "!room:matrix.example",
        snapshotId: null,
        stateEventId: null,
        originServer: "https://matrix.example",
        authChainIndex: 0,
        signatures: [
          {
            signer: "@user:matrix.example",
            status: "derived",
          },
        ],
        integrityNotice: "Read-only room metadata derived from joined rooms.",
      }),
    });
  });

  await loadConsole(page);
  await page.getByTestId("tab-matrix").click();
  await waitForMatrixWorkspace(page);
  await page.getByTestId("matrix-rooms").getByText("Room name", { exact: true }).click();
  await page.getByRole("button", { name: "Resolve scope" }).click();

  await expect.poll(() => scopeResolveCount).toBe(1);
  await expect.poll(() => scopeSummaryCount).toBe(1);
  await expect.poll(() => provenanceCount).toBe(1);
  await expect(page.locator(".scope-summary-item-active")).toContainText("ModelGate Test");
  await expect(provenanceRequests[0] ?? "").toContain("/api/matrix/rooms/!room%3Amatrix.example/provenance");
});

test("Matrix tab stays on the topic-update slice and hides legacy contract-only controls", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);
  await page.getByTestId("tab-matrix").click();
  await waitForMatrixWorkspace(page);

  await expect(page.getByTestId("matrix-topic-update-panel")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Browser-Vorschau");
  await expect(page.locator("body")).not.toContainText("Hierarchy preview (advisory)");
  await expect(page.locator("body")).not.toContainText("Analyze (contract-only)");
  await expect(page.locator("body")).not.toContainText("Approve and execute (contract-only)");
  await expect(page.locator("body")).not.toContainText("Dismiss (contract-only)");
  await expect(page.locator("body")).not.toContainText("Grounded review of the selected scope");

  await page.getByRole("button", { name: "Expert" }).click();
  await expect(page.getByText("Hierarchy preview (advisory)")).toBeVisible();
  await expect(page.getByText("Browser-side mock only. Not backend-verified or write-authoritative.")).toBeVisible();
});

test("Matrix fail-closed rendering surfaces malformed Matrix responses", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "malformed" });
  await loadConsole(page);

  await page.getByTestId("tab-matrix").click();
  await expect(page.getByTestId("matrix-status")).toContainText("Matrix topic slice error");
  await expect(page.getByTestId("matrix-rooms")).toBeVisible();
  await expect(page.getByTestId("matrix-identity-error")).toContainText("Matrix whoami");
  await expect(page.getByTestId("matrix-rooms-error")).toContainText("Matrix joined rooms");

  const body = page.locator("body");
  await expect(body).not.toContainText("@user:matrix.example");
  await expect(body).not.toContainText("sk-test-openrouter-key");
  await expect(body).not.toContainText("sk-test-matrix-token");
});

test("Matrix room topic update success flows from prepare to verified execute", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });

  let analysisCount = 0;
  let executeCount = 0;
  let verifyCount = 0;

  await page.route("**/api/matrix/actions/promote", async () => {
    throw new Error("legacy Matrix promote route must not be called");
  });

  await page.route("**/api/matrix/analyze", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    analysisCount += 1;
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
  const roomId = page.getByTestId("matrix-topic-room-id");
  const topicText = page.getByTestId("matrix-topic-text");
  const planCard = page.getByTestId("matrix-topic-plan");
  const approveCheckbox = page.getByLabel("Ich bestätige die Freigabe für diese Änderung.");

  await roomId.fill("!room:matrix.example");
  await topicText.fill("New topic");

  await page.getByRole("button", { name: "Analyze topic update" }).click();

  await expect(planCard).toBeVisible();
  await expect(planCard).toContainText("Old topic");
  await expect(planCard).toContainText("New topic");
  await expect(planCard).toContainText("pending_review");
  await expect(planCard).toContainText("Expires at");

  const executeButton = page.getByTestId("matrix-topic-execute");
  await expect(executeButton).toBeDisabled();
  await approveCheckbox.check();
  await expect(executeButton).toBeEnabled();
  await executeButton.click();

  await expect(page.getByTestId("matrix-topic-execution")).toContainText("txn-topic-update");
  await expect(page.getByTestId("matrix-topic-verification")).toContainText("verified");
  await expect(page.getByTestId("matrix-topic-verification")).toContainText("New topic");

  expect(analysisCount).toBe(1);
  expect(executeCount).toBe(1);
  expect(verifyCount).toBe(1);
});

test("Matrix room topic update refresh reloads the canonical plan details", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });

  let refreshCount = 0;
  let releaseRefresh!: () => void;
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });

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
          planId: "plan-topic-refresh",
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

  await page.route("**/api/matrix/actions/plan-topic-refresh", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    refreshCount += 1;
    await refreshGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        plan: {
          planId: "plan-topic-refresh",
          roomId: "!room:matrix.example",
          scopeId: null,
          snapshotId: null,
          status: "pending_review",
          actions: [
            {
              type: "set_room_topic",
              roomId: "!room:matrix.example",
              currentValue: "Refreshed old topic",
              proposedValue: "Refreshed new topic",
            },
          ],
          currentValue: "Refreshed old topic",
          proposedValue: "Refreshed new topic",
          risk: "low",
          requiresApproval: true,
          createdAt: "2026-04-15T08:00:00.000Z",
          expiresAt: "2026-04-15T08:20:00.000Z",
        },
      }),
    });
  });

  await loadConsole(page);
  await page.getByTestId("tab-matrix").click();
  await waitForMatrixWorkspace(page);
  await page.getByTestId("matrix-topic-room-id").fill("!room:matrix.example");
  await page.getByTestId("matrix-topic-text").fill("New topic");
  await page.getByRole("button", { name: "Analyze topic update" }).click();

  const planCard = page.getByTestId("matrix-topic-plan");
  const refreshButton = page.getByTestId("matrix-topic-refresh");

  await expect(planCard).toBeVisible();
  await expect(planCard).toContainText("Old topic");
  await expect(planCard).toContainText("New topic");
  await expect(planCard).toContainText("pending_review");

  await refreshButton.click();
  await expect(refreshButton).toHaveText("Refreshing…");
  releaseRefresh();

  const refreshedExpiresAt = await page.evaluate(
    () =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date("2026-04-15T08:20:00.000Z")),
  );

  await expect(planCard).toContainText("Refreshed old topic");
  await expect(planCard).toContainText("Refreshed new topic");
  await expect(planCard).toContainText(refreshedExpiresAt);
  await expect(planCard).toContainText("Requires approval");
  await expect(planCard).toContainText("true");
  await expect(refreshButton).toHaveText("Refresh plan");
  expect(refreshCount).toBe(1);
});

test("Matrix room topic update refresh fails closed for expired plans", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });

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
          planId: "plan-expired-topic",
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

  await page.route("**/api/matrix/actions/plan-expired-topic", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 410,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: {
          code: "matrix_plan_expired",
          message: "Matrix plan is stale and must be refreshed",
        },
      }),
    });
  });

  await loadConsole(page);
  await page.getByTestId("tab-matrix").click();
  await waitForMatrixWorkspace(page);
  await page.getByTestId("matrix-topic-room-id").fill("!room:matrix.example");
  await page.getByTestId("matrix-topic-text").fill("New topic");
  await page.getByRole("button", { name: "Analyze topic update" }).click();

  await page.getByTestId("matrix-topic-refresh").click();

  await expect(page.getByTestId("matrix-topic-refresh-error")).toContainText("matrix_plan_expired");
  await expect(page.getByTestId("matrix-topic-refresh-error")).toContainText("stale");
  await expect(page.getByTestId("matrix-topic-plan")).toHaveCount(0);
  await expect(page.getByTestId("matrix-topic-execute")).toHaveCount(0);
});

test("Matrix room topic update refresh fails closed for missing plans", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });

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
          planId: "plan-missing-topic",
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

  await page.route("**/api/matrix/actions/plan-missing-topic", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: {
          code: "matrix_plan_not_found",
          message: "Matrix plan was not found",
        },
      }),
    });
  });

  await loadConsole(page);
  await page.getByTestId("tab-matrix").click();
  await waitForMatrixWorkspace(page);
  await page.getByTestId("matrix-topic-room-id").fill("!room:matrix.example");
  await page.getByTestId("matrix-topic-text").fill("New topic");
  await page.getByRole("button", { name: "Analyze topic update" }).click();

  await page.getByTestId("matrix-topic-refresh").click();

  await expect(page.getByTestId("matrix-topic-refresh-error")).toContainText("matrix_plan_not_found");
  await expect(page.getByTestId("matrix-topic-refresh-error")).toContainText("not found");
  await expect(page.getByTestId("matrix-topic-plan")).toHaveCount(0);
  await expect(page.getByTestId("matrix-topic-execute")).toHaveCount(0);
});

test("Matrix room topic update stale-plan failure is surfaced and does not fake success", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });

  let verifyCount = 0;

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
          planId: "plan-stale-topic",
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

  await page.route("**/api/matrix/actions/plan-stale-topic/execute", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: {
          code: "matrix_stale_plan",
          message: "Matrix plan is stale and must be refreshed",
        },
      }),
    });
  });

  await page.route("**/api/matrix/actions/plan-stale-topic/verify", async (route) => {
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
          planId: "plan-stale-topic",
          status: "pending",
          checkedAt: "2026-04-15T08:01:30.000Z",
          expected: "New topic",
          actual: "Old topic",
        },
      }),
    });
  });

  await loadConsole(page);
  await page.getByTestId("tab-matrix").click();
  await waitForMatrixWorkspace(page);
  await page.getByTestId("matrix-topic-room-id").fill("!room:matrix.example");
  await page.getByTestId("matrix-topic-text").fill("New topic");
  await page.getByRole("button", { name: "Analyze topic update" }).click();

  await page.getByLabel("Ich bestätige die Freigabe für diese Änderung").check();
  await page.getByTestId("matrix-topic-execute").click();

  await expect(page.getByTestId("matrix-topic-execute-error")).toContainText("matrix_stale_plan");
  await expect(page.getByTestId("matrix-topic-execute-error")).toContainText("stale");
  await expect(page.getByTestId("matrix-topic-execution")).toHaveCount(0);
  await expect(page.getByTestId("matrix-topic-verification")).toHaveCount(0);
  expect(verifyCount).toBe(0);
});

test("GitHub login fails closed until authenticated and then unlocks the workspace", async ({ page }) => {
  let authenticated = false;

  await installBaseMocks(page, { matrixStatus: "ok", authAuthenticated: () => authenticated });
  await installGitHubWorkspaceMocks(page);

  let loginAttempts = 0;

  await page.route("**/api/auth/login", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    loginAttempts += 1;

    if (loginAttempts === 1) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          code: "auth_invalid_credentials"
        })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true
      })
    });

    authenticated = true;
  });

  await page.route("**/api/auth/logout", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: false
      })
    });

    authenticated = false;
  });

  await loadConsole(page);
  await page.getByTestId("tab-github").click();

  await expect(page.getByTestId("github-admin-login")).toBeVisible();
  const password = page.getByLabel("Admin-Passwort");

  await password.fill("wrong-password");
  await page.getByRole("button", { name: "Anmelden" }).click();

  await expect(page.getByRole("alert")).toHaveText("Das Passwort ist falsch.");

  await password.fill("correct-password");
  await page.getByRole("button", { name: "Anmelden" }).click();

  await expect(page.getByTestId("github-workspace")).toBeVisible();
  await expect(page.getByRole("heading", { name: "GitHub Workspace" })).toBeVisible();
  await expect(page.locator("#github-repo-select")).toBeVisible();

  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page.getByTestId("github-admin-login")).toBeVisible();
  await expect(page.getByRole("heading", { name: "GitHub Login" })).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("github-admin-login")).toBeVisible();
  await expect(page.getByRole("button", { name: "Logout" })).toHaveCount(0);

  expect(loginAttempts).toBe(2);
});

test("Review aggregates GitHub and Matrix approval items across workspace switches", async ({ page }) => {
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
  await expect(page.getByTestId("review-workspace")).toContainText("Noch keine offenen Prüfungen.");

  await page.getByTestId("tab-github").click();
  await page.locator("#github-repo-select").selectOption("octo/demo");
  await page.getByRole("button", { name: "Analyse starten" }).click();
  await page.getByRole("button", { name: "Vorschlag erstellen" }).click();

  await page.getByTestId("tab-matrix").click();
  await waitForMatrixWorkspace(page);
  await page.getByTestId("matrix-topic-room-id").fill("!room:matrix.example");
  await page.getByTestId("matrix-topic-text").fill("New topic");
  await page.getByRole("button", { name: "Analyze topic update" }).click();

  await page.getByTestId("tab-review").click();
  const reviewCards = page.locator(".review-item-card");

  await expect(reviewCards).toHaveCount(2);
  await expect(page.getByTestId("review-workspace")).toContainText("2 offene Prüfungen");
  await expect(page.getByTestId("review-workspace")).toContainText("Demo plan");
  await expect(page.getByTestId("review-workspace")).toContainText("Room topic update plan");
  await expect(page.getByTestId("review-workspace")).toContainText("Wartet auf Freigabe");
});

test("Settings exposes diagnostics in Expert mode and can clear them", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);

  await page.getByTestId("tab-settings").click();
  await expect(page.getByTestId("settings-workspace")).toBeVisible();
  await expect(page.getByTestId("settings-workspace")).not.toContainText("Backend health loaded");

  const settingsWorkspace = page.getByTestId("settings-workspace");
  await settingsWorkspace.getByRole("button", { name: "Expert" }).click();

  await expect(settingsWorkspace.getByText("Backend health loaded")).toBeVisible();
  await expect(settingsWorkspace.getByText("Public model alias loaded")).toBeVisible();
  await settingsWorkspace.getByRole("button", { name: "Diagnose leeren" }).click();
  await expect(settingsWorkspace.getByText("Noch keine lokalen Diagnoseereignisse.")).toBeVisible();

  await page.getByTestId("tab-chat").click();
  await page.getByTestId("tab-settings").click();
  await expect(page.getByTestId("settings-workspace")).toContainText("Noch keine lokalen Diagnoseereignisse.");
  await expect(page.getByTestId("settings-workspace")).toContainText("Expert");
  await expect(page.getByTestId("settings-workspace")).toContainText("Beginner / Expert");
  await expect(page.getByTestId("settings-workspace").getByRole("button", { name: "Diagnose leeren" })).toBeVisible();
});

function connectionState(page: Page) {
  return page.getByTestId("chat-connection-state");
}
