import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import process from "node:process";
import { chromium, devices } from "@playwright/test";

const outputDir = "/tmp/ui-audit";
mkdirSync(outputDir, { recursive: true });

const HEALTH_OK = {
  ok: true,
  service: "mosaicstacked-test",
  mode: "local",
  upstream: "openrouter",
  defaultModel: "default",
  allowedModelCount: 1,
  streaming: "sse",
};

const MODELS_OK = {
  ok: true,
  defaultModel: "default",
  models: ["default"],
  source: "backend-policy",
};

const DIAGNOSTICS_OK = {
  ok: true,
  service: "mosaicstacked-test",
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
    configured: true,
    ready: true,
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
};

const MATRIX_ROOMS_OK = {
  ok: true,
  rooms: [
    {
      roomId: "!room:matrix.example",
      name: "Room name",
      canonicalAlias: "#room:matrix.example",
      roomType: "room",
    },
  ],
};

const GITHUB_REPOS_OK = {
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
};

const OPENROUTER_STATUS_OK = {
  configured: false,
  models: [],
};

function runNpmSync(args, env) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npm, args, {
    stdio: "inherit",
    env,
  });

  if (result.status !== 0) {
    throw new Error(`npm ${args.join(" ")} failed`);
  }
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // keep waiting
    }
    await delay(250);
  }
  throw new Error(`Server did not become ready: ${url}`);
}

async function installMocks(page) {
  await page.route("**/health", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(HEALTH_OK) });
  });

  await page.route("**/models", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MODELS_OK) });
  });

  await page.route("**/diagnostics", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(DIAGNOSTICS_OK) });
  });

  await page.route("**/api/integrations/status", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(INTEGRATIONS_STATUS_OK) });
  });

  await page.route("**/settings/openrouter/status", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(OPENROUTER_STATUS_OK) });
  });

  await page.route("**/api/matrix/whoami", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MATRIX_WHOAMI_OK) });
  });

  await page.route("**/api/matrix/joined-rooms", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MATRIX_ROOMS_OK) });
  });

  await page.route("**/api/github/repos", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(GITHUB_REPOS_OK) });
  });

  await page.route("**/api/github/context", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        context: {
          repo: GITHUB_REPOS_OK.repos[0],
          ref: "main",
          baseSha: "abc123",
          question: "Describe the repository and propose the safest next action.",
          files: [],
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
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        plan: {
          planId: "plan-123",
          repo: GITHUB_REPOS_OK.repos[0],
          baseRef: "main",
          baseSha: "abc123",
          branchName: "mosaicstacked/demo-plan",
          targetBranch: "main",
          status: "pending_review",
          stale: false,
          requiresApproval: true,
          summary: "Demo plan",
          rationale: "Safe demonstration proposal.",
          riskLevel: "low_surface",
          citations: [],
          diff: [],
          generatedAt: "2026-04-16T08:00:00.000Z",
          expiresAt: "2026-04-16T09:00:00.000Z",
        },
      }),
    });
  });

  await page.route("**/api/journal/recent", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, entries: [] }) });
  });

  await page.route("**/chat", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
      },
      body: [
        "event: start",
        'data: {"ok":true,"model":"default"}',
        "",
        "event: done",
        'data: {"ok":true,"model":"default","text":"Mocked response"}',
        "",
      ].join("\n"),
    });
  });
}

async function captureScenario(browser, baseUrl, options) {
  const context = await browser.newContext(options.mobile ? devices["iPhone 13"] : {
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  await page.addInitScript((theme) => {
    localStorage.setItem("ms-theme", theme);
    localStorage.setItem("mg-theme", theme);
  }, options.theme);

  await installMocks(page);

  await page.goto(`${baseUrl}/console`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("app-shell").waitFor({ state: "visible" });
  await delay(350);

  await page.screenshot({ path: `${outputDir}/${options.prefix}-chat.png`, fullPage: true });

  if (!options.mobile) {
    const captures = [
      { tab: "tab-github", workspace: "github-workspace", name: "github" },
      { tab: "tab-matrix", workspace: "matrix-workspace", name: "matrix" },
      { tab: "tab-review", workspace: "review-workspace", name: "review" },
      { tab: "tab-settings", workspace: "settings-workspace", name: "settings" },
    ];

    for (const capture of captures) {
      await page.getByTestId(capture.tab).click();
      await page.getByTestId(capture.workspace).waitFor({ state: "visible" });
      await delay(350);
      await page.screenshot({ path: `${outputDir}/${options.prefix}-${capture.name}.png`, fullPage: true });
    }
  } else {
    await page.getByTestId("tab-github").click();
    await page.getByTestId("github-workspace").waitFor({ state: "visible" });
    await delay(250);
    await page.screenshot({ path: `${outputDir}/${options.prefix}-github.png`, fullPage: true });

    await page.getByTestId("tab-matrix").click();
    await page.getByTestId("matrix-workspace").waitFor({ state: "visible" });
    await delay(250);
    await page.screenshot({ path: `${outputDir}/${options.prefix}-matrix.png`, fullPage: true });

    await page.getByTestId("tab-context").click();
    await delay(250);
    await page.screenshot({ path: `${outputDir}/${options.prefix}-context.png`, fullPage: true });
  }

  await context.close();
}

const host = "127.0.0.1";
const port = 4173;
const baseUrl = `http://${host}:${port}`;
const env = {
  ...process.env,
  MOSAICSTACK_BROWSER_HOST: host,
  MOSAICSTACK_BROWSER_PORT: String(port),
  MOSAICSTACK_BROWSER_PORTS: String(port),
  VITE_API_BASE_URL: baseUrl,
};

runNpmSync(["run", "build:web"], env);

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const preview = spawn(npm, ["run", "preview", "--workspace", "web", "--", "--host", host, "--port", String(port), "--strictPort"], {
  stdio: "inherit",
  env,
});

const closePreview = () => {
  if (!preview.killed) {
    preview.kill("SIGTERM");
  }
};

process.on("SIGINT", closePreview);
process.on("SIGTERM", closePreview);

try {
  await waitForServer(`${baseUrl}/console`);

  const browser = await chromium.launch();

  await captureScenario(browser, baseUrl, { prefix: "desktop-dark", theme: "dark", mobile: false });
  await captureScenario(browser, baseUrl, { prefix: "desktop-light", theme: "light", mobile: false });
  await captureScenario(browser, baseUrl, { prefix: "mobile-dark", theme: "dark", mobile: true });
  await captureScenario(browser, baseUrl, { prefix: "mobile-light", theme: "light", mobile: true });

  await browser.close();
} finally {
  closePreview();
}
