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

async function installBaseMocks(page: Page, options?: { matrixStatus?: MatrixStatus }) {
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

async function loadConsole(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("app-shell")).toBeVisible();
  await expect(page.getByText("ModelGate Console")).toBeVisible();
  await expect(page.getByTestId("tab-chat")).toBeVisible();
  await expect(page.getByTestId("tab-github")).toBeVisible();
  await expect(page.getByTestId("tab-matrix")).toBeVisible();
  await expect(page.getByTestId("tab-review")).toBeVisible();
  await expect(page.getByTestId("tab-settings")).toBeVisible();
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

  await expect(page.locator("header.global-header").getByText("Backend healthy")).toBeVisible();
  await expect(page.locator("header.global-header").getByText("Public model alias: default")).toBeVisible();
  await expect(page.locator("header.global-header").getByText("modelgate-test · local · openrouter")).toBeVisible();

  await page.getByTestId("tab-chat").click();
  await expect(page.getByRole("heading", { name: "Chat" })).toBeVisible();
  await expect(page.getByTestId("chat-workspace")).toBeVisible();

  await page.getByTestId("tab-github").click();
  await expect(page.getByRole("heading", { name: "GitHub Workspace" })).toBeVisible();

  await page.getByTestId("tab-matrix").click();
  await expect(page.getByRole("heading", { name: "Matrix Workspace" })).toBeVisible();
  await expect(page.getByTestId("matrix-workspace")).toBeVisible();

  await page.getByTestId("tab-review").click();
  await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();
  await page.getByTestId("tab-settings").click();
  await expect(page.getByRole("heading", { name: "Einstellungen" })).toBeVisible();

  const body = page.locator("body");
  await expect(body).not.toContainText("Dashboard");
  await expect(body).not.toContainText("Active Streams");
  await expect(body).not.toContainText("Security Matrix");
  await expect(body).not.toContainText("Telemetry");
  await expect(body).not.toContainText("Logs");
  await expect(body).not.toContainText("Archive");
  await expect(body).not.toContainText("GitHub bereit");
  await expect(body).not.toContainText("openrouter/auto");
  await expect(body).not.toContainText("anthropic/claude-3.5-sonnet");
  await expect(body).not.toContainText("sk-test-openrouter-key");
  await expect(body).not.toContainText("sk-test-matrix-token");
  expect(requestUrls.every((url) => !url.includes("api.github.com") && !url.includes("matrix.org"))).toBe(true);
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

  await expect(page.locator(".empty-state-card").getByRole("heading", { name: "Noch kein Repository gewählt" })).toBeVisible();
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
  await expect(page.locator("body")).not.toContainText("octo/demo");

  await page.getByRole("button", { name: "Expert" }).click();
  await expect(page.getByText("Technische Details")).toBeVisible();
  await expect(page.getByText("Anfrage-ID")).toBeVisible();
  await expect(page.getByText("Plan-ID")).toBeVisible();
  await expect(page.getByText("Route")).toBeVisible();
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
  const sendButton = page.getByRole("button", { name: "Send" });
  const connectionState = page.getByTestId("chat-connection-state");

  await expect(composer).toBeVisible();
  await expect(page.getByRole("tab", { name: "Chat" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Matrix Workspace" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Jump to latest" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stopp" })).toBeVisible();
  await expect(page.locator(".message-list")).toHaveAttribute("aria-live", "polite");
  await expect(sendButton).toBeDisabled();
  await expect(connectionState).toHaveText("Bereit");

  await composer.fill("Please harden the browser harness");
  await expect(sendButton).toBeEnabled();

  await composer.press(submitChord());

  await expect(sendButton).toBeDisabled();
  await expect(connectionState).toHaveText(/Senden|Antwort läuft|Fertig/);
  await expect(page.getByText("Hello from mocked backend")).toBeVisible();
  await expect(connectionState).toHaveText("Fertig");
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
  await expect(page.getByTestId("matrix-status")).toHaveText("Matrix backend ready");
  await expect(page.getByTestId("matrix-workspace").locator(".workspace-summary-card").getByText("User: @user:matrix.example")).toBeVisible();
  await expect(page.getByTestId("matrix-rooms").getByText("Room name")).toBeVisible();
  await expect(page.getByTestId("matrix-rooms").getByText("!room:matrix.example")).toBeVisible();
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
            status: "verified",
          },
        ],
        integrityNotice: "Read-only room metadata derived from joined rooms.",
      }),
    });
  });

  await loadConsole(page);
  await page.getByTestId("tab-matrix").click();
  await page.getByTestId("matrix-rooms").getByRole("button", { name: "Room name" }).click();
  await page.getByRole("button", { name: "Proceed to Analyze" }).click();

  await expect.poll(() => scopeResolveCount).toBe(1);
  await expect.poll(() => scopeSummaryCount).toBe(1);
  await expect.poll(() => provenanceCount).toBe(1);
  await page.locator("button.workspace-tab").filter({ hasText: /^Explore$/ }).click();
  await expect(page.getByText("Mode: Explore")).toBeVisible();
  await expect(page.locator(".scope-summary").getByText("ModelGate Test", { exact: true })).toBeVisible();
  await expect(page.locator(".scope-summary").getByText("#modelgate-test:matrix.example", { exact: true })).toBeVisible();
  await page.locator("button.workspace-tab").filter({ hasText: /^Review$/ }).click();
  await expect(page.getByText("Mode: Review")).toBeVisible();
  await expect(page.locator(".provenance-card")).toBeVisible();
  await expect(page.getByText("Provenance", { exact: true })).toBeVisible();
  await expect(page.getByText("Read-only room metadata derived from joined rooms.")).toBeVisible();
  await expect(provenanceRequests[0] ?? "").toContain("/api/matrix/rooms/!room%3Amatrix.example/provenance");
});

