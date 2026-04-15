import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    channel: "msedge",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: "node scripts/browser-preview-server.mjs",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 240_000
  }
});
