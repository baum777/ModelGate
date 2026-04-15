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
  await expect(page.getByText("Thin consumer overlay for ModelGate")).toBeVisible();
  await expect(page.getByTestId("tab-chat")).toBeVisible();
  await expect(page.getByTestId("tab-matrix")).toBeVisible();
}

function submitChord() {
  return process.platform === "darwin" ? "Meta+Enter" : "Control+Enter";
}

test("app shell renders, tabs open, header shows backend truth, and secrets stay out of DOM text", async ({ page }) => {
  await installBaseMocks(page, { matrixStatus: "ok" });
  await loadConsole(page);

  await expect(page.locator("header.global-header").getByText("Backend healthy")).toBeVisible();
  await expect(page.locator("header.global-header").getByText("Public model alias: default")).toBeVisible();
  await expect(page.locator("header.global-header").getByText("modelgate-test · local · openrouter")).toBeVisible();

  await page.getByTestId("tab-chat").click();
  await expect(page.getByRole("heading", { name: "Chat" })).toBeVisible();
  await expect(page.getByTestId("chat-workspace")).toBeVisible();

  await page.getByTestId("tab-matrix").click();
  await expect(page.getByRole("heading", { name: "Matrix Workspace" })).toBeVisible();
  await expect(page.getByTestId("matrix-workspace")).toBeVisible();

  const body = page.locator("body");
  await expect(body).not.toContainText("openrouter/auto");
  await expect(body).not.toContainText("anthropic/claude-3.5-sonnet");
  await expect(body).not.toContainText("sk-test-openrouter-key");
  await expect(body).not.toContainText("sk-test-matrix-token");
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
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(page.locator(".message-list")).toHaveAttribute("aria-live", "polite");
  await expect(sendButton).toBeDisabled();
  await expect(connectionState).toHaveText("Idle");

  await composer.fill("Please harden the browser harness");
  await expect(sendButton).toBeEnabled();

  await composer.press(submitChord());

  await expect(sendButton).toBeDisabled();
  await expect(connectionState).toHaveText(/Submitting|Streaming|Completed/);
  await expect(page.getByText("Hello from mocked backend")).toBeVisible();
  await expect(connectionState).toHaveText("Completed");
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
  await expect(connectionState(page)).toHaveText("Idle");
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
  await expect(connectionState(page)).toHaveText("Error");
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
