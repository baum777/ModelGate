import { expect, test, type Page } from "@playwright/test";

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

async function installBaseMocks(page: Page) {
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
      body: JSON.stringify(INTEGRATIONS_STATUS_OK),
    });
  });

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
}

test("console boot performance stays within guardrails", async ({ page }) => {
  await page.addInitScript(() => {
    (globalThis as { __mosaicLongTaskCount?: number }).__mosaicLongTaskCount = 0;
    (globalThis as { __mosaicTotalBlockingTimeMs?: number }).__mosaicTotalBlockingTimeMs = 0;

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        (globalThis as { __mosaicLongTaskCount?: number }).__mosaicLongTaskCount =
          ((globalThis as { __mosaicLongTaskCount?: number }).__mosaicLongTaskCount ?? 0) + 1;
        (globalThis as { __mosaicTotalBlockingTimeMs?: number }).__mosaicTotalBlockingTimeMs =
          ((globalThis as { __mosaicTotalBlockingTimeMs?: number }).__mosaicTotalBlockingTimeMs ?? 0)
          + Math.max(0, entry.duration - 50);
      }
    });

    observer.observe({ type: "longtask", buffered: true });
  });

  await installBaseMocks(page);
  await page.goto("/console", { waitUntil: "domcontentloaded" });
  await page.getByTestId("app-shell").waitFor({ state: "visible" });
  await page.getByTestId("chat-workspace").waitFor({ state: "visible" });

  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const paintEntries = performance.getEntriesByType("paint");
    const fcp = paintEntries.find((entry) => entry.name === "first-contentful-paint")?.startTime ?? null;

    return {
      domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? null,
      loadMs: navigation?.loadEventEnd ?? null,
      firstContentfulPaintMs: fcp,
      longTaskCount: (globalThis as { __mosaicLongTaskCount?: number }).__mosaicLongTaskCount ?? 0,
      totalBlockingTimeMs: (globalThis as { __mosaicTotalBlockingTimeMs?: number }).__mosaicTotalBlockingTimeMs ?? 0,
    };
  });

  test.info().annotations.push({
    type: "perf",
    description: JSON.stringify(metrics),
  });
  console.log("console boot perf metrics", metrics);

  expect(metrics.domContentLoadedMs).not.toBeNull();
  expect(metrics.loadMs).not.toBeNull();
  expect(metrics.firstContentfulPaintMs).not.toBeNull();

  if (metrics.domContentLoadedMs !== null) {
    expect(metrics.domContentLoadedMs).toBeLessThan(7000);
  }
  if (metrics.loadMs !== null) {
    expect(metrics.loadMs).toBeLessThan(12000);
  }
  if (metrics.firstContentfulPaintMs !== null) {
    expect(metrics.firstContentfulPaintMs).toBeLessThan(4500);
  }

  expect(metrics.longTaskCount).toBeLessThan(20);
  expect(metrics.totalBlockingTimeMs).toBeLessThan(800);
});