test("Matrix fail-closed rendering surfaces malformed Matrix responses", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "malformed" });
  await loadConsole(page);

  await page.getByTestId("tab-matrix").click();
  await expect(page.getByTestId("matrix-status")).toHaveText("Matrix backend error");
  await expect(page.getByTestId("matrix-identity-error")).toContainText("Matrix whoami");
  await expect(page.getByTestId("matrix-rooms-error")).toContainText("Matrix joined rooms");

  const body = page.locator("body");
  await expect(body).not.toContainText("@user:matrix.example");
  await expect(body).not.toContainText("Room name");
  await expect(body).not.toContainText("sk-test-openrouter-key");
  await expect(body).not.toContainText("sk-test-matrix-token");
});

test("Matrix room topic update success flows from prepare to verified execute", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });

  let promoteCount = 0;
  let executeCount = 0;
  let verifyCount = 0;

  await page.route("**/api/matrix/actions/promote", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    promoteCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        plan: {
          planId: "plan-topic-update",
          type: "update_room_topic",
          roomId: "!room:matrix.example",
          status: "pending_review",
          createdAt: "2026-04-15T08:00:00.000Z",
          expiresAt: "2026-04-15T08:12:00.000Z",
          diff: {
            field: "topic",
            before: "Old topic",
            after: "New topic",
          },
          requiresApproval: true,
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
  await page.getByRole("button", { name: "Review" }).click();

  const roomId = page.getByTestId("matrix-topic-room-id");
  const topicText = page.getByTestId("matrix-topic-text");
  const planCard = page.getByTestId("matrix-topic-plan");
  const approveCheckbox = page.getByLabel("I approve backend execution of this topic update.");

  await roomId.fill("!room:matrix.example");
  await topicText.fill("New topic");

  await page.getByRole("button", { name: "Prepare topic update" }).click();

  await expect(planCard).toBeVisible();
  await expect(planCard).toContainText("!room:matrix.example");
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

  expect(promoteCount).toBe(1);
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

  await page.route("**/api/matrix/actions/promote", async (route) => {
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
          type: "update_room_topic",
          roomId: "!room:matrix.example",
          status: "pending_review",
          createdAt: "2026-04-15T08:00:00.000Z",
          expiresAt: "2026-04-15T08:12:00.000Z",
          diff: {
            field: "topic",
            before: "Old topic",
            after: "New topic",
          },
          requiresApproval: true,
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
          type: "update_room_topic",
          roomId: "!room:matrix.example",
          status: "pending_review",
          createdAt: "2026-04-15T08:00:00.000Z",
          expiresAt: "2026-04-15T08:20:00.000Z",
          diff: {
            field: "topic",
            before: "Refreshed old topic",
            after: "Refreshed new topic",
          },
          requiresApproval: true,
        },
      }),
    });
  });

  await loadConsole(page);
  await page.getByTestId("tab-matrix").click();
  await page.getByRole("button", { name: "Review" }).click();

  await page.getByTestId("matrix-topic-room-id").fill("!room:matrix.example");
  await page.getByTestId("matrix-topic-text").fill("New topic");
  await page.getByRole("button", { name: "Prepare topic update" }).click();

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

  await page.route("**/api/matrix/actions/promote", async (route) => {
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
          type: "update_room_topic",
          roomId: "!room:matrix.example",
          status: "pending_review",
          createdAt: "2026-04-15T08:00:00.000Z",
          expiresAt: "2026-04-15T08:12:00.000Z",
          diff: {
            field: "topic",
            before: "Old topic",
            after: "New topic",
          },
          requiresApproval: true,
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
  await page.getByRole("button", { name: "Review" }).click();

  await page.getByTestId("matrix-topic-room-id").fill("!room:matrix.example");
  await page.getByTestId("matrix-topic-text").fill("New topic");
  await page.getByRole("button", { name: "Prepare topic update" }).click();

  await page.getByTestId("matrix-topic-refresh").click();

  await expect(page.getByTestId("matrix-topic-refresh-error")).toContainText("matrix_plan_expired");
  await expect(page.getByTestId("matrix-topic-refresh-error")).toContainText("stale");
  await expect(page.getByTestId("matrix-topic-plan")).toHaveCount(0);
  await expect(page.getByTestId("matrix-topic-execute")).toHaveCount(0);
});

test("Matrix room topic update refresh fails closed for missing plans", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });

  await page.route("**/api/matrix/actions/promote", async (route) => {
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
          type: "update_room_topic",
          roomId: "!room:matrix.example",
          status: "pending_review",
          createdAt: "2026-04-15T08:00:00.000Z",
          expiresAt: "2026-04-15T08:12:00.000Z",
          diff: {
            field: "topic",
            before: "Old topic",
            after: "New topic",
          },
          requiresApproval: true,
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
  await page.getByRole("button", { name: "Review" }).click();

  await page.getByTestId("matrix-topic-room-id").fill("!room:matrix.example");
  await page.getByTestId("matrix-topic-text").fill("New topic");
  await page.getByRole("button", { name: "Prepare topic update" }).click();

  await page.getByTestId("matrix-topic-refresh").click();

  await expect(page.getByTestId("matrix-topic-refresh-error")).toContainText("matrix_plan_not_found");
  await expect(page.getByTestId("matrix-topic-refresh-error")).toContainText("not found");
  await expect(page.getByTestId("matrix-topic-plan")).toHaveCount(0);
  await expect(page.getByTestId("matrix-topic-execute")).toHaveCount(0);
});

test("Matrix room topic update stale-plan failure is surfaced and does not fake success", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });

  let verifyCount = 0;

  await page.route("**/api/matrix/actions/promote", async (route) => {
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
          type: "update_room_topic",
          roomId: "!room:matrix.example",
          status: "pending_review",
          createdAt: "2026-04-15T08:00:00.000Z",
          expiresAt: "2026-04-15T08:12:00.000Z",
          diff: {
            field: "topic",
            before: "Old topic",
            after: "New topic",
          },
          requiresApproval: true,
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
  await page.getByRole("button", { name: "Review" }).click();

  await page.getByTestId("matrix-topic-room-id").fill("!room:matrix.example");
  await page.getByTestId("matrix-topic-text").fill("New topic");
  await page.getByRole("button", { name: "Prepare topic update" }).click();

  await page.getByLabel("I approve backend execution of this topic update.").check();
  await page.getByTestId("matrix-topic-execute").click();

  await expect(page.getByTestId("matrix-topic-execute-error")).toContainText("matrix_stale_plan");
  await expect(page.getByTestId("matrix-topic-execute-error")).toContainText("stale");
  await expect(page.getByTestId("matrix-topic-execution")).toHaveCount(0);
  await expect(page.getByTestId("matrix-topic-verification")).toHaveCount(0);
  expect(verifyCount).toBe(0);
});

function connectionState(page: Page) {
  return page.getByTestId("chat-connection-state");
}
